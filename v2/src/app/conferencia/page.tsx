import { requireUser } from "@/lib/auth";
import { MapQueue } from "@/components/map-queue";

export const dynamic = "force-dynamic";

export default async function ConferenciaPage() {
  await requireUser("EXPEDITION");
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
