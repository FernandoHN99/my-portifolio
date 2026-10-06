// Rendimento automático de renda fixa e caixa em reais (spec 079), que
// substituiu a pausa global da spec 065: cada ativo liga ou desliga o cálculo,
// e cada classificação compatível do rateio tem a própria rentabilidade, como
// os bancos fazem. Pós-fixado: % do CDI; prefixado: taxa ao ano. Sem
// dependências, para o servidor e a tela.

export type AutoIncomeIndexer = "CDI" | "PRE";

/** Tipos de ativo que podem ter o cálculo: renda fixa e caixa em reais. */
export const AUTO_INCOME_TYPES = ["fixed-income", "brl-cash"] as const;

/** Subclasses compatíveis e o indexador de cada uma. */
export const AUTO_INCOME_SUBCLASSES: Record<string, AutoIncomeIndexer> = {
  "Pós-fixado": "CDI",
  Prefixado: "PRE",
};

export function supportsAutoIncome(assetType: string | null | undefined) {
  return (AUTO_INCOME_TYPES as readonly string[]).includes(assetType ?? "");
}

/** Indexador pela subclasse do rateio, ou nulo quando ela não é compatível. */
export function indexerOfSubclass(subclass: string | null | undefined): AutoIncomeIndexer | null {
  return subclass ? (AUTO_INCOME_SUBCLASSES[subclass] ?? null) : null;
}

/** Parte do rendimento: uma classificação, com o peso no rateio e a taxa dela. */
export type IncomePart = { indexer: AutoIncomeIndexer; weight: string; ratePercent: string };

type AllocationRate = { subclass: string; weight: unknown; ratePercent: unknown };

/**
 * Partes do rendimento pelas classificações: todas precisam ser pós-fixadas ou
 * prefixadas e ter a taxa; senão, nulo.
 */
export function incomeParts(allocations: readonly AllocationRate[]): IncomePart[] | null {
  if (allocations.length === 0) {
    return null;
  }

  const parts: IncomePart[] = [];

  for (const allocation of allocations) {
    const indexer = indexerOfSubclass(allocation.subclass);
    const rate = allocation.ratePercent === null || allocation.ratePercent === undefined ? null : String(allocation.ratePercent);

    if (!indexer || rate === null || !(Number(rate) > 0)) {
      return null;
    }

    parts.push({ indexer, weight: String(allocation.weight), ratePercent: rate });
  }

  return parts;
}

/**
 * Partes do cálculo automático da posição, ou nulo quando ele está desligado:
 * a flag do ativo, sem cotação de mercado, e todas as classificações com taxa.
 */
export function autoIncomeParts(
  asset: { autoIncome: boolean; quoteSymbol: string | null },
  allocations: readonly AllocationRate[],
): IncomePart[] | null {
  return asset.autoIncome && !asset.quoteSymbol ? incomeParts(allocations) : null;
}
