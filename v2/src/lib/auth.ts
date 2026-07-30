import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import type { Role, User } from "@prisma/client";
import { db } from "./db";

const COOKIE = "mncheck_session";
const SESSION_DAYS = 7;

/**
 * bcrypt com custo 12, no lugar do SHA-256 puro do v1.
 * SHA-256 sem salt e rapido demais: um vazamento do banco entregaria as senhas.
 */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Sessao persistida no banco, nao em memoria.
 * Restart do container nao desloga mais ninguem no meio de uma separacao.
 */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.session.create({ data: { token, userId, expiresAt } });

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { token } });
  store.delete(COOKIE);
}

export type SessionUser = Pick<User, "id" | "name" | "username" | "role">;

export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;

  const { id, name, username, role } = session.user;
  return { id, name, username, role };
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** Exige sessao valida e, opcionalmente, um dos papeis informados. */
export async function requireUser(...roles: Role[]): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new AuthError("Faça login para continuar.", 401);
  // ADMIN sempre passa: evita espalhar `|| ADMIN` por todo endpoint.
  if (roles.length > 0 && user.role !== "ADMIN" && !roles.includes(user.role)) {
    throw new AuthError("Ação não permitida para o seu perfil.", 403);
  }
  return user;
}

export function record(userId: string | null, action: string, description: string) {
  return db.auditLog.create({ data: { userId, action, description } });
}
