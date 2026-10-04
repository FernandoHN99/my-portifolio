import type { AllocationGroupKey } from "@/modules/portfolio/domain/rebalance";

// Meta de moeda sobre o patrimônio total (spec 054): não é editada, é
// calculada. Quem define a exposição a cada moeda é a moeda dentro de cada
// classe, ponderada pela meta da classe: moeda(c) = Σ classe(k) × moeda(k, c).
// Sem dependências de banco, para servir ao servidor e ao editor.

type TargetFraction = {
  scope: AllocationGroupKey | string;
  primaryLabel: string;
  secondaryLabel: string | null;
  /** Fração do grupo, de 0 a 1. */
  fraction: number;
};

/** Fração de cada moeda sobre o patrimônio total. */
export function deriveCurrencyTargets(targets: TargetFraction[]) {
  const classes = new Map<string, number>();

  for (const target of targets) {
    if (target.scope === "ASSET_CLASS") {
      classes.set(target.primaryLabel, (classes.get(target.primaryLabel) ?? 0) + target.fraction);
    }
  }

  const currencies = new Map<string, number>();

  for (const target of targets) {
    if (target.scope !== "CLASS_CURRENCY" || target.secondaryLabel === null) {
      continue;
    }

    currencies.set(
      target.secondaryLabel,
      (currencies.get(target.secondaryLabel) ?? 0) + (classes.get(target.primaryLabel) ?? 0) * target.fraction,
    );
  }

  // Uma moeda que só existe na meta sobre o total, sem classe, fica em zero.
  for (const target of targets) {
    if (target.scope === "CURRENCY" && !currencies.has(target.primaryLabel)) {
      currencies.set(target.primaryLabel, 0);
    }
  }

  return currencies;
}

/** As metas com a moeda sobre o total trocada pela calculada. */
export function withDerivedCurrency<T extends TargetFraction>(targets: T[]): TargetFraction[] {
  const derived = deriveCurrencyTargets(targets);

  return [
    ...targets.filter((target) => target.scope !== "CURRENCY"),
    ...[...derived].map(([currency, fraction]) => ({
      scope: "CURRENCY" as const,
      primaryLabel: currency,
      secondaryLabel: null,
      fraction,
    })),
  ];
}
