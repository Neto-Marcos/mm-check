import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, parseBody } from "@/lib/api";
import { record, requireUser } from "@/lib/auth";
import { barcodeForSku, parseBarcode, validateScan } from "@/domain/barcode";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  barcode: z.string().trim().min(1, "Leia ou digite um código."),
  stage: z.enum(["SEPARATION", "CONFERENCE"]),
});

/**
 * Registra uma leitura de coletor.
 *
 * Vale para separacao e conferencia: muda so o contador incrementado e o
 * perfil exigido. TODA leitura vira uma linha em `scans`, aceita ou recusada —
 * e o log imutavel que sustenta a auditoria de divergencia.
 */
export async function POST(request: Request, { params }: Params) {
  return handler(async () => {
    const { id } = await params;
    const { barcode, stage } = await parseBody(request, schema);
    const user = await requireUser(stage === "SEPARATION" ? "SEPARATION" : "EXPEDITION");

    const map = await db.cargoMap.findUnique({ where: { id }, include: { items: true } });
    if (!map) throw new ApiError("Mapa não encontrado.", 404);

    const expectedStatus = stage === "SEPARATION" ? "SEPARATING" : "AWAITING_CONFERENCE";
    if (map.status !== expectedStatus && map.status !== "CONFERRING") {
      throw new ApiError(`O mapa ${map.number} não está nesta etapa.`, 409);
    }

    // parseBarcode lanca em codigo malformado; o catch registra a recusa
    // antes de propagar, para leitura ruim tambem ficar auditada.
    let scannedSku: string | null = null;
    const reject = async (reason: string, itemId?: string) => {
      await db.scan.create({
        data: {
          mapId: id,
          itemId: itemId ?? null,
          stage,
          barcode,
          sku: scannedSku,
          accepted: false,
          reason,
          scannedBy: user.name,
        },
      });
      return { accepted: false as const, reason };
    };

    try {
      scannedSku = parseBarcode(barcode).sku;
    } catch (error) {
      return reject(error instanceof Error ? error.message : "Código inválido.");
    }

    const item = map.items.find((candidate) => {
      const verdict = validateScan(barcodeForSku(candidate.sku), barcode);
      return verdict.accepted;
    });
    if (!item) {
      const result = await reject("Produto não pertence a este mapa");
      await db.divergence.create({
        data: {
          mapId: id,
          sku: scannedSku ?? barcode,
          kind: "ITEM_FORA_DO_MAPA",
          detail: `Leitura ${barcode} na etapa ${stage}`,
        },
      });
      return result;
    }

    const done = stage === "SEPARATION" ? item.separated : item.conferred;
    if (done >= item.quantity) {
      return reject("Quantidade já completa para este item", item.id);
    }

    // Incremento condicional: dois coletores lendo a mesma peca ao mesmo tempo
    // nao passam do total, porque o where checa a quantidade atual.
    const field = stage === "SEPARATION" ? "separated" : "conferred";
    const updated = await db.mapItem.updateMany({
      where: { id: item.id, [field]: { lt: item.quantity } },
      data: { [field]: { increment: 1 } },
    });
    if (updated.count === 0) return reject("Quantidade já completa para este item", item.id);

    await db.scan.create({
      data: {
        mapId: id,
        itemId: item.id,
        stage,
        barcode,
        sku: item.sku,
        accepted: true,
        scannedBy: user.name,
      },
    });

    // Etapa concluida quando todos os itens bateram a quantidade.
    const items = await db.mapItem.findMany({ where: { mapId: id } });
    const complete = items.every((row) => (stage === "SEPARATION" ? row.separated : row.conferred) >= row.quantity);
    if (complete) {
      await db.cargoMap.update({
        where: { id },
        data: {
          status: stage === "SEPARATION" ? "AWAITING_CONFERENCE" : "APPROVED",
          closedAt: stage === "CONFERENCE" ? new Date() : null,
        },
      });
      await record(user.id, `map_${stage.toLowerCase()}_done`, `Mapa ${map.number} concluiu ${stage}`);
    }

    return {
      accepted: true,
      sku: item.sku,
      counted: done + 1,
      quantity: item.quantity,
      mapComplete: complete,
    };
  })();
}
