import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, parseBody } from "@/lib/api";
import { record, requireUser } from "@/lib/auth";
import { loadCatalogIndex } from "@/lib/catalog";
import { describeVariant, normalizeBarcode, resolveIndexed } from "@/domain/barcode";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  barcode: z.string().trim().min(1, "Leia ou digite um código."),
  stage: z.enum(["SEPARATION", "CONFERENCE"]),
});

/**
 * Registra uma leitura de coletor.
 *
 * Vale para separacao e conferencia: muda so o contador incrementado e o
 * perfil exigido.
 *
 * O codigo e resolvido por lookup no catalogo, nao por fatiamento posicional.
 * A v1 assumia 7 digitos fixos e por isso recusava 18% do catalogo real, cujos
 * codigos tem de 6 a 10 digitos.
 *
 * TODA leitura vira uma linha em `scans`, aceita ou recusada — e o log
 * imutavel que sustenta a auditoria de divergencia.
 */
export async function POST(request: Request, { params }: Params) {
  return handler(async () => {
    const { id } = await params;
    const { barcode: raw, stage } = await parseBody(request, schema);
    const user = await requireUser(stage === "SEPARATION" ? "SEPARATION" : "EXPEDITION");
    const barcode = normalizeBarcode(raw);

    const map = await db.cargoMap.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });
    if (!map) throw new ApiError("Mapa não encontrado.", 404);

    const expectedStatus = stage === "SEPARATION" ? "SEPARATING" : "AWAITING_CONFERENCE";
    if (map.status !== expectedStatus && map.status !== "CONFERRING") {
      throw new ApiError(`O mapa ${map.number} não está nesta etapa.`, 409);
    }

    const reject = async (reason: string, productId?: string, itemId?: string) => {
      await db.scan.create({
        data: {
          mapId: id,
          itemId: itemId ?? null,
          productId: productId ?? null,
          stage,
          barcode,
          accepted: false,
          reason,
          scannedBy: user.name,
        },
      });
      return { accepted: false as const, reason };
    };

    const resolution = resolveIndexed(barcode, await loadCatalogIndex());
    if (!resolution.ok) {
      const result = await reject(resolution.reason);
      // Codigo desconhecido ou ambiguo e divergencia real: alguem precisa
      // olhar a etiqueta ou o cadastro.
      await db.divergence.create({
        data: {
          mapId: id,
          barcode,
          kind: resolution.failure,
          detail: `${resolution.reason} (etapa ${stage})`,
        },
      });
      return result;
    }

    const item = map.items.find((candidate) => candidate.product.barcode === barcode);
    if (!item) {
      const result = await reject(
        `${describeVariant(resolution.entry)} não pertence a este mapa`,
      );
      await db.divergence.create({
        data: {
          mapId: id,
          barcode,
          kind: "ITEM_FORA_DO_MAPA",
          detail: `${describeVariant(resolution.entry)} lido na etapa ${stage}`,
        },
      });
      return result;
    }

    const done = stage === "SEPARATION" ? item.separated : item.conferred;
    if (done >= item.quantity) {
      return reject("Quantidade já completa para este item", item.productId, item.id);
    }

    // Incremento condicional: dois coletores lendo a mesma peca ao mesmo tempo
    // nao passam do total, porque o where recheca a quantidade atual.
    const field = stage === "SEPARATION" ? "separated" : "conferred";
    const updated = await db.mapItem.updateMany({
      where: { id: item.id, [field]: { lt: item.quantity } },
      data: { [field]: { increment: 1 } },
    });
    if (updated.count === 0) {
      return reject("Quantidade já completa para este item", item.productId, item.id);
    }

    await db.scan.create({
      data: {
        mapId: id,
        itemId: item.id,
        productId: item.productId,
        stage,
        barcode,
        accepted: true,
        scannedBy: user.name,
      },
    });

    // Etapa concluida quando todas as variantes bateram a quantidade.
    const items = await db.mapItem.findMany({ where: { mapId: id } });
    const complete = items.every(
      (row) => (stage === "SEPARATION" ? row.separated : row.conferred) >= row.quantity,
    );
    if (complete) {
      await db.cargoMap.update({
        where: { id },
        data: {
          status: stage === "SEPARATION" ? "AWAITING_CONFERENCE" : "APPROVED",
          closedAt: stage === "CONFERENCE" ? new Date() : null,
        },
      });
      await record(
        user.id,
        `map_${stage.toLowerCase()}_done`,
        `Mapa ${map.number} concluiu ${stage}`,
      );
    }

    return {
      accepted: true,
      // O operador confere pelo nome do produto, nao pelo numero.
      product: describeVariant(resolution.entry),
      code: resolution.entry.code,
      counted: done + 1,
      quantity: item.quantity,
      mapComplete: complete,
    };
  })();
}
