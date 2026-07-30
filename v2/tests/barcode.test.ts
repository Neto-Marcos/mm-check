import { describe, expect, it } from "vitest";
import {
  VOLTAGE_LABEL,
  barcodeFor,
  describeVariant,
  indexCatalog,
  normalizeBarcode,
  parseStructuredBarcode,
  resolveBarcode,
  resolveIndexed,
  variantKey,
  voltageLabel,
  voltageOf,
  type CatalogEntry,
} from "@/domain/barcode";

const CATALOGO: CatalogEntry[] = [
  {
    barcode: "119131",
    code: "1191",
    gradeX: "3",
    gradeY: "1",
    description: "FERRO DE PASSAR A SECO BLACK DECKER VFA",
  },
  {
    barcode: "119132",
    code: "1191",
    gradeX: "3",
    gradeY: "2",
    description: "FERRO DE PASSAR A SECO BLACK DECKER VFA",
  },
  {
    barcode: "7651414",
    code: "76514",
    gradeX: "1",
    gradeY: "4",
    description: "FOGAO ATLAS 5BCS MILAO PLUS MESA INOX",
  },
  {
    barcode: "86205650",
    code: "8620",
    gradeX: "565",
    gradeY: "0",
    description: "BACIA RORATO 1,20X55 CUBA GRANITADA",
  },
];

describe("voltagem", () => {
  it("trata 0 e 4 como bivolt, 1 e 3 como 127V, 2 como 220V", () => {
    expect(voltageOf("0")).toBe("BIVOLT");
    expect(voltageOf("4")).toBe("BIVOLT");
    expect(voltageOf("1")).toBe("V127");
    expect(voltageOf("3")).toBe("V127");
    expect(voltageOf("2")).toBe("V220");
  });

  it("devolve null para grade fora da tabela", () => {
    expect(voltageOf("9")).toBeNull();
    expect(voltageLabel("9")).toBe("—");
  });

  it("rotula em português", () => {
    expect(VOLTAGE_LABEL.V127).toBe("127V");
    expect(voltageLabel("2")).toBe("220V");
  });
});

describe("normalizeBarcode", () => {
  it("descarta separadores que o coletor pode inserir", () => {
    expect(normalizeBarcode("119-13 1")).toBe("119131");
    expect(normalizeBarcode(null)).toBe("");
  });
});

describe("barcodeFor", () => {
  it("concatena as três colunas", () => {
    expect(barcodeFor("1191", "3", "1")).toBe("119131");
  });

  it("aplica a exceção de catálogo herdada da v1", () => {
    expect(barcodeFor("75480-1.2", "3", "1")).toBe("7548143");
  });
});

describe("resolveBarcode", () => {
  it("resolve código de 6 dígitos — a v1 recusava", () => {
    const resolution = resolveBarcode("119131", CATALOGO);
    expect(resolution.ok).toBe(true);
    expect(resolution.ok && resolution.entry.code).toBe("1191");
  });

  it("resolve código de 8 dígitos — a v1 recusava", () => {
    const resolution = resolveBarcode("86205650", CATALOGO);
    expect(resolution.ok && resolution.entry.gradeX).toBe("565");
  });

  it("resolve código de 7 dígitos", () => {
    expect(resolveBarcode("7651414", CATALOGO).ok).toBe(true);
  });

  it("distingue variantes do mesmo produto pela voltagem", () => {
    const v127 = resolveBarcode("119131", CATALOGO);
    const v220 = resolveBarcode("119132", CATALOGO);
    expect(v127.ok && v127.entry.gradeY).toBe("1");
    expect(v220.ok && v220.entry.gradeY).toBe("2");
  });

  it("recusa código ausente do catálogo", () => {
    const resolution = resolveBarcode("999999", CATALOGO);
    expect(resolution).toMatchObject({ ok: false, failure: "PRODUTO_DESCONHECIDO" });
  });

  it("recusa leitura vazia", () => {
    expect(resolveBarcode("", CATALOGO)).toMatchObject({ ok: false, failure: "VAZIO" });
  });

  it("recusa código ambíguo em vez de escolher uma variante", () => {
    const colidido = [...CATALOGO, { ...CATALOGO[0]!, code: "119", gradeX: "13" }];
    const resolution = resolveBarcode("119131", colidido);
    expect(resolution).toMatchObject({ ok: false, failure: "AMBIGUO" });
  });
});

describe("resolveIndexed", () => {
  it("dá o mesmo resultado que a busca linear", () => {
    const index = indexCatalog(CATALOGO);
    expect(resolveIndexed("7651414", index).ok).toBe(true);
    expect(resolveIndexed("999999", index)).toMatchObject({ failure: "PRODUTO_DESCONHECIDO" });
    expect(resolveIndexed("", index)).toMatchObject({ failure: "VAZIO" });
  });

  it("também recusa ambiguidade", () => {
    const index = indexCatalog([...CATALOGO, { ...CATALOGO[0]! }]);
    expect(resolveIndexed("119131", index)).toMatchObject({ failure: "AMBIGUO" });
  });
});

