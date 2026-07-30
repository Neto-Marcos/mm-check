import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Healthcheck do Railway.
 *
 * Rota publica e sem autenticacao — e o orquestrador que consulta, nao o
 * operador. Verifica o banco de verdade com um SELECT: uma aplicacao que sobe
 * mas nao alcanca o Postgres esta inutil para a operacao, e um healthcheck que
 * so responde "ok" esconderia exatamente esse caso.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      app: "MN Check",
      database: "ok",
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("healthcheck falhou", error);
    return NextResponse.json(
      { status: "degraded", app: "MN Check", database: "unreachable" },
      { status: 503 },
    );
  }
}
