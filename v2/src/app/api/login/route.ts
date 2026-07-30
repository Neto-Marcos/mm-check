import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, parseBody } from "@/lib/api";
import { createSession, record, verifyPassword } from "@/lib/auth";

const schema = z.object({
  username: z.string().trim().min(1, "Informe o usuário."),
  password: z.string().min(1, "Informe a senha."),
});

export async function POST(request: Request) {
  return handler(async () => {
    const { username, password } = await parseBody(request, schema);
    const user = await db.user.findUnique({ where: { username: username.toLowerCase() } });

    // Mensagem unica para usuario inexistente e senha errada: nao entrega
    // quais usuarios existem.
    const invalid = new ApiError("Usuário ou senha inválidos.", 401);
    if (!user || !user.active) throw invalid;
    if (!(await verifyPassword(password, user.passwordHash))) throw invalid;

    await createSession(user.id);
    await record(user.id, "login", `${user.name} entrou no sistema`);
    return { user: { id: user.id, name: user.name, username: user.username, role: user.role } };
  })();
}
