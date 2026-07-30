import { describe, expect, it } from "vitest";
import {
  balanceFromTotal,
  isNonDataLine,
  parseBalanceLines,
  parseDecimal,
  parseInteger,
} from "@/domain/balance-pdf";

describe("parseInteger", () => {
  it("aceita separador de milhar", () => {
    expect(parseInteger("1.234")).toBe(1234);
    expect(parseInteger("42")).toBe(42);
  });

  it("rejeita texto que não é inteiro puro", () => {
    expect(parseInteger("12,5")).toBeNull();
    expect(parseInteger("abc")).toBeNull();
    expect(parseInteger(null)).toBeNull();
  });
});

describe("parseDecimal", () => {
  it("lê o formato brasileiro", () => {
    expect(parseDecimal("1.234,56")).toBeCloseTo(1234.56);
    expect(parseDecimal("9,90")).toBeCloseTo(9.9);
  });
});

describe("balanceFromTotal", () => {
  it("recupera o saldo dividindo total por custo", () => {
    expect(balanceFromTotal(10, 120)).toBe(12);
  });

  it("descarta o resultado quando não reconstrói o total", () => {
    // 120 / 7 = 17,14 → nenhum inteiro reconstrói 120 dentro de R$ 0,02.
    expect(balanceFromTotal(7, 120)).toBeNull();
  });

  it("tolera arredondamento de centavos", () => {
    expect(balanceFromTotal(3.33, 9.99)).toBe(3);
  });

  it("protege contra custo zero ou ausente", () => {
    expect(balanceFromTotal(0, 120)).toBeNull();
    expect(balanceFromTotal(null, 120)).toBeNull();
  });
});

describe("isNonDataLine", () => {
  it("reconhece cabeçalhos e rodapés do relatório", () => {
    expect(isNonDataLine("Folha 3")).toBe(true);
    expect(isNonDataLine("TOTAL GERAL")).toBe(true);
    expect(isNonDataLine("01/07/2026 relatório")).toBe(true);
    expect(isNonDataLine("1 - Filial")).toBe(true);
    expect(isNonDataLine("75481 A 3 12 10,00 120,00")).toBe(false);
  });
});

describe("parseBalanceLines", () => {
  it("lê uma linha de dado válida", () => {
    const result = parseBalanceLines([["75481 A 3 12 10,00 120,00"]]);
    expect(result.rows).toEqual([{ sku: "75481", systemQty: 12 }]);
    expect(result.metrics.linesRead).toBe(1);
  });

  it("soma o saldo de SKUs repetidos", () => {
    const result = parseBalanceLines([
      ["75481 A 3 12 10,00 120,00", "75481 B 1 3 10,00 30,00"],
    ]);
    expect(result.rows).toEqual([{ sku: "75481", systemQty: 15 }]);
    expect(result.metrics.duplicates).toBe(1);
  });

  it("prefere Total ÷ Custo ao texto da coluna Saldo", () => {
    // Coluna Saldo diz 99, mas 120,00 / 10,00 prova que são 12.
    const result = parseBalanceLines([["75481 A 3 99 10,00 120,00"]]);
    expect(result.rows[0]?.systemQty).toBe(12);
  });

  it("ignora grade Y fora do intervalo de voltagem", () => {
    const result = parseBalanceLines([["75481 A 9 12 10,00 120,00"]]);
    expect(result.rows).toEqual([]);
    expect(result.ignored[0]?.reason).toMatch(/Grade Y/);
  });

  it("ignora código bloqueado de cabeçalho", () => {
    const result = parseBalanceLines([["9999999 A 3 12 10,00 120,00"]]);
    expect(result.rows).toEqual([]);
  });

  it("ignora linhas informativas sem contá-las como erro de dado", () => {
    const result = parseBalanceLines([["Folha 1", "75481 A 3 12 10,00 120,00"]]);
    expect(result.rows).toHaveLength(1);
    expect(result.metrics.linesSkipped).toBe(1);
  });
});
