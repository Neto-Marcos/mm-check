import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { evaluateLine } from "@/domain/counting";
import { CountSheet } from "./count-sheet";
import { BalanceUpload } from "./balance-upload";

export const dynamic = "force-dynamic";

export default async function ContagemPage() {
  await requireUser("STOCK");

  const [session, lastImport] = await Promise.all([
    db.countSession.findFirst({
      where: { status: { in: ["OPEN", "PAUSED"] } },
      include: { items: { orderBy: { sku: "asc" } } },
      orderBy: { startedAt: "desc" },
    }),
    db.balanceImport.findFirst({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { balances: true } } },
    }),
  ]);

  const lines = session?.items.map(evaluateLine) ?? [];

  return (
    <>
      <h1>Contagem de estoque</h1>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Saldo do sistema</h2>
        {lastImport ? (
          <p className="muted">
            {lastImport._count.balances} SKUs · {lastImport.fileName} · importado por{" "}
            {lastImport.importedBy} em {lastImport.createdAt.toLocaleString("pt-BR")}
            {lastImport.linesSkipped > 0 && ` · ${lastImport.linesSkipped} linha(s) ignorada(s)`}
          </p>
        ) : (
          <p className="muted">Nenhum saldo importado ainda.</p>
        )}
        <BalanceUpload />
      </section>

      {session ? (
        <CountSheet
          sessionId={session.id}
          version={session.version}
          status={session.status}
          lines={lines}
        />
      ) : (
        <CountSheet.Start hasBalance={Boolean(lastImport)} />
      )}
    </>
  );
}
