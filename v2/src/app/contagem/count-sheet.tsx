"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CountLine } from "@/domain/counting";
import { evaluateLine, summarize } from "@/domain/counting";

type Props = {
  sessionId: string;
  version: number;
  status: string;
  lines: CountLine[];
};

type Draft = Record<string, { countedQty: number; damagedQty: number; otherQty: number }>;

function toDraft(lines: CountLine[]): Draft {
  return Object.fromEntries(
    lines.map((line) => [
      line.sku,
      {
        countedQty: line.countedQty,
        damagedQty: line.damagedQty,
        otherQty: line.otherQty,
      },
    ]),
  );
}

export function CountSheet({ sessionId, version, status, lines }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(lines));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // Só os SKUs tocados sobem no save — o v1 reenviava a planilha inteira.
  const [touched, setTouched] = useState<Set<string>>(new Set());

  // Recalcula ao vivo com a mesma função que o servidor usa, então a prévia
  // nunca diverge do resultado gravado.
  const preview = lines.map((line) =>
    evaluateLine({ ...line, ...draft[line.sku] }),
  );
  const live = summarize(preview);

  function update(sku: string, field: keyof Draft[string], raw: string) {
    const value = Math.max(0, Number.parseInt(raw, 10) || 0);
    setDraft((current) => ({ ...current, [sku]: { ...current[sku], [field]: value } }));
    setTouched((current) => new Set(current).add(sku));
  }

  async function save(nextStatus?: "PAUSED" | "CLOSED" | "CANCELLED") {
    setBusy(true);
    setMessage(null);

    const response = await fetch(`/api/counts/${sessionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        version,
        status: nextStatus,
        items: [...touched].map((sku) => ({ sku, ...draft[sku] })),
      }),
    });
    const data = await response.json();
    setBusy(false);

    if (!response.ok) {
      // 409 = alguém salvou antes. O operador recarrega em vez de sobrescrever.
      setMessage({ ok: false, text: data.error ?? "Falha ao salvar." });
      return;
    }
    setTouched(new Set());
    setMessage({ ok: true, text: "Contagem salva." });
    router.refresh();
  }

  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>
        Contagem em andamento <span className="badge warn">{status}</span>
      </h2>

      {message && <p className={`feedback ${message.ok ? "ok" : "danger"}`}>{message.text}</p>}

      <p className="muted">
        {live.total} SKUs · <strong>{live.ok}</strong> ok · {live.falta} falta · {live.sobra} sobra ·
        líquido {live.net > 0 ? `+${live.net}` : live.net}
      </p>

      <div className="scroll-x">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Sistema</th>
              <th>Contado</th>
              <th>Avariado</th>
              <th>Outros</th>
              <th>Dif.</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((line) => (
              <tr key={line.sku}>
                <td>{line.sku}</td>
                <td className="muted">{line.systemQty}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    aria-label={`Contado ${line.sku}`}
                    value={draft[line.sku]?.countedQty ?? 0}
                    onChange={(event) => update(line.sku, "countedQty", event.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    aria-label={`Avariado ${line.sku}`}
                    value={draft[line.sku]?.damagedQty ?? 0}
                    onChange={(event) => update(line.sku, "damagedQty", event.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    aria-label={`Outros ${line.sku}`}
                    value={draft[line.sku]?.otherQty ?? 0}
                    onChange={(event) => update(line.sku, "otherQty", event.target.value)}
                  />
                </td>
                <td>
                  <span
                    className={`badge ${
                      line.status === "OK" ? "ok" : line.status === "FALTA" ? "danger" : "warn"
                    }`}
                  >
                    {line.difference > 0 ? `+${line.difference}` : line.difference}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ marginTop: "1rem" }}>
        <button onClick={() => save()} disabled={busy || touched.size === 0}>
          Salvar {touched.size > 0 && `(${touched.size})`}
        </button>
        <button className="ghost" onClick={() => save("PAUSED")} disabled={busy}>
          Pausar
        </button>
        <button className="ghost" onClick={() => save("CLOSED")} disabled={busy}>
          Finalizar
        </button>
      </div>
    </section>
  );
}

/** Estado vazio: abre uma contagem nova sobre o último saldo importado. */
CountSheet.Start = function Start({ hasBalance }: { hasBalance: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/counts", { method: "POST" });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? "Não foi possível abrir a contagem.");
      return;
    }
    router.refresh();
  }

  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Nenhuma contagem aberta</h2>
      {error && <p className="feedback danger">{error}</p>}
      <p className="muted">
        A contagem congela o saldo do momento em que é aberta, então um import novo no meio do
        processo não muda a base de comparação.
      </p>
      <button onClick={open} disabled={busy || !hasBalance}>
        {hasBalance ? "Abrir contagem" : "Importe um saldo primeiro"}
      </button>
    </section>
  );
};
