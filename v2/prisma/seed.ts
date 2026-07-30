import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

/**
 * Cria o admin inicial. Idempotente: rodar de novo so atualiza a senha.
 * A senha vem do ambiente — nunca fica no codigo.
 */
async function main() {
  const password = process.env.MNCHECK_ADMIN_PASSWORD;
  if (!password) {
    throw new Error("Defina MNCHECK_ADMIN_PASSWORD antes de rodar o seed.");
  }
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await db.user.upsert({
    where: { username: "admin" },
    create: { username: "admin", name: "Administrador", role: "ADMIN", passwordHash },
    update: { passwordHash, active: true },
  });

  console.log(`Admin pronto: ${admin.username}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
