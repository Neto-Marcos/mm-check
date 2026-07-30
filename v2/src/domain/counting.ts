/**
 * Regras da contagem de estoque.
 *
 * O saldo do sistema e sempre um snapshot tirado no inicio da contagem, nunca
 * o saldo "ao vivo". Sem isso, um import de PDF no meio da contagem mudaria a
 * base de comparacao e as divergencias ficariam sem sentido.
 */

export type CountInput = {
  sku: string;
  systemQty: number;
  countedQty: number;
  damagedQty: number;
  otherQty: number;
};

export type CountLine = CountInput & {
  /** Total fisico encontrado, somando avariados e outros locais. */
  physicalQty: number;
  /** Positivo = sobra no fisico, negativo = falta. */
  difference: number;
  status: "OK" | "SOBRA" | "FALTA";
};

export const SKU_PATTERN = /^[A-Za-z0-9.\-]{1,64}$/;

export class CountValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CountValidationError";
  }
}

export function evaluateLine(input: CountInput): CountLine {
  const physicalQty = input.countedQty + input.damagedQty + input.otherQty;
  const difference = physicalQty - input.systemQty;
  return {
    ...input,
    physicalQty,
    difference,
    status: difference === 0 ? "OK" : difference > 0 ? "SOBRA" : "FALTA",
  };
}

/**
 * Valida e consolida as linhas enviadas pelo operador.
 * Rejeita SKU fora do snapshot e SKU duplicado — os dois casos indicam que o
 * cliente esta trabalhando sobre uma base desatualizada.
 */
export function buildCount(
  inputs: Omit<CountInput, "systemQty">[],
  snapshot: Map<string, number>,
): CountLine[] {
  if (inputs.length === 0) {
    throw new CountValidationError("Não há contagens para registrar.");
  }
  if (snapshot.size === 0) {
    throw new CountValidationError("Importe um PDF de saldo antes de registrar a contagem.");
  }

  const seen = new Set<string>();
  return inputs.map((input) => {
    const sku = input.sku.trim();
    if (!SKU_PATTERN.test(sku)) {
      throw new CountValidationError(`SKU inválido na contagem: ${sku}`);
    }
    if (seen.has(sku)) {
      throw new CountValidationError(`SKU duplicado na contagem: ${sku}`);
    }
    seen.add(sku);

    const systemQty = snapshot.get(sku);
    if (systemQty === undefined) {
      throw new CountValidationError(`SKU não pertence ao saldo atual: ${sku}`);
    }
    if (input.countedQty < 0 || input.damagedQty < 0 || input.otherQty < 0) {
      throw new CountValidationError("As quantidades não podem ser negativas.");
    }
    return evaluateLine({ ...input, sku, systemQty });
  });
}

export function summarize(lines: CountLine[]) {
  return {
    total: lines.length,
    ok: lines.filter((line) => line.status === "OK").length,
    sobra: lines.filter((line) => line.status === "SOBRA").length,
    falta: lines.filter((line) => line.status === "FALTA").length,
    net: lines.reduce((acc, line) => acc + line.difference, 0),
  };
}
