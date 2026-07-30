import Link from "next/link";
import { requirePage } from "@/lib/guard";
import { NewMapForm } from "./new-map-form";

export const dynamic = "force-dynamic";

export default async function NovoMapaPage() {
  await requirePage("SEPARATION");
  return (
    <>
      <h1>Novo mapa</h1>
      <p className="muted">
        <Link href="/separacao">← voltar para a fila</Link>
      </p>
      <NewMapForm />
    </>
  );
}
