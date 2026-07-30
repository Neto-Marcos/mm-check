"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Item = { barcode: string; label: string; quantity: number };

/**
 * Montagem do mapa bipando o codigo.
 *
 * Cada leitura e resolvida contra o catalogo ANTES de entrar na lista, e o
 * operador ve a descricao do produto. Assim uma etiqueta trocada aparece na
 * hora, e nao no meio da separacao.
 */
export function NewMapForm() {
  const router = useRouter();
  const codeRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [number, setNumber] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function addItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = codeRef.current?.value.trim();
    if (!code) return;

    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/catalog/lookup?code=${encodeURIComponent(code)}`);
    const data = await response.json();
    setBusy(false);

    if (!response.ok || !data.found) {
      setMessage({ ok: false, text: data.reason ?? data.error ?? "Código não reconhecido." });
      return;
    }

    const barcode = `${data.code}.${data.gradeX}.${data.gradeY}`;
    setItems((current) => {
      // Bipar de novo a mesma variante soma, em vez de criar linha duplicada —
      // o mapa recusaria duas linhas do mesmo produto.
      const existing = current.find((item) => item.barcode === barcode);
      if (existing) {
        return current.map((item) =>
          item.barcode === barcode ? { ...item, quantity: item.quantity + quantity } : item,
        );
      }
      return [...current, { barcode, label: data.label, quantity }];
    });

    setMessage({ ok: true, text: `${data.label} · ${quantity} un.` });
    if (codeRef.current) codeRef.current.value = "";
    setQuantity(1);
    codeRef.current?.focus();
  }

  function remove(barcode: string) {
    setItems((current) => current.filter((item) => item.barcode !== barcode));
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/maps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        number: number.trim(),
        items: items.map((item) => ({ barcode: item.barcode, quantity: item.quantity })),
      }),
    });
    const data = await response.json();
    setBusy(false);

    if (!response.ok) {
      setMessage({ ok: false, text: data.error ?? "Não foi possível criar o mapa." });
      return;
    }
    router.push("/separacao");
    router.refresh();
  }

  const total = items.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <>
      {message && <p className={`feedback ${message.ok ? "ok" : "danger"}`}>{message.text}</p>}

      <section className="card">
        <label htmlFor="numero">Número do mapa</label>
        <input
          id="numero"
          value={number}
          onChange={(event) => setNumber(event.target.value)}
          placeholder="MAPA-001"
          autoComplete="off"
        />

        <form onSubmit={addItem} style={{ marginTop: "1rem" }}>
          <div className="row">
            <div style={{ flex: "2 1 12rem" }}>
              <label htmlFor="codigo">Código do produto</label>
              <input
                id="codigo"
                ref={codeRef}
                inputMode="text"
                placeholder="74968.1.2"
                autoComplete="off"
                autoFocus
              />
            </div>
            <div style={{ flex: "1 1 6rem" }}>
              <label htmlFor="qtd">Quantidade</label>
              <input
                id="qtd"
                type="number"
                min={1}
                value={quantity}
                onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
              />
            </div>
            <button type="submit" disabled={busy} style={{ flex: "0 0 auto" }}>
              Adicionar
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>
          Itens do mapa{" "}
          <span className="badge warn">
            {items.length} variantes · {total} un.
          </span>
        </h2>

        {items.length === 0 ? (
          <p className="muted">Bipe o primeiro produto para começar.</p>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Código</th>
                  <th>Qtd.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.barcode}>
                    <td>{item.label}</td>
                    <td className="muted">{item.barcode}</td>
                    <td>{item.quantity}</td>
                    <td>
                      <button className="ghost" onClick={() => remove(item.barcode)} disabled={busy}>
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          onClick={save}
          disabled={busy || items.length === 0 || number.trim() === ""}
          style={{ marginTop: "1rem" }}
        >
          Criar mapa
        </button>
      </section>
    </>
  );
}
