import { describe, expect, it } from "vitest";
import { CountValidationError, buildCount, evaluateLine, summarize } from "@/domain/counting";

const snapshot = new Map([
  ["75481", 10],
  ["75482", 4],
]);

describe("evaluateLine", () => {
  it("soma avariados e outros no físico", () => {
    const line = evaluateLine({
      sku: "75481",
      systemQty: 10,
      countedQty: 7,
      damagedQty: 2,
      otherQty: 1,
    });
    expect(line.physicalQty).toBe(10);
    expect(line.difference).toBe(0);
    expect(line.status).toBe("OK");
  });

  it("classifica falta e sobra pelo sinal da diferença", () => {
    const falta = evaluateLine({ sku: "a", systemQty: 10, countedQty: 8, damagedQty: 0, otherQty: 0 });
    expect(falta).toMatchObject({ difference: -2, status: "FALTA" });

    const sobra = evaluateLine({ sku: "a", systemQty: 10, countedQty: 12, damagedQty: 0, otherQty: 0 });
    expect(sobra).toMatchObject({ difference: 2, status: "SOBRA" });
  });
});

describe("buildCount", () => {
  const base = { countedQty: 1, damagedQty: 0, otherQty: 0 };

  it("resolve o saldo de sistema pelo snapshot, não pelo cliente", () => {
    const [line] = buildCount([{ sku: "75481", ...base }], snapshot);
    expect(line.systemQty).toBe(10);
  });

  it("recusa SKU fora do snapshot", () => {
    expect(() => buildCount([{ sku: "99999", ...base }], snapshot)).toThrow(
      /não pertence ao saldo atual/i,
    );
  });

  it("recusa SKU duplicado", () => {
    expect(() =>
      buildCount([{ sku: "75481", ...base }, { sku: "75481", ...base }], snapshot),
    ).toThrow(/duplicado/i);
  });

  it("recusa quantidade negativa", () => {
    expect(() =>
      buildCount([{ sku: "75481", countedQty: -1, damagedQty: 0, otherQty: 0 }], snapshot),
    ).toThrow(/não podem ser negativas/i);
  });

  it("recusa contagem vazia e snapshot vazio", () => {
    expect(() => buildCount([], snapshot)).toThrow(CountValidationError);
    expect(() => buildCount([{ sku: "75481", ...base }], new Map())).toThrow(/PDF de saldo/i);
  });
});

describe("summarize", () => {
  it("conta OK, sobra, falta e diferença líquida", () => {
    const lines = buildCount(
      [
        { sku: "75481", countedQty: 10, damagedQty: 0, otherQty: 0 },
        { sku: "75482", countedQty: 1, damagedQty: 0, otherQty: 0 },
      ],
      snapshot,
    );
    expect(summarize(lines)).toEqual({ total: 2, ok: 1, sobra: 0, falta: 1, net: -3 });
  });
});
