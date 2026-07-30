import { db } from "@/lib/db";
import { describeVariant } from "@/domain/barcode";
import { Scanner } from "./scanner";
import type { MapStatus } from "@prisma/client";

type Props = {
  stage: "SEPARATION" | "CONFERENCE";
  statuses: MapStatus[];
  empty: string;
};

/**
 * Fila de mapas de uma etapa. Server Component: os dados chegam renderizados,
 * sem o cliente ter que buscar o estado inteiro do sistema como na v1.
 */
export async function MapQueue({ stage, statuses, empty }: Props) {
  const maps = await db.cargoMap.findMany({
    where: { status: { in: statuses } },
    include: {
      items: { include: { product: true }, orderBy: { product: { description: "asc" } } },
      divergences: { where: { resolved: false } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (maps.length === 0) return <p className="muted">{empty}</p>;

  return (
    <>
      {maps.map((map) => {
        const done = map.items.reduce(
          (acc, item) => acc + (stage === "SEPARATION" ? item.separated : item.conferred),
          0,
        );
        const total = map.items.reduce((acc, item) => acc + item.quantity, 0);

        return (
          <section key={map.id} className="card">
            <h2 style={{ margin: 0 }}>
              Mapa {map.number}{" "}
              <span className="badge warn">
                {done}/{total}
              </span>
              {map.divergences.length > 0 && (
                <span className="badge danger" style={{ marginLeft: "0.4rem" }}>
                  {map.divergences.length} divergência(s)
                </span>
              )}
            </h2>
            <p className="muted">
              Criado por {map.createdBy} em {map.createdAt.toLocaleString("pt-BR")}
            </p>

            <Scanner mapId={map.id} stage={stage} />

            <div className="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Código</th>
                    <th>Lido</th>
                  </tr>
                </thead>
                <tbody>
                  {map.items.map((item) => {
                    const counted = stage === "SEPARATION" ? item.separated : item.conferred;
                    const complete = counted >= item.quantity;
                    return (
                      <tr key={item.id}>
                        {/* Descricao como linha principal: o operador confere
                            pelo nome do produto, nao pelo numero. */}
                        <td>
                          <strong>{item.product.description}</strong>
                          <br />
                          <span className="muted">{describeVariant(item.product)}</span>
                        </td>
                        <td className="muted">{item.product.barcode}</td>
                        <td>
                          <span className={`badge ${complete ? "ok" : "warn"}`}>
                            {counted}/{item.quantity}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}
