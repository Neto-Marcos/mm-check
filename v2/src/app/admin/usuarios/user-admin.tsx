"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type UserRow = {
  id: string;
  username: string;
  name: string;
  role: string;
  active: boolean;
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  SEPARATION: "Separação",
  EXPEDITION: "Expedição",
  STOCK: "Estoque",
};

type Props = { users: UserRow[]; currentUserId: string };

export function UserAdmin({ users, currentUserId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(url: string, method: string, body: unknown, success: string) {
    setBusy(true);
    setMessage(null);
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    setBusy(false);

    if (!response.ok) {
      setMessage({ ok: false, text: data.error ?? "Não foi possível concluir." });
      return false;
    }
    setMessage({ ok: true, text: success });
    router.refresh();
    return true;
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const ok = await send(
      "/api/users",
      "POST",
      {
        username: data.get("username"),
        name: data.get("name"),
        role: data.get("role"),
        password: data.get("password"),
      },
      `Usuário ${data.get("username")} criado.`,
    );
    if (ok) form.reset();
  }

  async function changePassword(user: UserRow) {
    const password = window.prompt(`Nova senha para ${user.username} (mínimo 8 caracteres):`);
    if (!password) return;
    await send(`/api/users/${user.id}`, "PATCH", { password }, `Senha de ${user.username} alterada.`);
  }

  async function toggleActive(user: UserRow) {
    const acao = user.active ? "desativar" : "reativar";
    if (!window.confirm(`Confirma ${acao} ${user.username}?`)) return;
    await send(
      `/api/users/${user.id}`,
      "PATCH",
      { active: !user.active },
      `${user.username} ${user.active ? "desativado" : "reativado"}.`,
    );
  }

  return (
    <>
      {message && <p className={`feedback ${message.ok ? "ok" : "danger"}`}>{message.text}</p>}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Novo usuário</h2>
        <form onSubmit={create}>
          <div className="row">
            <div>
              <label htmlFor="name">Nome</label>
              <input id="name" name="name" required />
            </div>
            <div>
              <label htmlFor="username">Usuário</label>
              <input id="username" name="username" autoCapitalize="none" required />
            </div>
          </div>
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <div>
              <label htmlFor="role">Perfil</label>
              <select id="role" name="role" defaultValue="SEPARATION">
                {Object.entries(ROLE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="password">Senha inicial</label>
              <input id="password" name="password" type="password" minLength={8} required />
            </div>
          </div>
          <button type="submit" disabled={busy} style={{ marginTop: "1rem" }}>
            Criar usuário
          </button>
        </form>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Equipe</h2>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Perfil</th>
                <th>Situação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name}</strong>
                      <br />
                      <span className="muted">{user.username}</span>
                    </td>
                    <td>{ROLE_LABEL[user.role] ?? user.role}</td>
                    <td>
                      <span className={`badge ${user.active ? "ok" : "danger"}`}>
                        {user.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td>
                      <div className="row">
                        <button className="ghost" disabled={busy} onClick={() => changePassword(user)}>
                          Senha
                        </button>
                        <button
                          className="ghost"
                          // O próprio usuário não pode se desativar: o sistema
                          // ficaria sem administrador.
                          disabled={busy || isSelf}
                          title={isSelf ? "Você não pode desativar o seu próprio usuário." : undefined}
                          onClick={() => toggleActive(user)}
                        >
                          {user.active ? "Desativar" : "Reativar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted">
          Usuários são desativados, nunca apagados — o histórico de quem fez cada leitura precisa
          continuar rastreável.
        </p>
      </section>
    </>
  );
}
