"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Envia o PDF de saldo como multipart — o arquivo vai como binário,
 * sem virar string base64 no caminho.
 */
export function BalanceUpload() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setMessage(null);
    const body = new FormData();
    body.append("file", file);

    const response = await fetch("/api/balance/import", { method: "POST", body });
    const data = await response.json();
    setBusy(false);
    event.target.value = "";

    if (!response.ok) {
      setMessage({ ok: false, text: data.error ?? "Falha ao importar o PDF." });
      return;
    }
    setMessage({
      ok: true,
      text: `${data.variants} variantes de ${data.products} produtos, em ${data.metrics.pages} folha(s).`,
    });
    router.refresh();
  }

  return (
    <>
      {message && (
        <p className={`feedback ${message.ok ? "ok" : "danger"}`}>{message.text}</p>
      )}
      <label htmlFor="balance-pdf">Importar PDF de saldo</label>
      <input
        id="balance-pdf"
        type="file"
        accept="application/pdf"
        onChange={upload}
        disabled={busy}
      />
      {busy && <p className="muted">Lendo o PDF…</p>}
    </>
  );
}
