import { requireUser } from "@/lib/auth";
import { MapQueue } from "@/components/map-queue";

export const dynamic = "force-dynamic";

export default async function SeparacaoPage() {
  await requireUser("SEPARATION");
  return (
    <>
      <h1>Separação</h1>
      <MapQueue
        stage="SEPARATION"
        statuses={["SEPARATING"]}
        empty="Nenhum mapa aguardando separação."
      />
    </>
  );
}
