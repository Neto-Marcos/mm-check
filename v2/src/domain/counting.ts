/**
 * Regras da contagem de estoque.
 *
 * O saldo do sistema e sempre um snapshot tirado na abertura da contagem,
 * nunca o saldo "ao vivo". Sem isso, um import de PDF no meio da contagem
 * mudaria a base de comparacao e as divergencias ficariam sem sentido.
 *
 * O grao e a variante (produto + grade de cor + grade de voltagem), nao o
 * modelo. Contar um refrigerador 127V junto com o 220V esconde falta.
 */

export type CountInput = {
  productId: string;
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

export class CountValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CountValidationError";
  }
}

export function evaluateLine<T extends CountInput>(input: T): T & CountLine {
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
 * Rejeita variante fora do snapshot e variante duplicada — os dois casos
 * indicam que o cliente esta trabalhando sobre uma base desatualizada.
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
    if (seen.has(input.productId)) {
      throw new CountValidationError(`Produto duplicado na contagem: ${input.productId}`);
    }
    seen.add(input.productId);

    const systemQty = snapshot.get(input.productId);
    if (systemQty === undefined) {
      throw new CountValidationError(
        `Produto não pertence ao saldo desta contagem: ${input.productId}`,
      );
    }
    if (input.countedQty < 0 || input.damagedQty < 0 || input.otherQty < 0) {
      throw new CountValidationError("As quantidades não podem ser negativas.");
    }
    return evaluateLine({ ...input, systemQty });
  });
}

export function summarize(lines: Pick<CountLine, "status" | "difference">[]) {
  return {
    total: lines.length,
    ok: lines.filter((line) => line.status === "OK").length,
    sobra: lines.filter((line) => line.status === "SOBRA").length,
    falta: lines.filter((line) => line.status === "FALTA").length,
    net: lines.reduce((acc, line) => acc + line.difference, 0),
  };
}
