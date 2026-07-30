"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ResolveButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve() {
    if (!window.confirm("Confirma que esta divergência foi tratada?")) return;
    setBusy(true);
    setError(null);

    const response = await fetch(`/api/divergences/${id}/resolve`, { method: "POST" });
    setBusy(false);
    if (!response.ok) {
      const data = await response.json();
      setError(data.error ?? "Não foi possível dar baixa.");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <button className="ghost" onClick={resolve} disabled={busy}>
        Dar baixa
      </button>
      {error && <p className="muted">{error}</p>}
    </>
  );
}
