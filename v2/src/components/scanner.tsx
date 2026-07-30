"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Props = { mapId: string; stage: "SEPARATION" | "CONFERENCE" };

type Feedback = { ok: boolean; message: string };

/**
 * Campo de leitura do coletor.
 *
 * O coletor USB/Bluetooth se comporta como teclado e emite Enter ao final,
 * entao um <form> comum ja captura a leitura. O campo se limpa e refoca
 * sozinho para o operador ler em sequencia sem tocar na tela.
 */
export function Scanner({ mapId, stage }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const barcode = inputRef.current?.value.trim();
    if (!barcode || busy) return;

    setBusy(true);
    const response = await fetch(`/api/maps/${mapId}/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ barcode, stage }),
    });
    const data = await response.json();
    setBusy(false);

    if (!response.ok) {
      setFeedback({ ok: false, message: data.error ?? "Falha ao registrar a leitura." });
    } else if (data.accepted) {
      // Confirma pelo nome do produto: o operador valida o que tem na mão,
      // não um número que ele não tem como conferir.
      setFeedback({
        ok: true,
        message: `${data.product} — ${data.counted}/${data.quantity}${
          data.mapComplete ? " · mapa concluído" : ""
        }`,
      });
      router.refresh();
    } else {
      setFeedback({ ok: false, message: data.reason ?? "Leitura recusada." });
    }

    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.focus();
  }

  return (
    <form onSubmit={submit}>
      {feedback && (
        <p className={`feedback ${feedback.ok ? "ok" : "danger"}`} role="status" aria-live="polite">
          {feedback.message}
        </p>
      )}
      <label htmlFor={`scan-${mapId}`}>Leia o código de barras</label>
      <input
        id={`scan-${mapId}`}
        ref={inputRef}
        // Texto, não numérico: o código traz separadores ("74968.1.2") e o
        // teclado numérico do celular esconde o ponto.
        inputMode="text"
        autoComplete="off"
        autoFocus
        placeholder="74968.1.2"
        disabled={busy}
      />
    </form>
  );
}
