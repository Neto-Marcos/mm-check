import { db } from "@/lib/db";
import { requirePage } from "@/lib/guard";
import { UserAdmin, type UserRow } from "./user-admin";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const admin = await requirePage("ADMIN");

  const users: UserRow[] = await db.user.findMany({
    select: { id: true, username: true, name: true, role: true, active: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return (
    <>
      <h1>Usuários</h1>
      <UserAdmin users={users} currentUserId={admin.id} />
    </>
  );
}
