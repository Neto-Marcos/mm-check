import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { CountSheet, type SheetLine } from "./count-sheet";
import { BalanceUpload } from "./balance-upload";

export const dynamic = "force-dynamic";

export default async function ContagemPage() {
  await requireUser("STOCK");

  const [session, lastImport] = await Promise.all([
    db.countSession.findFirst({
      where: { status: { in: ["OPEN", "PAUSED"] } },
      include: {
        items: { include: { product: true }, orderBy: { product: { description: "asc" } } },
      },
      orderBy: { startedAt: "desc" },
    }),
    db.balanceImport.findFirst({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { balances: true } } },
    }),
  ]);

  const lines: SheetLine[] =
    session?.items.map((item) => ({
      productId: item.productId,
      code: item.product.code,
      gradeX: item.product.gradeX,
      gradeY: item.product.gradeY,
      description: item.product.description,
      barcode: item.product.barcode,
      systemQty: item.systemQty,
      countedQty: item.countedQty,
      damagedQty: item.damagedQty,
      otherQty: item.otherQty,
    })) ?? [];

  return (
    <>
      <h1>Contagem de estoque</h1>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Saldo do sistema</h2>
        {lastImport ? (
          <p className="muted">
            {lastImport._count.balances} variantes · {lastImport.fileName} · importado por{" "}
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
