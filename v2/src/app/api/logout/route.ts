import { handler } from "@/lib/api";
import { destroySession } from "@/lib/auth";

export async function POST() {
  return handler(async () => {
    await destroySession();
    return { ok: true };
  })();
}
