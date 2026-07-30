import Link from "next/link";
import { requirePage } from "@/lib/guard";
import { MapQueue } from "@/components/map-queue";

export const dynamic = "force-dynamic";

export default async function SeparacaoPage() {
  await requirePage("SEPARATION");
  return (
    <>
      <h1>Separação</h1>
      <p>
        <Link href="/separacao/novo">
          <button>Novo mapa</button>
        </Link>
      </p>
      <MapQueue
        stage="SEPARATION"
        statuses={["SEPARATING"]}
        empty="Nenhum mapa aguardando separação."
      />
    </>
  );
}
