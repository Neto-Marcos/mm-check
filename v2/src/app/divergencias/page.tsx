import { db } from "@/lib/db";
import { requirePage } from "@/lib/guard";
import { ResolveButton } from "./resolve-button";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  PRODUTO_DESCONHECIDO: "Produto fora do catálogo",
  AMBIGUO: "Código ambíguo",
  ITEM_FORA_DO_MAPA: "Item fora do mapa",
};

export default async function DivergenciasPage() {
  await requirePage("EXPEDITION");

  const [open, rejected] = await Promise.all([
    db.divergence.findMany({
      where: { resolved: false },
      include: { map: true },
      orderBy: { createdAt: "desc" },
    }),
    // Evidencia de auditoria: as leituras recusadas, que sao o que originou as
    // divergencias acima.
    db.scan.findMany({
      where: { accepted: false },
      include: { map: true },
      orderBy: { scannedAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <>
      <h1>Divergências</h1>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>
          Em aberto <span className={`badge ${open.length > 0 ? "danger" : "ok"}`}>{open.length}</span>
        </h2>

        {open.length === 0 ? (
          <p className="muted">Nenhuma divergência aberta.</p>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Ocorrência</th>
                  <th>Mapa</th>
                  <th>Quando</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {open.map((item) => (
                  <tr key={item.id}>
                    <td style={{ minWidth: "16rem" }}>
                      <span className="badge danger">{KIND_LABEL[item.kind] ?? item.kind}</span>
                      <br />
                      <strong>{item.detail}</strong>
                      <br />
                      <span className="muted">código {item.barcode}</span>
                    </td>
                    <td>{item.map.number}</td>
                    <td className="muted">{item.createdAt.toLocaleString("pt-BR")}</td>
                    <td>
                      <ResolveButton id={item.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Últimas leituras recusadas</h2>
        <p className="muted">
          Registro imutável de toda bipada recusada, com o motivo. É a evidência para tratar a
          divergência — nada aqui é apagado.
        </p>
        {rejected.length === 0 ? (
          <p className="muted">Nenhuma leitura recusada.</p>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Motivo</th>
                  <th>Código</th>
                  <th>Mapa</th>
                  <th>Etapa</th>
                  <th>Quem</th>
                  <th>Quando</th>
                </tr>
              </thead>
              <tbody>
                {rejected.map((scan) => (
                  <tr key={scan.id}>
                    <td>{scan.reason}</td>
                    <td className="muted">{scan.barcode}</td>
                    <td>{scan.map.number}</td>
                    <td>{scan.stage === "SEPARATION" ? "Separação" : "Conferência"}</td>
                    <td>{scan.scannedBy}</td>
                    <td className="muted">{scan.scannedAt.toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
