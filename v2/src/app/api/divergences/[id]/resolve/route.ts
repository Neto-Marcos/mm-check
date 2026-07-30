import { db } from "@/lib/db";
import { ApiError, handler } from "@/lib/api";
import { record, requireUser } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

/**
 * Da baixa numa divergencia.
 *
 * A divergencia nunca e apagada: fica marcada como resolvida, com quem
 * resolveu. As leituras que a originaram continuam intactas em `scans` — a
 * baixa registra o tratamento, nao apaga o ocorrido.
 */
export async function POST(_request: Request, { params }: Params) {
  return handler(async () => {
    const user = await requireUser("EXPEDITION");
    const { id } = await params;

    const divergence = await db.divergence.findUnique({ where: { id } });
    if (!divergence) throw new ApiError("Divergência não encontrada.", 404);
    if (divergence.resolved) throw new ApiError("Esta divergência já foi tratada.", 409);

    await db.divergence.update({
      where: { id },
      data: { resolved: true, resolvedBy: user.name },
    });

    await record(
      user.id,
      "divergence_resolve",
      `${user.name} tratou a divergência ${divergence.kind} do código ${divergence.barcode}`,
    );
    return { ok: true };
  })();
}
