import { db } from "./db";
import { indexCatalog, type CatalogEntry } from "@/domain/barcode";

/**
 * Catalogo de variantes ativas, indexado por codigo de barras.
 *
 * Fica em memoria no processo porque cada bipada do CD passa por ele: sao
 * poucas centenas de variantes e ir ao banco a cada leitura seria o gargalo
 * do caminho mais quente do sistema. O cache e invalidado a cada import de
 * saldo, que e o unico evento que altera o catalogo.
 */
type Cache = { index: Map<string, CatalogEntry[]>; loadedAt: number };

const globalForCatalog = globalThis as unknown as { catalog?: Cache | null };

export function invalidateCatalog(): void {
  globalForCatalog.catalog = null;
}

export async function loadCatalogIndex(): Promise<Map<string, CatalogEntry[]>> {
  const cached = globalForCatalog.catalog;
  if (cached) return cached.index;

  const products = await db.product.findMany({
    where: { active: true },
    select: { barcode: true, code: true, gradeX: true, gradeY: true, description: true },
  });
  const index = indexCatalog(products);
  globalForCatalog.catalog = { index, loadedAt: Date.now() };
  return index;
}
