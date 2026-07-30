import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, parseBody } from "@/lib/api";
import { hashPassword, record, requireUser } from "@/lib/auth";

const schema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "O usuário precisa de ao menos 3 caracteres.")
    .regex(/^[a-zA-Z0-9._-]+$/, "Use apenas letras, números, ponto, hífen ou sublinhado."),
  name: z.string().trim().min(1, "Informe o nome."),
  role: z.enum(["ADMIN", "SEPARATION", "EXPEDITION", "STOCK"]),
  password: z.string().min(8, "A senha precisa de ao menos 8 caracteres."),
});

export async function GET() {
  return handler(async () => {
    await requireUser("ADMIN");
    const users = await db.user.findMany({
      select: { id: true, username: true, name: true, role: true, active: true, createdAt: true },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });
    return { users };
  })();
}

export async function POST(request: Request) {
  return handler(async () => {
    const admin = await requireUser("ADMIN");
    const body = await parseBody(request, schema);
    const username = body.username.toLowerCase();

    const exists = await db.user.findUnique({ where: { username } });
    if (exists) throw new ApiError(`O usuário ${username} já existe.`, 409);

    const user = await db.user.create({
      data: {
        username,
        name: body.name,
        role: body.role,
        passwordHash: await hashPassword(body.password),
      },
      select: { id: true, username: true, name: true, role: true, active: true },
    });

    await record(admin.id, "user_create", `${admin.name} criou o usuário ${username} (${body.role})`);
    return { user };
  })();
}
