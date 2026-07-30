"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password"),
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Não foi possível entrar.");
      setBusy(false);
      return;
    }
    // refresh() reavalia o layout no servidor para o menu aparecer.
    router.replace("/");
    router.refresh();
  }

  return (
    <>
      <h1>MN Check</h1>
      <form className="card" onSubmit={submit}>
        {error && <p className="feedback danger">{error}</p>}
        <label htmlFor="username">Usuário</label>
        <input id="username" name="username" autoCapitalize="none" autoFocus required />
        <div style={{ height: "0.75rem" }} />
        <label htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" required />
        <div style={{ height: "1rem" }} />
        <button type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </>
  );
}
