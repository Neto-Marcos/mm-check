import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, parseBody } from "@/lib/api";
import { record, requireUser } from "@/lib/auth";
import { evaluateLine, summarize } from "@/domain/counting";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  // Versao que o cliente leu. Se o banco avancou, alguem salvou antes dele.
  version: z.number().int().min(0),
  status: z.enum(["OPEN", "PAUSED", "CLOSED", "CANCELLED"]).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "Produto inválido na contagem."),
        countedQty: z.number().int().min(0, "As quantidades não podem ser negativas."),
        damagedQty: z.number().int().min(0).default(0),
        otherQty: z.number().int().min(0).default(0),
      }),
    )
    .default([]),
});

export async function GET(_request: Request, { params }: Params) {
  return handler(async () => {
    await requireUser("STOCK");
    const { id } = await params;
    const session = await db.countSession.findUnique({
      where: { id },
      include: { items: { include: { product: true }, orderBy: { product: { description: "asc" } } } },
    });
    if (!session) throw new ApiError("Contagem não encontrada.", 404);

    const lines = session.items.map(evaluateLine);
    return {
      id: session.id,
      status: session.status,
      version: session.version,
      items: lines,
      summary: summarize(lines),
    };
  })();
}

/**
 * Salva parcialmente uma contagem.
 *
 * Grava apenas as variantes enviadas — o v1 reescrevia a lista inteira a cada save,
 * o que fazia dois operadores na mesma contagem apagarem o trabalho um do
 * outro. Aqui a versao protege: se ela nao bate, o cliente recebe 409 e
 * recarrega em vez de sobrescrever.
 */
export async function PATCH(request: Request, { params }: Params) {
  return handler(async () => {
    const user = await requireUser("STOCK");
    const { id } = await params;
    const body = await parseBody(request, schema);

    const updated = await db.$transaction(async (tx) => {
      const session = await tx.countSession.findUnique({ where: { id } });
      if (!session) throw new ApiError("Contagem não encontrada.", 404);
      if (session.status === "CLOSED" || session.status === "CANCELLED") {
        throw new ApiError("Esta contagem já foi encerrada.", 409);
      }
      if (session.version !== body.version) {
        throw new ApiError(
          "Esta contagem foi alterada por outro usuário. Recarregue antes de salvar.",
          409,
        );
      }

      for (const item of body.items) {
        // updateMany com sessionId no where: um item de outra contagem nunca
        // e atingido, mesmo que o cliente mande o id errado.
        const changed = await tx.countItem.updateMany({
          where: { sessionId: id, productId: item.productId },
          data: {
            countedQty: item.countedQty,
            damagedQty: item.damagedQty,
            otherQty: item.otherQty,
            countedAt: new Date(),
          },
        });
        if (changed.count === 0) {
          throw new ApiError(`Produto não pertence ao saldo desta contagem: ${item.productId}`);
        }
      }

      const status = body.status ?? session.status;
      return tx.countSession.update({
        where: { id },
        data: {
          status,
          version: { increment: 1 },
          closedAt: status === "CLOSED" || status === "CANCELLED" ? new Date() : null,
        },
        include: { items: { include: { product: true }, orderBy: { product: { description: "asc" } } } },
      });
    });

    const lines = updated.items.map(evaluateLine);
    await record(
      user.id,
      "count_update",
      `Contagem ${id} atualizada em ${body.items.length} variante(s) (${updated.status})`,
    );

    return {
      id: updated.id,
      status: updated.status,
      version: updated.version,
      items: lines,
      summary: summarize(lines),
    };
  })();
}
