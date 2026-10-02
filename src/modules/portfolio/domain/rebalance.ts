export type RebalanceDirection = "SELL" | "BUY" | "BALANCED";

export const DEFAULT_REBALANCE_TOLERANCE = 2;
export const MAX_REBALANCE_TOLERANCE = 20;

export const UNCLASSIFIED_LABEL = "Sem classificação";
export const FIXED_INCOME_CLASS = "Renda Fixa";
export const VARIABLE_INCOME_CLASS = "Renda Variável";

export type AllocationGroupKey =
  | "ASSET_CLASS"
  | "CURRENCY"
  | "STRATEGY"
  | "CLASS_CURRENCY"
  | "FIXED_INCOME"
  | "VARIABLE_INCOME";

export type AllocationRow = {
  key: string;
  label: string;
  currentBrl: number;
  currentShare: number;
  targetShare: number | null;
  targetBrl: number | null;
  differenceShare: number | null;
  differenceBrl: number | null;
  direction: RebalanceDirection | null;
};

export type AllocationGroup = {
  key: AllocationGroupKey;
  title: string;
  description: string;
  rows: AllocationRow[];
};

type FlatTotal = { label: string; value: number };
type NestedTotal = { primary: string; secondary: string | null; value: number };

export type AllocationAggregates = {
  totalBrl: number;
  unclassifiedBrl: number;
  assetClass: FlatTotal[];
  currency: FlatTotal[];
  strategy: FlatTotal[];
  classCurrency: NestedTotal[];
  fixedIncome: NestedTotal[];
  variableIncome: NestedTotal[];
};

export type TargetValue = {
  scope: AllocationGroupKey;
  primaryLabel: string;
  secondaryLabel: string | null;
  fraction: number;
};

export function buildAllocationGroups(
  aggregates: AllocationAggregates,
  targets: TargetValue[],
  tolerance: number,
): AllocationGroup[] {
  const { totalBrl } = aggregates;
  const classTotals = new Map(aggregates.assetClass.map((entry) => [entry.label, entry.value]));
  const classTargetBrl = new Map(
    targets
      .filter((target) => target.scope === "ASSET_CLASS")
      .map((target) => [target.primaryLabel, target.fraction * totalBrl]),
  );
  const parentTargetBrl = (label: string) => classTargetBrl.get(label) ?? 0;
  const parentTotal = (label: string) => classTotals.get(label) ?? 0;

  return [
    {
      key: "ASSET_CLASS",
      title: "Classe de ativos",
      description: "Percentual sobre o patrimônio total da competência.",
      rows: buildFlatRows(aggregates.assetClass, totalBrl, targets, "ASSET_CLASS", tolerance, aggregates.unclassifiedBrl),
    },
    {
      key: "CURRENCY",
      title: "Moeda geral",
      description: "Percentual sobre o patrimônio total da competência.",
      rows: buildFlatRows(aggregates.currency, totalBrl, targets, "CURRENCY", tolerance),
    },
    {
      key: "STRATEGY",
      title: "Estratégia",
      description: "Percentual sobre o patrimônio total da competência.",
      rows: buildFlatRows(aggregates.strategy, totalBrl, targets, "STRATEGY", tolerance),
    },
    {
      key: "CLASS_CURRENCY",
      title: "Moeda por classe",
      description: "Percentual sobre o total atual de cada classe.",
      rows: buildNestedRows(aggregates.classCurrency, targets, "CLASS_CURRENCY", tolerance, (primary) => ({
        denominator: parentTotal(primary),
        targetBase: parentTargetBrl(primary),
      })),
    },
    {
      key: "FIXED_INCOME",
      title: "Renda fixa — subclasse e prazo",
      description: `Percentual sobre o total atual de ${FIXED_INCOME_CLASS}.`,
      rows: buildNestedRows(aggregates.fixedIncome, targets, "FIXED_INCOME", tolerance, () => ({
        denominator: parentTotal(FIXED_INCOME_CLASS),
        targetBase: parentTargetBrl(FIXED_INCOME_CLASS),
      })),
    },
    {
      key: "VARIABLE_INCOME",
      title: "Renda variável — subclasse",
      description: `Percentual sobre o total atual de ${VARIABLE_INCOME_CLASS}.`,
      rows: buildNestedRows(aggregates.variableIncome, targets, "VARIABLE_INCOME", tolerance, () => ({
        denominator: parentTotal(VARIABLE_INCOME_CLASS),
        targetBase: parentTargetBrl(VARIABLE_INCOME_CLASS),
      })),
    },
  ];
}

