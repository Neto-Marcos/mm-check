/**
 * Leitura e validacao de codigo de barras CODE 128.
 *
 * Funcoes puras, sem I/O: sao as regras de negocio que mais custaram a
 * descobrir em producao, entao ficam isoladas e cobertas por teste.
 *
 * Formato: 7 digitos — SKU (5) + cor (1) + voltagem (1).
 */

export type Voltage = "BIVOLT" | "V127" | "V220";

export const VOLTAGE_LABEL: Record<Voltage, string> = {
  BIVOLT: "Bivolt",
  V127: "127V",
  V220: "220V",
};

/**
 * Mapa de codigo de voltagem, herdado do sistema v1.
 * Dois codigos distintos podem significar a mesma voltagem — por isso a
 * comparacao e feita sobre a voltagem resolvida, nunca sobre o digito cru.
 */
const VOLTAGE_BY_CODE: Record<string, Voltage> = {
  "0": "BIVOLT",
  "4": "BIVOLT",
  "1": "V127",
  "3": "V127",
  "2": "V220",
};

/**
 * SKUs cujo codigo impresso na etiqueta nao corresponde aos digitos do SKU.
 * Excecoes reais de catalogo, descobertas na operacao.
 */
const BARCODE_OVERRIDES: Record<string, string> = {
  "75480-1.2": "7548143",
};

export class InvalidBarcodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBarcodeError";
  }
}

export type ProductCode = {
  sku: string;
  color: string;
  voltageCode: string;
  voltage: Voltage;
};

/** Converte um SKU de catalogo no codigo de barras esperado. */
export function barcodeForSku(sku: string): string {
  return BARCODE_OVERRIDES[sku] ?? sku.replace(/\D/g, "");
}

export function parseBarcode(raw: string | null | undefined): ProductCode {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length !== 7) {
    throw new InvalidBarcodeError(
      "Código inválido. O CODE 128 deve conter SKU de 5 dígitos, cor e voltagem.",
    );
  }
  const voltageCode = digits.slice(6, 7);
  const voltage = VOLTAGE_BY_CODE[voltageCode];
  if (!voltage) {
    throw new InvalidBarcodeError(`Código de voltagem inválido: ${voltageCode}`);
  }
  return { sku: digits.slice(0, 5), color: digits.slice(5, 6), voltageCode, voltage };
}

export type ScanVerdict =
  | { accepted: true; expected: ProductCode; scanned: ProductCode }
  | { accepted: false; reason: string; expected: ProductCode; scanned: ProductCode };

/** Compara a leitura do coletor com o item esperado do mapa. */
export function validateScan(expectedRaw: string, scannedRaw: string): ScanVerdict {
  const expected = parseBarcode(expectedRaw);
  const scanned = parseBarcode(scannedRaw);

  if (expected.sku !== scanned.sku) {
    return { accepted: false, reason: "SKU incorreto", expected, scanned };
  }
  if (expected.color !== scanned.color) {
    return { accepted: false, reason: "Cor incorreta", expected, scanned };
  }
  if (expected.voltage !== scanned.voltage) {
    return { accepted: false, reason: "Voltagem incorreta", expected, scanned };
  }
  return { accepted: true, expected, scanned };
}
