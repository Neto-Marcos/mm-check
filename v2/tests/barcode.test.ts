import { describe, expect, it } from "vitest";
import {
  InvalidBarcodeError,
  barcodeForSku,
  parseBarcode,
  validateScan,
} from "@/domain/barcode";

describe("parseBarcode", () => {
  it("quebra o CODE 128 em SKU, cor e voltagem", () => {
    expect(parseBarcode("7548143")).toMatchObject({
      sku: "75481",
      color: "4",
      voltageCode: "3",
      voltage: "V127",
    });
  });

  it("ignora separadores que o coletor pode inserir", () => {
    expect(parseBarcode("754-814 3").sku).toBe("75481");
  });

  it("recusa código com tamanho diferente de 7 dígitos", () => {
    expect(() => parseBarcode("754814")).toThrow(InvalidBarcodeError);
    expect(() => parseBarcode("")).toThrow(InvalidBarcodeError);
  });

  it("recusa código de voltagem fora da tabela", () => {
    expect(() => parseBarcode("7548145")).toThrow(/voltagem inválido/i);
  });

  it("trata 0 e 4 como bivolt, 1 e 3 como 127V", () => {
    expect(parseBarcode("7548140").voltage).toBe("BIVOLT");
    expect(parseBarcode("7548144").voltage).toBe("BIVOLT");
    expect(parseBarcode("7548141").voltage).toBe("V127");
    expect(parseBarcode("7548143").voltage).toBe("V127");
    expect(parseBarcode("7548142").voltage).toBe("V220");
  });
});

describe("barcodeForSku", () => {
  it("aplica a exceção de catálogo herdada do v1", () => {
    expect(barcodeForSku("75480-1.2")).toBe("7548143");
  });

  it("remove pontuação de um SKU comum", () => {
    expect(barcodeForSku("754-8140")).toBe("7548140");
  });
});

describe("validateScan", () => {
  it("aprova leitura idêntica ao esperado", () => {
    expect(validateScan("7548143", "7548143").accepted).toBe(true);
  });

  it("aprova voltagens equivalentes com código diferente", () => {
    // 1 e 3 significam 127V: a comparação é pela voltagem resolvida.
    expect(validateScan("7548141", "7548143").accepted).toBe(true);
  });

  it("bloqueia SKU divergente", () => {
    const verdict = validateScan("7548143", "7549143");
    expect(verdict).toMatchObject({ accepted: false, reason: "SKU incorreto" });
  });

  it("bloqueia cor divergente", () => {
    const verdict = validateScan("7548143", "7548153");
    expect(verdict).toMatchObject({ accepted: false, reason: "Cor incorreta" });
  });

  it("bloqueia voltagem divergente", () => {
    const verdict = validateScan("7548143", "7548142");
    expect(verdict).toMatchObject({ accepted: false, reason: "Voltagem incorreta" });
  });
});