describe("describeVariant", () => {
  it("monta o rótulo que o operador lê na tela", () => {
    expect(describeVariant(CATALOGO[0]!)).toBe(
      "FERRO DE PASSAR A SECO BLACK DECKER VFA · cor 3 · 127V",
    );
  });
});

// ---------------------------------------------------------------------------
// Etiquetas fisicas reais, fotografadas no CD.
// ---------------------------------------------------------------------------

const ETIQUETAS: CatalogEntry[] = [
  {
    // Prod.: 74968.1.2 — MICRO-ONDAS MIDEA MASTERCOOK MHP20B 20L, Branco, 220 V
    barcode: "7496812",
    code: "74968",
    gradeX: "1",
    gradeY: "2",
    description: "MICRO-ONDAS MIDEA MASTERCOOK MHP20B 20L",
  },
  {
    // Prod.: 72627.2489.4 — ESCOVA SECADORA MONDIAL ES-50, Branco/Rose, Bivolt
    barcode: "7262724894",
    code: "72627",
    gradeX: "2489",
    gradeY: "4",
    description: "ESCOVA SECADORA MONDIAL ES-50",
  },
  {
    // Prod.: 72628.9.2 — ESCOVA ROTATIVA MONDIAL ER-11-KR, Vermelho, 220 V
    barcode: "7262892",
    code: "72628",
    gradeX: "9",
    gradeY: "2",
    description: "ESCOVA ROTATIVA MONDIAL ER-11-KR",
  },
];

describe("parseStructuredBarcode", () => {
  it("separa os três campos da etiqueta", () => {
    expect(parseStructuredBarcode("74968.1.2")).toEqual({
      code: "74968",
      gradeX: "1",
      gradeY: "2",
    });
  });

  it("lê grade de cor com vários dígitos", () => {
    expect(parseStructuredBarcode("72627.2489.4")).toEqual({
      code: "72627",
      gradeX: "2489",
      gradeY: "4",
    });
  });

  it("aceita espaço, hífen e barra como separador", () => {
    const esperado = { code: "72627", gradeX: "2489", gradeY: "4" };
    expect(parseStructuredBarcode("72627 2489 4")).toEqual(esperado);
    expect(parseStructuredBarcode("72627-2489-4")).toEqual(esperado);
    expect(parseStructuredBarcode("72627/2489/4")).toEqual(esperado);
  });

  it("devolve null sem separador ou com grade de voltagem inválida", () => {
    expect(parseStructuredBarcode("7496812")).toBeNull();
    expect(parseStructuredBarcode("74968.1.9")).toBeNull();
    expect(parseStructuredBarcode("74968.1")).toBeNull();
  });
});

describe("etiquetas reais", () => {
  it("resolve as três etiquetas com separador", () => {
    for (const etiqueta of ETIQUETAS) {
      const lida = variantKey(etiqueta.code, etiqueta.gradeX, etiqueta.gradeY);
      const resolution = resolveBarcode(lida, ETIQUETAS);
      expect(resolution.ok).toBe(true);
      expect(resolution.ok && resolution.entry.description).toBe(etiqueta.description);
    }
  });

  it("resolve as três etiquetas sem separador", () => {
    for (const etiqueta of ETIQUETAS) {
      const resolution = resolveBarcode(etiqueta.barcode, ETIQUETAS);
      expect(resolution.ok && resolution.entry.code).toBe(etiqueta.code);
    }
  });

  it("a voltagem impressa bate com a tabela de Grade Y", () => {
    // 220 V, Bivolt, 220 V — como impresso nas etiquetas.
    expect(ETIQUETAS.map((e) => voltageLabel(e.gradeY))).toEqual(["220V", "Bivolt", "220V"]);
  });

  it("aceita o código de 10 dígitos que a v1 recusava", () => {
    // 72627 + 2489 + 4 = 10 dígitos; a v1 exigia exatamente 7.
    expect(ETIQUETAS[1]!.barcode).toHaveLength(10);
    expect(resolveBarcode("72627.2489.4", ETIQUETAS).ok).toBe(true);
  });

  it("o separador desfaz a ambiguidade que a concatenação criaria", () => {
    // 7262.89.2 e 72628.9.2 concatenam para "7262892". Separados, não colidem.
    const colidido: CatalogEntry[] = [
      ...ETIQUETAS,
      {
        barcode: "7262892",
        code: "7262",
        gradeX: "89",
        gradeY: "2",
        description: "OUTRO PRODUTO QUALQUER",
      },
    ];
    // Sem separador o sistema recusa, porque não tem como escolher.
    expect(resolveBarcode("7262892", colidido)).toMatchObject({ failure: "AMBIGUO" });
    // Com separador, cada um resolve para a sua variante.
    expect(resolveBarcode("72628.9.2", colidido)).toMatchObject({
      ok: true,
      entry: { code: "72628" },
    });
    expect(resolveBarcode("7262.89.2", colidido)).toMatchObject({
      ok: true,
      entry: { code: "7262" },
    });
  });
});
