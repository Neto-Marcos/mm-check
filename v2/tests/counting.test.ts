import { describe, expect, it } from "vitest";
import { CountValidationError, buildCount, evaluateLine, summarize } from "@/domain/counting";

// Snapshot por variante (productId), nao por modelo.
const snapshot = new Map([
  ["p-ferro-127", 10],
  ["p-ferro-220", 4],
]);

describe("evaluateLine", () => {
  it("soma avariados e outros no físico", () => {
    const line = evaluateLine({
      productId: "p-ferro-127",
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
    const falta = evaluateLine({ productId: "p-a", systemQty: 10, countedQty: 8, damagedQty: 0, otherQty: 0 });
    expect(falta).toMatchObject({ difference: -2, status: "FALTA" });

    const sobra = evaluateLine({ productId: "p-a", systemQty: 10, countedQty: 12, damagedQty: 0, otherQty: 0 });
    expect(sobra).toMatchObject({ difference: 2, status: "SOBRA" });
  });
});

describe("buildCount", () => {
  const base = { countedQty: 1, damagedQty: 0, otherQty: 0 };

  it("resolve o saldo de sistema pelo snapshot, não pelo cliente", () => {
    const [line] = buildCount([{ productId: "p-ferro-127", ...base }], snapshot);
    expect(line.systemQty).toBe(10);
  });

  it("recusa variante fora do snapshot", () => {
    expect(() => buildCount([{ productId: "p-inexistente", ...base }], snapshot)).toThrow(
      /não pertence ao saldo desta contagem/i,
    );
  });

  it("recusa variante duplicada", () => {
    expect(() =>
      buildCount([{ productId: "p-ferro-127", ...base }, { productId: "p-ferro-127", ...base }], snapshot),
    ).toThrow(/duplicado/i);
  });

  it("recusa quantidade negativa", () => {
    expect(() =>
      buildCount([{ productId: "p-ferro-127", countedQty: -1, damagedQty: 0, otherQty: 0 }], snapshot),
    ).toThrow(/não podem ser negativas/i);
  });

  it("recusa contagem vazia e snapshot vazio", () => {
    expect(() => buildCount([], snapshot)).toThrow(CountValidationError);
    expect(() => buildCount([{ productId: "p-ferro-127", ...base }], new Map())).toThrow(/PDF de saldo/i);
  });
});

describe("summarize", () => {
  it("conta OK, sobra, falta e diferença líquida", () => {
    const lines = buildCount(
      [
        { productId: "p-ferro-127", countedQty: 10, damagedQty: 0, otherQty: 0 },
        { productId: "p-ferro-220", countedQty: 1, damagedQty: 0, otherQty: 0 },
      ],
      snapshot,
    );
    expect(summarize(lines)).toEqual({ total: 2, ok: 1, sobra: 0, falta: 1, net: -3 });
  });
});
