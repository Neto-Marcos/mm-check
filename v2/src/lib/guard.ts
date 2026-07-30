import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { currentUser, type SessionUser } from "./auth";

/** Tela inicial de cada perfil. */
const HOME_BY_ROLE: Record<Role, string> = {
  ADMIN: "/contagem",
  STOCK: "/contagem",
  SEPARATION: "/separacao",
  EXPEDITION: "/conferencia",
};

export function homeFor(role: Role): string {
  return HOME_BY_ROLE[role];
}

/**
 * Protecao de pagina (Server Component).
 *
 * Diferente de `requireUser`, que lanca AuthError para virar 401/403 em rota de
 * API, aqui a resposta certa e navegar: sem sessao vai para o login, e com
 * perfil errado volta para a tela do proprio perfil. Lancar numa pagina daria
 * 500 ao operador, que e o pior desfecho possivel — parece falha do sistema
 * quando na verdade e so falta de permissao.
 */
export async function requirePage(...roles: Role[]): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");

  if (roles.length > 0 && user.role !== "ADMIN" && !roles.includes(user.role)) {
    redirect(homeFor(user.role));
  }
  return user;
}
