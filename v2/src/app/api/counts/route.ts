import { db } from "@/lib/db";
import { ApiError, handler } from "@/lib/api";
import { record, requireUser } from "@/lib/auth";
import { evaluateLine, summarize } from "@/domain/counting";

/** Contagens abertas ou pausadas, para o operador retomar. */
export async function GET() {
  return handler(async () => {
    await requireUser("STOCK");
    const sessions = await db.countSession.findMany({
      where: { status: { in: ["OPEN", "PAUSED"] } },
      include: { items: true },
      orderBy: { startedAt: "desc" },
    });
    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        status: session.status,
        createdBy: session.createdBy,
        startedAt: session.startedAt,
        version: session.version,
        summary: summarize(session.items.map(evaluateLine)),
      })),
    };
  })();
}

/**
 * Abre uma contagem sobre o import de saldo mais recente.
 *
 * O snapshot e materializado em count_items no momento da abertura: um import
 * novo no meio da contagem nao muda mais a base de comparacao.
 */
export async function POST() {
  return handler(async () => {
    const user = await requireUser("STOCK");

    const latest = await db.balanceImport.findFirst({
      orderBy: { createdAt: "desc" },
      include: { balances: true },
    });
    if (!latest || latest.balances.length === 0) {
      throw new ApiError("Importe um PDF de saldo antes de abrir uma contagem.", 409);
    }

    const open = await db.countSession.findFirst({ where: { status: "OPEN" } });
    if (open) throw new ApiError("Já existe uma contagem aberta. Finalize ou cancele antes.", 409);

    const session = await db.countSession.create({
      data: {
        createdBy: user.name,
        importId: latest.id,
        items: {
          create: latest.balances.map((balance) => ({
            sku: balance.sku,
            systemQty: balance.systemQty,
          })),
        },
      },
      include: { items: true },
    });

    await record(user.id, "count_open", `Contagem ${session.id} aberta com ${session.items.length} SKUs`);
    return { id: session.id, items: session.items.length };
  })();
}
