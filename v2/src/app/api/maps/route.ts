import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, parseBody } from "@/lib/api";
import { record, requireUser } from "@/lib/auth";
import { barcodeForSku } from "@/domain/barcode";

const schema = z.object({
  number: z.string().trim().min(1, "Informe o número do mapa."),
  items: z
    .array(
      z.object({
        sku: z.string().trim().min(1, "SKU obrigatório."),
        color: z.string().trim().optional(),
        voltage: z.string().trim().optional(),
        quantity: z.number().int().positive("A quantidade deve ser maior que zero."),
      }),
    )
    .min(1, "O mapa precisa de pelo menos um item."),
});

/** Fila de mapas do perfil: separacao ve o que separar, expedicao o que conferir. */
export async function GET() {
  return handler(async () => {
    const user = await requireUser("SEPARATION", "EXPEDITION");
    const status =
      user.role === "SEPARATION"
        ? (["SEPARATING"] as const)
        : (["AWAITING_CONFERENCE", "CONFERRING", "BLOCKED"] as const);

    const maps = await db.cargoMap.findMany({
      where: user.role === "ADMIN" ? {} : { status: { in: [...status] } },
      include: { items: { orderBy: { sku: "asc" } }, divergences: { where: { resolved: false } } },
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
          ...item,
          barcode: barcodeForSku(item.sku),
          remaining:
            item.quantity - (map.status === "SEPARATING" ? item.separated : item.conferred),
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

    const map = await db.cargoMap.create({
      data: {
        number: body.number,
        createdBy: user.name,
        items: {
          create: body.items.map((item) => ({
            sku: item.sku,
            color: item.color || null,
            voltage: item.voltage || null,
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
