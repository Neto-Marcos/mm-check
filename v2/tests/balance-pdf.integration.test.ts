import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeAll } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";
import { parseBalanceLines, type ParseResult } from "@/domain/balance-pdf";

/**
 * Teste de integracao contra o relatorio de saldo real de producao.
 *
 * As asserções abaixo só passam se a leitura estiver correta de ponta a ponta.
 * A mais forte é a soma dos saldos: 31.699 é o `Total Geral` impresso no
 * rodapé do próprio PDF, então bater esse número prova que nenhuma linha foi
 * perdida, duplicada ou lida com o saldo errado.
 */
const FIXTURE = fileURLToPath(new URL("./fixtures/saldo.pdf", import.meta.url));

let result: ParseResult;

beforeAll(async () => {
  const bytes = new Uint8Array(await readFile(FIXTURE));
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = (Array.isArray(text) ? text : [text]).map((page) => page.split("\n"));
  result = parseBalanceLines(pages);
}, 30_000);

describe("relatório de saldo real", () => {
  it("lê as 5 folhas", () => {
    expect(result.metrics.pages).toBe(5);
  });

  it("reconhece as 251 linhas de dado, sem nenhuma não reconciliada", () => {
    expect(result.rows).toHaveLength(251);
    expect(result.metrics.unreconciled).toBe(0);
  });

  it("soma dos saldos bate com o Total Geral do rodapé do PDF", () => {
    const total = result.rows.reduce((acc, row) => acc + row.systemQty, 0);
    expect(total).toBe(31_699);
  });

  it("encontra 168 produtos distintos em 251 variantes", () => {
    const produtos = new Set(result.rows.map((row) => row.code));
    expect(produtos.size).toBe(168);
  });

  it("não gera nenhum código de barras ambíguo", () => {
    const barcodes = new Set(result.rows.map((row) => row.barcode));
    expect(barcodes.size).toBe(result.rows.length);
  });

  it("cobre códigos de 6 a 10 dígitos — o que a v1 não conseguia ler", () => {
    const lengths = new Set(result.rows.map((row) => row.barcode.length));
    expect([...lengths].sort((a, b) => a - b)).toEqual([6, 7, 8, 9, 10]);
    // A v1 assumia 7 dígitos fixos: 46 das 251 variantes ficavam de fora.
    const foraDoPadraoV1 = result.rows.filter((row) => row.barcode.length !== 7);
    expect(foraDoPadraoV1).toHaveLength(46);
  });

  it("extrai descrição não vazia em todas as linhas", () => {
    expect(result.rows.every((row) => row.description.length > 0)).toBe(true);
  });

  it("dá a mesma descrição para variantes do mesmo produto", () => {
    const byCode = new Map<string, Set<string>>();
    for (const row of result.rows) {
      const set = byCode.get(row.code) ?? new Set();
      set.add(row.description);
      byCode.set(row.code, set);
    }
    // Se o saldo tivesse sido descolado no ponto errado, a descrição variaria
    // entre as grades do mesmo produto.
    const inconsistentes = [...byCode].filter(([, set]) => set.size > 1);
    expect(inconsistentes).toEqual([]);
  });

  it("mantém a Grade Y sempre no intervalo de voltagem", () => {
    const grades = new Set(result.rows.map((row) => row.gradeY));
    expect([...grades].sort()).toEqual(["0", "1", "2", "3", "4"]);
  });
});
