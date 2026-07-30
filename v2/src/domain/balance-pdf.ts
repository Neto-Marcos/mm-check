/**
 * Parser do relatorio de saldo em PDF (15581.2 - Saldo Produto Filial).
 *
 * Layout real, validado contra o relatorio de producao:
 *
 *   Cod Filial | Cod Produto | Grade X | Grade Y | Produto | Saldo | Custo Medio | Total
 *   281          1191          3         1         FERRO...  207     66,99         13866,93
 *
 * Duas armadilhas do relatorio, que definem todo o desenho deste modulo:
 *
 * 1. O saldo sai COLADO no fim da descricao — "...VFA" + "207" vira "VFA207".
 *    Em 251 de 251 linhas do relatorio real nao ha separador. Por isso nao
 *    existe forma de fatiar a linha so por espaco em branco.
 *
 * 2. `Total / Custo Medio` reconstroi o saldo de forma exata e se
 *    auto-verifica. E a fonte primaria, nao um fallback: nas 251 linhas
 *    resolveu 100%, e a soma dos saldos bateu com o `Total Geral` do rodape.
 *
 * O saldo assim obtido e usado para descolar a descricao: removemos seu
 * sufixo do fim do texto. Se o sufixo nao bater, a linha e marcada como nao
 * reconciliada em vez de ser aceita — e o sinal de que o layout mudou.
 *
 * Deliberadamente sem IA: o relatorio tem layout fixo e a leitura precisa ser
 * deterministica e auditavel.
 */

/** Uma variante fisica de produto: modelo + grade de cor + grade de voltagem. */
export type BalanceRow = {
  code: string;
  gradeX: string;
  gradeY: string;
  description: string;
  systemQty: number;
  /** Chave lida pelo coletor: concatenacao das tres colunas, como no relatorio. */
  barcode: string;
};

export type IgnoredLine = { page: number; line: string; product: string; reason: string };

export type ParseMetrics = {
  pages: number;
  linesRead: number;
  linesSkipped: number;
  /** Linhas de dado cujo saldo nao reconciliou com a descricao. */
  unreconciled: number;
};

export type ParseResult = {
  rows: BalanceRow[];
  ignored: IgnoredLine[];
  metrics: ParseMetrics;
};

const DATE_LINE = /^\d{2}\/\d{2}\/\d{4}/;

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Cabecalhos, rodapes e linhas informativas do relatorio. */
export function isNonDataLine(text: string): boolean {
  const n = normalize(text);
  return (
    n.startsWith("folha") ||
    n.startsWith("cod filial") ||
    n.includes("saldo produto filial") ||
    n.includes("mercadomoveis") ||
    n.startsWith("total geral") ||
    n.startsWith("total") ||
    n.includes("desenvolvimento - ti") ||
    n.startsWith("1 - filial") ||
    DATE_LINE.test(n)
  );
}

function nonDataReason(text: string): string {
  const n = normalize(text);
  if (n.startsWith("total")) return "Total ou rodapé.";
  if (n.includes("produto") || n.includes("grade") || n.includes("saldo")) {
    return "Cabeçalho ou filtro do relatório.";
  }
  return "Linha informativa do relatório.";
}

