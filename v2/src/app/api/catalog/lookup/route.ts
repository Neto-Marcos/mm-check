import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { loadCatalogIndex } from "@/lib/catalog";
import { describeVariant, resolveIndexed } from "@/domain/barcode";

/**
 * Resolve um codigo contra o catalogo, sem efeito colateral.
 *
 * Serve a montagem do mapa: o operador bipa e ve na hora QUAL produto aquele
 * codigo e, antes de adicionar. Confirmar pelo nome evita montar um mapa
 * inteiro em cima de uma etiqueta trocada.
 */
export async function GET(request: Request) {
  return handler(async () => {
    await requireUser("SEPARATION", "EXPEDITION", "STOCK");
    const code = new URL(request.url).searchParams.get("code") ?? "";
    const resolution = resolveIndexed(code, await loadCatalogIndex());

    if (!resolution.ok) {
      return { found: false, reason: resolution.reason, failure: resolution.failure };
    }
    return {
      found: true,
      code: resolution.entry.code,
      gradeX: resolution.entry.gradeX,
      gradeY: resolution.entry.gradeY,
      description: resolution.entry.description,
      label: describeVariant(resolution.entry),
    };
  })();
}
