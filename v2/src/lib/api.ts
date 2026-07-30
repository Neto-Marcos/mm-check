import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AuthError } from "./auth";
import { CountValidationError } from "@/domain/counting";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Envolve um handler traduzindo erro de dominio em resposta HTTP.
 * Concentrar isso aqui e o que permite os handlers ficarem sem try/catch.
 */
export function handler<T>(fn: () => Promise<T>) {
  return async (): Promise<NextResponse> => {
    try {
      return NextResponse.json((await fn()) ?? { ok: true });
    } catch (error) {
      if (error instanceof AuthError || error instanceof ApiError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      if (error instanceof CountValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error instanceof ZodError) {
        return NextResponse.json(
          { error: error.issues[0]?.message ?? "Dados inválidos." },
          { status: 400 },
        );
      }
      console.error(error);
      return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
    }
  };
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError("Corpo da requisição inválido.");
  }
  return schema.parse(raw);
}
