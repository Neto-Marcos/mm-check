import { requirePage } from "@/lib/guard";
import { MapQueue } from "@/components/map-queue";

export const dynamic = "force-dynamic";

export default async function ConferenciaPage() {
  await requirePage("EXPEDITION");
  return (
    <>
      <h1>Conferência de expedição</h1>
      <MapQueue
        stage="CONFERENCE"
        statuses={["AWAITING_CONFERENCE", "CONFERRING", "BLOCKED"]}
        empty="Nenhum mapa aguardando conferência."
      />
    </>
  );
}
