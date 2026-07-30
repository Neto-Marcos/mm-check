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
 * das colunas do relatorio.
 *
 * Herdado da v1 e mantido por seguranca, mas NAO CONFIRMADO nas etiquetas
 * fisicas conferidas ate agora — nelas o codigo sempre foi produto.cor.
 * voltagem, sem excecao. Se este produto tambem seguir a regra geral, esta
 * entrada deve ser removida.
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

/**
 * Digitos da leitura, sem separadores. Usado como chave de ultimo recurso,
 * quando o coletor entrega o codigo sem pontuacao.
 */
export function normalizeBarcode(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/**
 * Leitura estruturada: os tres campos, quando a etiqueta traz separador.
 *
 * A etiqueta imprime `74968.1.2` — produto, grade de cor, grade de voltagem —
 * e nao `7496812`. Preservar o separador e o que torna a leitura exata:
 * "1191" com cor "3" e "119" com cor "13" concatenam para a mesma string, mas
 * separados nunca se confundem.
 *
 * Aceita ponto, espaco, hifen ou barra como separador, porque coletores
 * diferentes transcrevem de formas diferentes.
 */
export function parseStructuredBarcode(
  raw: string | null | undefined,
): { code: string; gradeX: string; gradeY: string } | null {
  const groups = (raw ?? "").trim().split(/[^0-9]+/).filter(Boolean);
  if (groups.length !== 3) return null;
  const [code, gradeX, gradeY] = groups as [string, string, string];
  // A grade de voltagem e sempre um unico digito de 0 a 4.
  if (!/^[0-4]$/.test(gradeY)) return null;
  return { code, gradeX, gradeY };
}

/** Chave canonica de uma variante, com separador preservado. */
export function variantKey(code: string, gradeX: string, gradeY: string): string {
  return `${code}.${gradeX}.${gradeY}`;
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
  return resolveIndexed(raw, indexCatalog(catalog));
}

/**
 * Indexa o catalogo para lookup O(1) no caminho quente.
 *
 * Cada variante entra por duas chaves: a estruturada (`74968.1.2`), que e
 * exata, e a concatenada (`7496812`), usada quando o coletor entrega o codigo
 * sem separador. Só a segunda pode colidir.
 */
export function indexCatalog(catalog: CatalogEntry[]): Map<string, CatalogEntry[]> {
  const index = new Map<string, CatalogEntry[]>();
  const push = (key: string, entry: CatalogEntry) => {
    const bucket = index.get(key);
    if (bucket) bucket.push(entry);
    else index.set(key, [entry]);
  };
  for (const entry of catalog) {
    push(variantKey(entry.code, entry.gradeX, entry.gradeY), entry);
    push(entry.barcode, entry);
  }
  return index;
}

function lookup(key: string, index: Map<string, CatalogEntry[]>, shown: string): Resolution {
  const matches = index.get(key) ?? [];
  if (matches.length === 0) {
    return {
      ok: false,
      failure: "PRODUTO_DESCONHECIDO",
      reason: `Código ${shown} não está no saldo importado.`,
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      failure: "AMBIGUO",
      reason: `Código ${shown} corresponde a ${matches.length} variantes. Confira a etiqueta.`,
    };
  }
  return { ok: true, entry: matches[0]! };
}

export function resolveIndexed(raw: string, index: Map<string, CatalogEntry[]>): Resolution {
  // Caminho preferido: a etiqueta trouxe os separadores, entao os tres campos
  // sao conhecidos e a resolucao e exata.
  const structured = parseStructuredBarcode(raw);
  if (structured) {
    const key = variantKey(structured.code, structured.gradeX, structured.gradeY);
    return lookup(key, index, key);
  }

  const digits = normalizeBarcode(raw);
  if (!digits) {
    return { ok: false, failure: "VAZIO", reason: "Leia ou digite um código." };
  }
  return lookup(digits, index, digits);
}

/**
 * Rotulo curto de uma variante para a tela do operador.
 *
 * A Grade X e o codigo de cor — confirmado nas etiquetas fisicas: cor 1 e
 * Branco, 9 e Vermelho, 2489 e Branco/Rose. O relatorio de saldo nao traz o
 * nome da cor, so o codigo, entao e o codigo que aparece na tela ate existir
 * uma tabela de cores.
 */
export function describeVariant(entry: {
  description: string;
  gradeX: string;
  gradeY: string;
}): string {
  return `${entry.description} · cor ${entry.gradeX} · ${voltageLabel(entry.gradeY)}`;
}
