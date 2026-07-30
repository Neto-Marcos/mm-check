import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, parseBody } from "@/lib/api";
import { hashPassword, record, requireUser } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

const schema = z
  .object({
    password: z.string().min(8, "A senha precisa de ao menos 8 caracteres.").optional(),
    active: z.boolean().optional(),
    role: z.enum(["ADMIN", "SEPARATION", "EXPEDITION", "STOCK"]).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "Nada para alterar.");

/**
 * Altera senha, perfil ou situacao de um usuario.
 *
 * Nao existe exclusao: `active = false` desativa. Apagar o registro perderia o
 * rastro em `audit_logs`, que aponta para o usuario, e a auditoria de quem fez
 * o que e justamente o motivo do sistema existir.
 */
export async function PATCH(request: Request, { params }: Params) {
  return handler(async () => {
    const admin = await requireUser("ADMIN");
    const { id } = await params;
    const body = await parseBody(request, schema);

    const target = await db.user.findUnique({ where: { id } });
    if (!target) throw new ApiError("Usuário não encontrado.", 404);

    // Um admin que se desativa ou se rebaixa deixa o sistema sem
    // administrador, e a recuperacao so seria possivel pelo banco.
    if (target.id === admin.id) {
      if (body.active === false) throw new ApiError("Você não pode desativar o seu próprio usuário.");
      if (body.role && body.role !== "ADMIN") {
        throw new ApiError("Você não pode remover o seu próprio acesso de administrador.");
      }
    }

    const updated = await db.user.update({
      where: { id },
      data: {
        ...(body.password ? { passwordHash: await hashPassword(body.password) } : {}),
        ...(body.active === undefined ? {} : { active: body.active }),
        ...(body.role ? { role: body.role } : {}),
      },
      select: { id: true, username: true, name: true, role: true, active: true },
    });

    // Trocar senha ou desativar encerra as sessoes abertas: sem isso, quem foi
    // desligado continuaria operando com a sessao antiga.
    if (body.password || body.active === false) {
      await db.session.deleteMany({ where: { userId: id } });
    }

    const changes = [
      body.password ? "senha alterada" : null,
      body.active === undefined ? null : body.active ? "reativado" : "desativado",
      body.role ? `perfil ${body.role}` : null,
    ].filter(Boolean);
    await record(
      admin.id,
      "user_update",
      `${admin.name} atualizou ${updated.username}: ${changes.join(", ")}`,
    );

    return { user: updated };
  })();
}
