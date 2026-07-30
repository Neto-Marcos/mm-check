"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      className="ghost"
      onClick={logout}
      disabled={busy}
      style={{ minHeight: "auto", padding: "0.35rem 0.7rem", fontSize: "0.85rem" }}
    >
      Sair
    </button>
  );
}
