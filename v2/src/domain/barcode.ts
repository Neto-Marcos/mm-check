/**
 * Leitura e validacao do codigo de barras do coletor.
 *
 * O codigo impresso e a concatenacao das colunas do relatorio de saldo:
 *
 *   Cod Produto + Grade X + Grade Y
 *
 * Nenhuma das tres tem largura fixa. No catalogo real o Cod Produto tem 4 ou
 * 5 digitos e a Grade X vai de 1 a 4, o que produz codigos de 6 a 10 digitos:
 *
 *   6 digitos:   6 variantes      9 digitos:  14 variantes
 *   7 digitos: 205 variantes     10 digitos:  13 variantes
 *   8 digitos:  13 variantes
 *
 * A v1 assumia 7 digitos fixos (5 + 1 + 1) e por isso so conseguia ler 205 de
 * 251 variantes — 82% do catalogo. Os outros 18% recebiam "Codigo invalido"
 * no coletor e tinham de ser digitados a mao ou passavam sem conferencia.
 *
 * Consequencia de desenho: nao da para fatiar o codigo por posicao — "1191"
 * com grade "3" e "119" com grade "13" geram a mesma string. O codigo e uma
 * CHAVE, nao uma estrutura. Resolvemos por lookup exato no catalogo importado
 * do PDF de saldo, e recusamos quando ha mais de um candidato.
 */

export type Voltage = "BIVOLT" | "V127" | "V220";

export const VOLTAGE_LABEL: Record<Voltage, string> = {
  BIVOLT: "Bivolt",
  V127: "127V",
  V220: "220V",
};

/**
 * Mapa de voltagem da Grade Y, herdado da v1.
 * Dois codigos distintos podem significar a mesma voltagem — por isso a
 * comparacao e sempre feita sobre a voltagem resolvida, nunca sobre o digito.
 */
const VOLTAGE_BY_GRADE: Record<string, Voltage> = {
  "0": "BIVOLT",
  "4": "BIVOLT",
  "1": "V127",
  "3": "V127",
  "2": "V220",
};

/**
 * Variantes cujo codigo impresso na etiqueta nao corresponde a concatenacao
 * das colunas. Excecoes reais de catalogo, descobertas na operacao.
 */
const BARCODE_OVERRIDES: Record<string, string> = {
  "75480-1.2": "7548143",
};

export function voltageOf(gradeY: string): Voltage | null {
  return VOLTAGE_BY_GRADE[gradeY] ?? null;
}

export function voltageLabel(gradeY: string): string {
  const voltage = voltageOf(gradeY);
  return voltage ? VOLTAGE_LABEL[voltage] : "—";
}

/** Uma variante do catalogo, como importada do PDF de saldo. */
export type CatalogEntry = {
  barcode: string;
  code: string;
  gradeX: string;
  gradeY: string;
  description: string;
};

/** Normaliza a leitura: coletores inserem hifens, espacos e quebras. */
export function normalizeBarcode(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** Codigo esperado para uma variante, respeitando as excecoes de catalogo. */
export function barcodeFor(code: string, gradeX: string, gradeY: string): string {
  return BARCODE_OVERRIDES[code] ?? `${code}${gradeX}${gradeY}`;
}

export type ResolutionFailure = "VAZIO" | "PRODUTO_DESCONHECIDO" | "AMBIGUO";

export type Resolution =
  | { ok: true; entry: CatalogEntry }
  | { ok: false; failure: ResolutionFailure; reason: string };

/**
 * Resolve uma leitura contra o catalogo.
 *
 * Nunca adivinha: um codigo que casa com mais de uma variante e recusado como
 * ambiguo. Hoje o catalogo nao tem colisao, mas ele cresce, e escolher uma
 * variante em silencio produziria divergencia impossivel de rastrear.
 */
export function resolveBarcode(raw: string, catalog: CatalogEntry[]): Resolution {
  const barcode = normalizeBarcode(raw);
  if (!barcode) {
    return { ok: false, failure: "VAZIO", reason: "Leia ou digite um código." };
  }

  const matches = catalog.filter((entry) => entry.barcode === barcode);
  if (matches.length === 0) {
    return {
      ok: false,
      failure: "PRODUTO_DESCONHECIDO",
      reason: `Código ${barcode} não está no saldo importado.`,
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      failure: "AMBIGUO",
      reason: `Código ${barcode} corresponde a ${matches.length} variantes. Confira a etiqueta.`,
    };
  }
  return { ok: true, entry: matches[0]! };
}

/** Indexa o catalogo por codigo, para lookup O(1) no caminho quente. */
export function indexCatalog(catalog: CatalogEntry[]): Map<string, CatalogEntry[]> {
  const index = new Map<string, CatalogEntry[]>();
  for (const entry of catalog) {
    const bucket = index.get(entry.barcode);
    if (bucket) bucket.push(entry);
    else index.set(entry.barcode, [entry]);
  }
  return index;
}

export function resolveIndexed(
  raw: string,
  index: Map<string, CatalogEntry[]>,
): Resolution {
  const barcode = normalizeBarcode(raw);
  if (!barcode) {
    return { ok: false, failure: "VAZIO", reason: "Leia ou digite um código." };
  }
  const matches = index.get(barcode) ?? [];
  if (matches.length === 0) {
    return {
      ok: false,
      failure: "PRODUTO_DESCONHECIDO",
      reason: `Código ${barcode} não está no saldo importado.`,
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      failure: "AMBIGUO",
      reason: `Código ${barcode} corresponde a ${matches.length} variantes. Confira a etiqueta.`,
    };
  }
  return { ok: true, entry: matches[0]! };
}

/** Rotulo curto de uma variante para a tela do operador. */
export function describeVariant(entry: {
  description: string;
  gradeX: string;
  gradeY: string;
}): string {
  return `${entry.description} · cor ${entry.gradeX} · ${voltageLabel(entry.gradeY)}`;
}
