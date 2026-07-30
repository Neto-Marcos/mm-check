import { extractText, getDocumentProxy } from "unpdf";
import { db } from "@/lib/db";
import { ApiError, handler } from "@/lib/api";
import { record, requireUser } from "@/lib/auth";
import { invalidateCatalog } from "@/lib/catalog";
import { parseBalanceLines } from "@/domain/balance-pdf";

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Recebe o PDF de saldo como multipart/form-data.
 *
 * A v1 recebia o arquivo em base64 dentro de um JSON, o que inflava um PDF de
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
      throw new ApiError("Nenhuma variante válida foi encontrada no PDF. Confira o relatório.");
    }
    // Linhas que pareciam dado mas cujo saldo nao reconciliou com a descricao
    // sinalizam mudanca de layout no ERP. Importar mesmo assim seria pior que
    // recusar: entraria saldo errado sem ninguem perceber.
    if (metrics.unreconciled > 0) {
      throw new ApiError(
        `${metrics.unreconciled} linha(s) não reconciliaram o saldo com a descrição. ` +
          "O layout do relatório pode ter mudado — confira antes de importar.",
        422,
      );
    }

    const result = await db.$transaction(async (tx) => {
      const created = await tx.balanceImport.create({
        data: {
          fileName: file.name,
          importedBy: user.name,
          pages: metrics.pages,
          linesRead: metrics.linesRead,
          linesSkipped: metrics.linesSkipped,
          unreconciled: metrics.unreconciled,
        },
      });

      // Variantes ausentes do relatorio ficam inativas, nunca sao apagadas —
      // regra herdada da v1 para preservar historico de contagem.
      const barcodes = rows.map((row) => row.barcode);
      await tx.product.updateMany({
        where: { barcode: { notIn: barcodes } },
        data: { active: false },
      });

      for (const row of rows) {
        await tx.product.upsert({
          where: { code_gradeX_gradeY: { code: row.code, gradeX: row.gradeX, gradeY: row.gradeY } },
          create: {
            code: row.code,
            gradeX: row.gradeX,
            gradeY: row.gradeY,
            description: row.description,
            barcode: row.barcode,
            active: true,
          },
          // A descricao e reimportada: renomeacao no ERP se propaga sozinha.
          update: { description: row.description, barcode: row.barcode, active: true },
        });
      }

      const products = await tx.product.findMany({
        where: { barcode: { in: barcodes } },
        select: { id: true, barcode: true },
      });
      const idByBarcode = new Map(products.map((p) => [p.barcode, p.id]));

      await tx.balance.createMany({
        data: rows.map((row) => ({
          importId: created.id,
          productId: idByBarcode.get(row.barcode)!,
          systemQty: row.systemQty,
        })),
      });
      return created;
    });

    invalidateCatalog();
    await record(
      user.id,
      "balance_import",
      `Saldo importado de ${file.name} com ${rows.length} variantes`,
    );

    return {
      importId: result.id,
      variants: rows.length,
      products: new Set(rows.map((row) => row.code)).size,
      metrics,
      ignored: ignored.slice(0, 50),
    };
  })();
}
