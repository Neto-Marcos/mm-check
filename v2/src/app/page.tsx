import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { homeFor } from "@/lib/guard";

export default async function Home() {
  const user = await currentUser();
  // Cada perfil cai direto na sua tela — um toque a menos na operação.
  redirect(user ? homeFor(user.role) : "/login");
}