/** Decimal no formato brasileiro: "1.234,56" -> 1234.56. */
export function parseDecimal(value: string | null | undefined): number | null {
  if (value == null) return null;
  const normalized = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Recupera o saldo dividindo Total pelo Custo Medio.
 *
 * So aceita o resultado se ele reconstroi o total com erro <= R$ 0,02 —
 * caso contrario as colunas foram lidas erradas e o valor e descartado.
 * Essa checagem e o que torna a leitura auto-verificavel.
 */
export function balanceFromTotal(cost: number | null, total: number | null): number | null {
  if (cost == null || total == null || cost === 0) return null;
  const rounded = Math.round(total / cost);
  if (Math.abs(cost * rounded - total) > 0.02) return null;
  return rounded >= 0 ? rounded : null;
}

/** Grade Y carrega a voltagem e so aceita 0 a 4. */
export function isValidVoltageGrade(value: string): boolean {
  return /^[0-4]$/.test(value);
}

export function isValidProduct(code: string): boolean {
  // Codigos 9999999* sao lixo de cabecalho/filtro do relatorio.
  return /^\d{1,10}$/.test(code) && !code.startsWith("9999999");
}

/** Codigo lido pelo coletor: as tres colunas concatenadas, sem preenchimento. */
export function buildBarcode(code: string, gradeX: string, gradeY: string): string {
  return `${code}${gradeX}${gradeY}`;
}

export type DataLine = {
  code: string;
  gradeX: string;
  gradeY: string;
  description: string;
  systemQty: number;
};

export type LineOutcome =
  | { ok: true; row: DataLine }
  | { ok: false; product: string; reason: string; unreconciled?: boolean };

/**
 * Interpreta uma unica linha de dado.
 *
 * Exposta para teste: e aqui que moram todas as regras sutis do relatorio.
 */
export function parseDataLine(line: string): LineOutcome {
  const tokens = line.trim().split(/\s+/);
  // Filial, produto, grade X, grade Y, ao menos 1 token de descricao,
  // custo e total.
  if (tokens.length < 7) {
    return { ok: false, product: "", reason: "Linha sem todas as colunas esperadas." };
  }

  const code = tokens[1] ?? "";
  const gradeX = tokens[2] ?? "";
  const gradeY = tokens[3] ?? "";

  if (!isValidProduct(code)) {
    return { ok: false, product: code, reason: "Código de produto ausente ou inválido." };
  }
  if (!/^\d{1,10}$/.test(gradeX)) {
    return { ok: false, product: code, reason: "Grade X ausente ou inválida." };
  }
  if (!isValidVoltageGrade(gradeY)) {
    return {
      ok: false,
      product: code,
      reason: "Grade Y ausente ou fora do intervalo aceito (0 a 4).",
    };
  }

  const total = parseDecimal(tokens[tokens.length - 1]);
  const cost = parseDecimal(tokens[tokens.length - 2]);
  const systemQty = balanceFromTotal(cost, total);
  if (systemQty == null) {
    return {
      ok: false,
      product: code,
      reason: "Saldo não pôde ser recuperado por Total ÷ Custo Médio.",
    };
  }

  // O miolo entre a grade Y e as duas colunas de valor: descricao + saldo,
  // possivelmente colados.
  const middle = tokens.slice(4, tokens.length - 2).join(" ").trim();
  const suffix = String(systemQty);

  let description: string;
  if (middle.endsWith(suffix)) {
    // Caso dominante: saldo colado no fim da descricao.
    description = middle.slice(0, -suffix.length).trim();
  } else {
    // O saldo calculado nao aparece no texto: o layout mudou ou as colunas
    // foram lidas fora de ordem. Recusar alto em vez de importar errado.
    return {
      ok: false,
      product: code,
      reason: `Saldo ${suffix} não reconcilia com a descrição lida.`,
      unreconciled: true,
    };
  }

  if (!description) {
    return { ok: false, product: code, reason: "Descrição do produto não identificada." };
  }

  return { ok: true, row: { code, gradeX, gradeY, description, systemQty } };
}

/**
 * Le as linhas ja extraidas do PDF e devolve o saldo por variante.
 *
 * O grao e produto + Grade X + Grade Y, nao o produto sozinho. Somar as
 * grades — como a v1 fazia — deixaria uma falta de 220V ser mascarada por uma
 * sobra de 127V do mesmo modelo.
 */
export function parseBalanceLines(pages: string[][]): ParseResult {
  const rows = new Map<string, BalanceRow>();
  const ignored: IgnoredLine[] = [];
  let linesRead = 0;
  let unreconciled = 0;

  pages.forEach((lines, index) => {
    const page = index + 1;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      linesRead += 1;

      // Toda linha de dado comeca pelo codigo da filial.
      if (isNonDataLine(line) || !/^\d+\s/.test(line)) {
        ignored.push({ page, line, product: "", reason: nonDataReason(line) });
        continue;
      }

      const outcome = parseDataLine(line);
      if (!outcome.ok) {
        if (outcome.unreconciled) unreconciled += 1;
        ignored.push({ page, line, product: outcome.product, reason: outcome.reason });
        continue;
      }

      const { code, gradeX, gradeY, description, systemQty } = outcome.row;
      const barcode = buildBarcode(code, gradeX, gradeY);
      const existing = rows.get(barcode);
      if (existing) {
        // Mesma variante repetida no relatorio: soma. Variantes diferentes do
        // mesmo produto continuam separadas, que e o ponto.
        existing.systemQty += systemQty;
        continue;
      }
      rows.set(barcode, { code, gradeX, gradeY, description, systemQty, barcode });
    }
  });

  return {
    rows: [...rows.values()],
    ignored,
    metrics: { pages: pages.length, linesRead, linesSkipped: ignored.length, unreconciled },
  };
}
