import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

/** Cada perfil cai direto na sua tela — um toque a menos na operação. */
const HOME_BY_ROLE = {
  ADMIN: "/contagem",
  STOCK: "/contagem",
  SEPARATION: "/separacao",
  EXPEDITION: "/conferencia",
} as const;

export default async function Home() {
  const user = await currentUser();
  redirect(user ? HOME_BY_ROLE[user.role] : "/login");
}
