/**
 * Parser do relatorio de saldo em PDF.
 *
 * Portado das regras do v1 (BalancePdfParser.java). Deliberadamente NAO usa IA:
 * o relatorio tem layout fixo e a leitura deterministica e auditavel.
 *
 * A regra mais importante e o cruzamento `Total / Custo Medio`: quando os dois
 * valores existem, o saldo calculado tem prioridade sobre o texto lido da
 * coluna, porque o texto e a fonte de erro mais comum (colunas coladas).
 */

export type BalanceRow = { sku: string; systemQty: number };

export type IgnoredLine = { page: number; line: string; product: string; reason: string };

export type ParseMetrics = {
  pages: number;
  linesRead: number;
  linesSkipped: number;
  duplicates: number;
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
    n.includes("saldo produto filial") ||
    n.includes("mercadomoveis") ||
    n.startsWith("total geral") ||
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

/** Inteiro com separador de milhar opcional: "1.234" -> 1234. */
export function parseInteger(value: string | null | undefined): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!/^(\d+|\d{1,3}(?:\.\d{3})+)$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed.replace(/\./g, ""), 10);
  return Number.isNaN(parsed) ? null : parsed;
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
 * So aceita o resultado se ele reconstroi o total com erro <= R$ 0,02 —
 * caso contrario as colunas foram lidas erradas e o valor e descartado.
 */
export function balanceFromTotal(cost: number | null, total: number | null): number | null {
  if (cost == null || total == null || cost === 0) return null;
  const rounded = Math.round(total / cost);
  if (Math.abs(cost * rounded - total) > 0.02) return null;
  return rounded >= 0 ? rounded : null;
}

export function isValidProduct(product: string): boolean {
  return /^\d{1,10}[A-Za-z0-9.\-]*$/.test(product) && !product.startsWith("9999999");
}

/** Grade Y carrega a voltagem e so aceita 0 a 4. */
export function isValidVoltageGrade(value: string): boolean {
  return /^[0-4]$/.test(value);
}

type Columns = {
  product: string;
  gradeX: string;
  gradeY: string;
  balance: string | null;
  cost: string | null;
  total: string | null;
};

/**
 * Quebra uma linha de dados em colunas.
 * Layout: PRODUTO GRADE_X GRADE_Y SALDO CUSTO TOTAL
 */
export function splitColumns(line: string): Columns | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 3) return null;
  return {
    product: parts[0] ?? "",
    gradeX: parts[1] ?? "",
    gradeY: parts[2] ?? "",
    balance: parts[3] ?? null,
    cost: parts[4] ?? null,
    total: parts[5] ?? null,
  };
}

export function validationError(columns: Columns, balance: number | null): string | null {
  if (!isValidProduct(columns.product)) return "Código de produto ausente ou inválido.";
  if (!columns.gradeX || columns.gradeX.length > 10) return "Grade X ausente ou inválida.";
  if (!isValidVoltageGrade(columns.gradeY)) {
    return "Grade Y ausente ou fora do intervalo aceito (0 a 4).";
  }
  if (balance == null) return "Saldo numérico não pôde ser identificado.";
  if (balance < 0) return "Saldo negativo não permitido.";
  return null;
}

/**
 * Le as linhas ja extraidas do PDF e devolve os saldos por SKU.
 *
 * SKUs repetidos tem o saldo somado — regra herdada do v1, onde o mesmo
 * produto aparece em varias linhas de grade.
 */
export function parseBalanceLines(pages: string[][]): ParseResult {
  const totals = new Map<string, number>();
  const ignored: IgnoredLine[] = [];
  let linesRead = 0;
  let duplicates = 0;

  pages.forEach((lines, index) => {
    const page = index + 1;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      linesRead += 1;

      if (isNonDataLine(line)) {
        ignored.push({ page, line, product: "", reason: nonDataReason(line) });
        continue;
      }
      // Toda linha de dado comeca pelo codigo do produto.
      if (!/^\d/.test(line)) {
        ignored.push({ page, line, product: "", reason: nonDataReason(line) });
        continue;
      }

      const columns = splitColumns(line);
      if (!columns) {
        ignored.push({
          page,
          line,
          product: "",
          reason: "Linha sem todas as colunas de Produto, Grade X e Grade Y.",
        });
        continue;
      }

      const calculated = balanceFromTotal(
        parseDecimal(columns.cost),
        parseDecimal(columns.total),
      );
      const direct = parseInteger(columns.balance);
      // Total / Custo tem prioridade: e a leitura que se auto-verifica.
      const balance = calculated ?? direct;

      const error = validationError(columns, balance);
      if (error || balance == null) {
        ignored.push({ page, line, product: columns.product, reason: error ?? "Saldo inválido." });
        continue;
      }

      const sku = columns.product;
      if (totals.has(sku)) duplicates += 1;
      totals.set(sku, (totals.get(sku) ?? 0) + balance);
    }
  });

  return {
    rows: [...totals].map(([sku, systemQty]) => ({ sku, systemQty })),
    ignored,
    metrics: { pages: pages.length, linesRead, linesSkipped: ignored.length, duplicates },
  };
}
