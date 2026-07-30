import { extractText, getDocumentProxy } from "unpdf";
import { db } from "@/lib/db";
import { ApiError, handler } from "@/lib/api";
import { record, requireUser } from "@/lib/auth";
import { parseBalanceLines } from "@/domain/balance-pdf";

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Recebe o PDF como multipart/form-data.
 *
 * O v1 recebia o arquivo em base64 dentro de um JSON, o que inflava um PDF de
 * 25 MB para ~33 MB de string e derrubava o container. Aqui o arquivo chega
 * como binario e vira Uint8Array direto.
 */
export async function POST(request: Request) {
  return handler(async () => {
    const user = await requireUser("STOCK");

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError("Selecione um PDF de saldo.");
    if (file.type && file.type !== "application/pdf") {
      throw new ApiError("O arquivo de saldo deve ser um PDF.");
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      throw new ApiError("O PDF deve ter entre 1 byte e 25 MB.");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = (Array.isArray(text) ? text : [text]).map((page) => page.split("\n"));

    const { rows, ignored, metrics } = parseBalanceLines(pages);
    if (rows.length === 0) {
      throw new ApiError("Nenhum SKU válido foi encontrado no PDF. Confira o relatório.");
    }

    // Uma transacao: ou o import inteiro entra, ou nada entra.
    const result = await db.$transaction(async (tx) => {
      const created = await tx.balanceImport.create({
        data: {
          fileName: file.name,
          importedBy: user.name,
          pages: metrics.pages,
          linesRead: metrics.linesRead,
          linesSkipped: metrics.linesSkipped,
          duplicates: metrics.duplicates,
        },
      });

      // Produtos ausentes do relatorio ficam inativos, nunca apagados —
      // regra herdada do v1 para preservar historico.
      const skus = rows.map((row) => row.sku);
      await tx.product.updateMany({ where: { sku: { notIn: skus } }, data: { active: false } });
      for (const sku of skus) {
        await tx.product.upsert({
          where: { sku },
          create: { sku, active: true },
          update: { active: true },
        });
      }
      await tx.balance.createMany({
        data: rows.map((row) => ({ importId: created.id, sku: row.sku, systemQty: row.systemQty })),
      });
      return created;
    });

    await record(user.id, "balance_import", `Saldo importado de ${file.name} com ${rows.length} SKUs`);

    return {
      importId: result.id,
      skus: rows.length,
      metrics,
      // Devolve so uma amostra: o relatorio completo fica no banco.
      ignored: ignored.slice(0, 50),
    };
  })();
}
