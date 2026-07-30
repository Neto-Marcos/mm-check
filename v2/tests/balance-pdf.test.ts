import { describe, expect, it } from "vitest";
import {
  balanceFromTotal,
  buildBarcode,
  isNonDataLine,
  isValidVoltageGrade,
  parseBalanceLines,
  parseDataLine,
  parseDecimal,
} from "@/domain/balance-pdf";

// Linhas reais do relatório 15581.2 - Saldo Produto Filial.
const FERRO = "281 1191 3 1 FERRO DE PASSAR A SECO BLACK DECKER VFA207 66,99 13866,93";
const FERRO_220 = "281 1191 3 2 FERRO DE PASSAR A SECO BLACK DECKER VFA719 66,99 48165,81";
const REFRIGERADOR = "281 2552 1 1 REFRIGERADOR CONSUL CRB39 F.FREE 342L8 1701,14 13609,12";
const BACIA_GRADE_LONGA = "281 8620 565 0 BACIA RORATO 1,20X55 CUBA GRANITADA25 134,64 3366";
const FOGAO = "281 76514 1 4 FOGAO ATLAS 5BCS MILAO PLUS MESA INOX201 536,68 107872,68";

describe("parseDecimal", () => {
  it("lê o formato brasileiro", () => {
    expect(parseDecimal("1.234,56")).toBeCloseTo(1234.56);
    expect(parseDecimal("9,90")).toBeCloseTo(9.9);
    expect(parseDecimal("abc")).toBeNull();
  });
});

describe("balanceFromTotal", () => {
  it("recupera o saldo dividindo total por custo", () => {
    expect(balanceFromTotal(66.99, 13866.93)).toBe(207);
    expect(balanceFromTotal(1701.14, 13609.12)).toBe(8);
  });

  it("descarta o resultado quando não reconstrói o total", () => {
    // Nenhum inteiro multiplicado por 7 reconstrói 120 dentro de R$ 0,02.
    expect(balanceFromTotal(7, 120)).toBeNull();
  });

  it("protege contra custo zero ou ausente", () => {
    expect(balanceFromTotal(0, 120)).toBeNull();
    expect(balanceFromTotal(null, 120)).toBeNull();
  });
});

describe("isValidVoltageGrade", () => {
  it("aceita apenas 0 a 4", () => {
    expect(isValidVoltageGrade("0")).toBe(true);
    expect(isValidVoltageGrade("4")).toBe(true);
    expect(isValidVoltageGrade("5")).toBe(false);
    expect(isValidVoltageGrade("")).toBe(false);
  });
});

describe("isNonDataLine", () => {
  it("reconhece cabeçalhos e rodapés reais do relatório", () => {
    expect(isNonDataLine("Folha : 1")).toBe(true);
    expect(isNonDataLine("30/07/2026 -10:19:58Mercadomoveis Ltda")).toBe(true);
    expect(isNonDataLine("1 - Filial : 281 2 - Produto : 0 9999999")).toBe(true);
    expect(isNonDataLine("15581.2 - Saldo Produto Filial")).toBe(true);
    expect(isNonDataLine("Cod Filial Cod ProdutoGrade 'X' Grade 'Y'")).toBe(true);
    expect(isNonDataLine("(13) - Desenvolvimento - TI Lojas MM")).toBe(true);
    expect(isNonDataLine("Total Geral 17276113,08174257,9431699")).toBe(true);
    expect(isNonDataLine(FERRO)).toBe(false);
  });
});

describe("parseDataLine", () => {
  it("descola o saldo grudado no fim da descrição", () => {
    const outcome = parseDataLine(FERRO);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.row).toEqual({
      code: "1191",
      gradeX: "3",
      gradeY: "1",
      description: "FERRO DE PASSAR A SECO BLACK DECKER VFA",
      systemQty: 207,
    });
  });

  it("produz a mesma descrição para variantes do mesmo produto", () => {
    const a = parseDataLine(FERRO);
    const b = parseDataLine(FERRO_220);
    expect(a.ok && b.ok && a.row.description).toBe("FERRO DE PASSAR A SECO BLACK DECKER VFA");
    expect(b.ok && b.row.description).toBe("FERRO DE PASSAR A SECO BLACK DECKER VFA");
    expect(b.ok && b.row.systemQty).toBe(719);
  });

  it("lê produto de 4 e de 5 dígitos", () => {
    expect(parseDataLine(FERRO).ok && parseDataLine(FERRO).ok).toBe(true);
    const fogao = parseDataLine(FOGAO);
    expect(fogao.ok && fogao.row.code).toBe("76514");
    expect(fogao.ok && fogao.row.systemQty).toBe(201);
  });

  it("lê Grade X de mais de um dígito", () => {
    const outcome = parseDataLine(BACIA_GRADE_LONGA);
    expect(outcome.ok && outcome.row.gradeX).toBe("565");
    expect(outcome.ok && outcome.row.systemQty).toBe(25);
  });

  it("mantém vírgula da descrição fora do saldo", () => {
    const outcome = parseDataLine(BACIA_GRADE_LONGA);
    expect(outcome.ok && outcome.row.description).toBe("BACIA RORATO 1,20X55 CUBA GRANITADA");
  });

  it("recusa Grade Y fora do intervalo de voltagem", () => {
    const outcome = parseDataLine("281 1191 3 9 FERRO DE PASSAR VFA207 66,99 13866,93");
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.reason).toMatch(/Grade Y/);
  });

  it("recusa código de produto bloqueado", () => {
    const outcome = parseDataLine("281 9999999 3 1 LIXO DE CABECALHO7 10,00 70,00");
    expect(outcome.ok).toBe(false);
  });

  it("marca como não reconciliada quando o saldo não aparece na descrição", () => {
    // Total 120,00 / custo 10,00 = 12, mas a descrição termina em "99".
    const outcome = parseDataLine("281 1191 3 1 PRODUTO QUALQUER99 10,00 120,00");
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.unreconciled).toBe(true);
  });

  it("recusa linha sem colunas suficientes", () => {
    expect(parseDataLine("281 1191 3 1").ok).toBe(false);
  });
});

describe("buildBarcode", () => {
  it("concatena produto, grade X e grade Y sem preenchimento", () => {
    expect(buildBarcode("1191", "3", "1")).toBe("119131");
    expect(buildBarcode("76514", "1", "4")).toBe("7651414");
    expect(buildBarcode("8620", "565", "0")).toBe("86205650");
  });
});

describe("parseBalanceLines", () => {
  it("mantém variantes do mesmo produto separadas", () => {
    const result = parseBalanceLines([[FERRO, FERRO_220]]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.systemQty)).toEqual([207, 719]);
    expect(result.rows.map((row) => row.barcode)).toEqual(["119131", "119132"]);
  });

  it("soma quando a MESMA variante se repete", () => {
    const result = parseBalanceLines([[FERRO, FERRO]]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.systemQty).toBe(414);
  });

  it("ignora cabeçalho e rodapé sem tratá-los como erro de dado", () => {
    const result = parseBalanceLines([["Folha : 1", REFRIGERADOR, "Total Geral 123"]]);
    expect(result.rows).toHaveLength(1);
    expect(result.metrics.linesSkipped).toBe(2);
    expect(result.metrics.unreconciled).toBe(0);
  });

  it("contabiliza linhas não reconciliadas", () => {
    const result = parseBalanceLines([["281 1191 3 1 PRODUTO QUALQUER99 10,00 120,00"]]);
    expect(result.metrics.unreconciled).toBe(1);
    expect(result.rows).toHaveLength(0);
  });
});
