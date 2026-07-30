import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, parseBody } from "@/lib/api";
import { record, requireUser } from "@/lib/auth";
import { describeVariant, normalizeBarcode } from "@/domain/barcode";

const schema = z.object({
  number: z.string().trim().min(1, "Informe o número do mapa."),
  items: z
    .array(
      z.object({
        // O mapa e montado bipando ou digitando o codigo da variante, que e a
        // mesma chave usada no coletor.
        barcode: z.string().trim().min(1, "Código obrigatório."),
        quantity: z.number().int().positive("A quantidade deve ser maior que zero."),
      }),
    )
    .min(1, "O mapa precisa de pelo menos um item."),
});

/** Fila de mapas do perfil: separacao ve o que separar, expedicao o que conferir. */
export async function GET() {
  return handler(async () => {
    const user = await requireUser("SEPARATION", "EXPEDITION");
    const statuses =
      user.role === "SEPARATION"
        ? (["SEPARATING"] as const)
        : (["AWAITING_CONFERENCE", "CONFERRING", "BLOCKED"] as const);

    const maps = await db.cargoMap.findMany({
      where: user.role === "ADMIN" ? {} : { status: { in: [...statuses] } },
      include: {
        items: { include: { product: true } },
        divergences: { where: { resolved: false } },
      },
      orderBy: { createdAt: "asc" },
    });

    return {
      maps: maps.map((map) => ({
        id: map.id,
        number: map.number,
        status: map.status,
        createdBy: map.createdBy,
        createdAt: map.createdAt,
        divergences: map.divergences.length,
        items: map.items.map((item) => ({
          id: item.id,
          barcode: item.product.barcode,
          product: describeVariant(item.product),
          quantity: item.quantity,
          counted: map.status === "SEPARATING" ? item.separated : item.conferred,
        })),
      })),
    };
  })();
}

export async function POST(request: Request) {
  return handler(async () => {
    const user = await requireUser("SEPARATION");
    const body = await parseBody(request, schema);

    const exists = await db.cargoMap.findUnique({ where: { number: body.number } });
    if (exists) throw new ApiError(`O mapa ${body.number} já existe.`, 409);

    // Resolve todas as variantes antes de criar: um codigo fora do catalogo
    // aborta o mapa inteiro em vez de gerar um item orfao.
    const barcodes = body.items.map((item) => normalizeBarcode(item.barcode));
    const products = await db.product.findMany({
      where: { barcode: { in: barcodes } },
      select: { id: true, barcode: true },
    });
    const idByBarcode = new Map(products.map((product) => [product.barcode, product.id]));

    const missing = barcodes.filter((barcode) => !idByBarcode.has(barcode));
    if (missing.length > 0) {
      throw new ApiError(
        `Código(s) fora do saldo importado: ${missing.join(", ")}. Importe o saldo atual.`,
      );
    }

    const map = await db.cargoMap.create({
      data: {
        number: body.number,
        createdBy: user.name,
        items: {
          create: body.items.map((item, index) => ({
            productId: idByBarcode.get(barcodes[index]!)!,
            quantity: item.quantity,
          })),
        },
      },
      include: { items: true },
    });

    await record(user.id, "map_create", `Mapa ${map.number} criado com ${map.items.length} itens`);
    return { id: map.id, number: map.number, items: map.items.length };
  })();
}