export function countOffTarget(groups: AllocationGroup[]) {
  return groups.reduce(
    (total, group) => total + group.rows.filter((row) => row.direction === "BUY" || row.direction === "SELL").length,
    0,
  );
}

function buildFlatRows(
  totals: FlatTotal[],
  totalBrl: number,
  targets: TargetValue[],
  scope: AllocationGroupKey,
  tolerance: number,
  unclassifiedBrl?: number,
): AllocationRow[] {
  const targetByLabel = new Map(
    targets.filter((target) => target.scope === scope).map((target) => [target.primaryLabel, target.fraction]),
  );
  const rows = totals.map(({ label, value }) =>
    toRow(label, label, value, totalBrl, totalBrl, targetByLabel.get(label) ?? null, tolerance),
  );
  const present = new Set(totals.map((entry) => entry.label));

  // Meta sem posição na competência (spec 030): entra com valor atual zero e
  // vira "Comprar" quando o ideal passa da tolerância.
  for (const [label, fraction] of targetByLabel) {
    if (fraction > 0 && !present.has(label)) {
      rows.push(toRow(label, label, 0, totalBrl, totalBrl, fraction, tolerance));
    }
  }

  if (unclassifiedBrl !== undefined && unclassifiedBrl > 0) {
    rows.push(toRow(UNCLASSIFIED_LABEL, UNCLASSIFIED_LABEL, unclassifiedBrl, totalBrl, totalBrl, null, tolerance));
  }

  return rows.sort((left, right) => right.currentBrl - left.currentBrl);
}

function buildNestedRows(
  totals: NestedTotal[],
  targets: TargetValue[],
  scope: AllocationGroupKey,
  tolerance: number,
  bases: (primary: string) => { denominator: number; targetBase: number },
): AllocationRow[] {
  const scoped = targets.filter((target) => target.scope === scope);
  const withTargets: NestedTotal[] = [
    ...totals,
    // Meta sem posição na competência (spec 030), com valor atual zero.
    ...scoped
      .filter(
        (target) =>
          target.fraction > 0 &&
          !totals.some((total) => total.primary === target.primaryLabel && total.secondary === target.secondaryLabel),
      )
      .map((target) => ({ primary: target.primaryLabel, secondary: target.secondaryLabel, value: 0 })),
  ];

  return withTargets
    .map(({ primary, secondary, value }) => {
      const target = scoped.find(
        (candidate) => candidate.primaryLabel === primary && candidate.secondaryLabel === secondary,
      );
      const { denominator, targetBase } = bases(primary);

      return toRow(
        `${primary}\u0000${secondary ?? ""}`,
        secondary !== null ? `${primary} · ${secondary}` : primary,
        value,
        denominator,
        targetBase,
        target?.fraction ?? null,
        tolerance,
      );
    })
    .sort((left, right) => right.currentBrl - left.currentBrl);
}

function toRow(
  key: string,
  label: string,
  currentBrl: number,
  denominatorBrl: number,
  targetBaseBrl: number,
  targetFraction: number | null,
  tolerance: number,
): AllocationRow {
  const currentShare = denominatorBrl === 0 ? 0 : (currentBrl / denominatorBrl) * 100;
  const targetShare = targetFraction === null ? null : targetFraction * 100;
  const targetBrl = targetFraction === null ? null : targetFraction * targetBaseBrl;
  const differenceShare = targetShare === null ? null : currentShare - targetShare;
  const differenceBrl = targetBrl === null ? null : currentBrl - targetBrl;

  return {
    key,
    label,
    currentBrl,
    currentShare,
    targetShare,
    targetBrl,
    differenceShare,
    differenceBrl,
    direction:
      differenceShare === null || differenceBrl === null
        ? null
        : Math.abs(differenceShare) <= tolerance
          ? "BALANCED"
          : differenceBrl > 0
            ? "SELL"
            : "BUY",
  };
}
