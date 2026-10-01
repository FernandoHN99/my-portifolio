import { Prisma, type PortfolioMonthStatus } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";

export type RebalanceDirection = "SELL" | "BUY" | "BALANCED";

export const REBALANCE_TOLERANCE = 2;

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

export type AllocationGroupKey =
  | "ASSET_CLASS"
  | "CURRENCY"
  | "STRATEGY"
  | "CLASS_CURRENCY"
  | "FIXED_INCOME"
  | "VARIABLE_INCOME";

export type AllocationGroup = {
  key: AllocationGroupKey;
  title: string;
  description: string;
  rows: AllocationRow[];
};

export type AllocationOverview = {
  referenceDate: Date;
  monthStatus: PortfolioMonthStatus;
  totalBrl: number;
  hasTargetPlan: boolean;
  unclassifiedBrl: number;
  unclassifiedShare: number;
  groups: AllocationGroup[];
};

type PositionForAllocation = {
  totalBrl: Prisma.Decimal;
  strategy: string | null;
  asset: { baseCurrency: string };
  allocations: { assetClass: string; subclass: string; duration: string; weight: Prisma.Decimal }[];
};

const UNCLASSIFIED_LABEL = "Sem classificação";
const FIXED_INCOME_CLASS = "Renda Fixa";
const VARIABLE_INCOME_CLASS = "Renda Variável";

export async function getAllocationOverview(
  referenceDate?: Date,
): Promise<AllocationOverview | null> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return null;
  }

  try {
    const latestMonth = await prisma.portfolioMonth.findFirst({
      where: referenceDate ? { referenceDate } : undefined,
      orderBy: { referenceDate: "desc" },
      select: {
        referenceDate: true,
        status: true,
        positions: {
          select: {
            totalBrl: true,
            strategy: true,
            asset: { select: { baseCurrency: true } },
            allocations: {
              select: { assetClass: true, subclass: true, duration: true, weight: true },
            },
          },
        },
      },
    });

    if (!latestMonth || latestMonth.positions.length === 0) {
      return null;
    }

    const targetPlan = await prisma.targetPlan.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      select: {
        targets: {
          select: { scope: true, primaryLabel: true, secondaryLabel: true, percentage: true },
        },
      },
    });
    const targets = targetPlan?.targets ?? [];

    const positions = latestMonth.positions;
    const totalBrl = sum(positions.map((position) => position.totalBrl)).toNumber();
    const unclassifiedBrl = sum(
      positions
        .filter((position) => position.allocations.length === 0)
        .map((position) => position.totalBrl),
    ).toNumber();

    const assetClassTotals = aggregateByClass(positions);
    const currencyTotals = aggregateBy(positions, (position) => position.asset.baseCurrency);
    const strategyTotals = aggregateBy(positions, (position) => position.strategy ?? UNCLASSIFIED_LABEL);
    const classCurrencyTotals = aggregateClassCurrency(positions);
    const fixedIncomeTotals = aggregateClassSubclass(positions, FIXED_INCOME_CLASS, true);
    const variableIncomeTotals = aggregateClassSubclass(positions, VARIABLE_INCOME_CLASS, false);

    const assetClassTargetBrl = new Map(
      targets
        .filter((target) => target.scope === "ASSET_CLASS")
        .map((target) => [target.primaryLabel, target.percentage.toNumber() * totalBrl]),
    );
    const parentTargetBrl = (label: string) => assetClassTargetBrl.get(label) ?? 0;

    const groups: AllocationGroup[] = [
      {
        key: "ASSET_CLASS",
        title: "Classe de ativos",
        description: "Percentual sobre o patrimônio total da competência.",
        rows: buildRows(assetClassTotals, totalBrl, totalBrl, targets, "ASSET_CLASS", unclassifiedBrl),
      },
      {
        key: "CURRENCY",
        title: "Moeda geral",
        description: "Percentual sobre o patrimônio total da competência.",
        rows: buildRows(currencyTotals, totalBrl, totalBrl, targets, "CURRENCY"),
      },
      {
        key: "STRATEGY",
        title: "Estratégia",
        description: "Percentual sobre o patrimônio total da competência.",
        rows: buildRows(strategyTotals, totalBrl, totalBrl, targets, "STRATEGY"),
      },
      {
        key: "CLASS_CURRENCY",
        title: "Moeda por classe",
        description: "Percentual sobre o total atual de cada classe.",
        rows: buildNestedRows(
          classCurrencyTotals,
          assetClassTotals,
          parentTargetBrl,
          targets,
          "CLASS_CURRENCY",
        ),
      },
      {
        key: "FIXED_INCOME",
        title: "Renda fixa — subclasse e prazo",
        description: `Percentual sobre o total atual de ${FIXED_INCOME_CLASS}.`,
        rows: buildNestedRows(
          fixedIncomeTotals,
          new Map([[FIXED_INCOME_CLASS, assetClassTotals.get(FIXED_INCOME_CLASS) ?? new Prisma.Decimal(0)]]),
          parentTargetBrl,
          targets,
          "FIXED_INCOME",
          FIXED_INCOME_CLASS,
        ),
      },
      {
        key: "VARIABLE_INCOME",
        title: "Renda variável — subclasse",
        description: `Percentual sobre o total atual de ${VARIABLE_INCOME_CLASS}.`,
        rows: buildNestedRows(
          variableIncomeTotals,
          new Map([[VARIABLE_INCOME_CLASS, assetClassTotals.get(VARIABLE_INCOME_CLASS) ?? new Prisma.Decimal(0)]]),
          parentTargetBrl,
          targets,
          "VARIABLE_INCOME",
          VARIABLE_INCOME_CLASS,
        ),
      },
    ];

    return {
      referenceDate: latestMonth.referenceDate,
      monthStatus: latestMonth.status,
      totalBrl,
      hasTargetPlan: targets.length > 0,
      unclassifiedBrl,
      unclassifiedShare: totalBrl === 0 ? 0 : (unclassifiedBrl / totalBrl) * 100,
      groups,
    };
  } catch {
    return null;
  }
}

function sum(values: Prisma.Decimal[]) {
  return values.reduce((total, value) => total.plus(value), new Prisma.Decimal(0));
}

function aggregateBy(
  positions: PositionForAllocation[],
  getLabel: (position: PositionForAllocation) => string,
) {
  const totals = new Map<string, Prisma.Decimal>();

  for (const position of positions) {
    const label = getLabel(position);
    totals.set(label, (totals.get(label) ?? new Prisma.Decimal(0)).plus(position.totalBrl));
  }

  return totals;
}

function aggregateByClass(positions: PositionForAllocation[]) {
  const totals = new Map<string, Prisma.Decimal>();

  for (const position of positions) {
    for (const allocation of position.allocations) {
      const contribution = position.totalBrl.mul(allocation.weight);
      totals.set(
        allocation.assetClass,
        (totals.get(allocation.assetClass) ?? new Prisma.Decimal(0)).plus(contribution),
      );
    }
  }

  return totals;
}

type NestedTotal = { primary: string; secondary: string | null; value: Prisma.Decimal };

function aggregateClassCurrency(positions: PositionForAllocation[]): NestedTotal[] {
  const totals = new Map<string, NestedTotal>();

  for (const position of positions) {
    for (const allocation of position.allocations) {
      const contribution = position.totalBrl.mul(allocation.weight);
      const primary = allocation.assetClass;
      const secondary = position.asset.baseCurrency;
      const key = JSON.stringify([primary, secondary]);
      const existing = totals.get(key);
      totals.set(key, {
        primary,
        secondary,
        value: (existing?.value ?? new Prisma.Decimal(0)).plus(contribution),
      });
    }
  }

  return [...totals.values()];
}

function aggregateClassSubclass(
  positions: PositionForAllocation[],
  assetClass: string,
  includeDuration: boolean,
): NestedTotal[] {
  const totals = new Map<string, NestedTotal>();

  for (const position of positions) {
    for (const allocation of position.allocations) {
      if (allocation.assetClass !== assetClass) continue;
      const contribution = position.totalBrl.mul(allocation.weight);
      const primary = allocation.subclass;
      const secondary = includeDuration ? allocation.duration : null;
      const key = JSON.stringify([primary, secondary]);
      const existing = totals.get(key);
      totals.set(key, {
        primary,
        secondary,
        value: (existing?.value ?? new Prisma.Decimal(0)).plus(contribution),
      });
    }
  }

  return [...totals.values()];
}

function buildRows(
  totals: Map<string, Prisma.Decimal>,
  denominatorBrl: number,
  targetBaseBrl: number,
  targets: { scope: string; primaryLabel: string; secondaryLabel: string | null; percentage: Prisma.Decimal }[],
  scope: string,
  unclassifiedBrl?: number,
): AllocationRow[] {
  const targetByLabel = new Map(
    targets.filter((target) => target.scope === scope).map((target) => [target.primaryLabel, target.percentage]),
  );

  const rows = [...totals.entries()].map(([label, value]) =>
    toRow(
      label,
      label,
      value.toNumber(),
      denominatorBrl,
      targetBaseBrl,
      targetByLabel.get(label) ?? null,
    ),
  );

  if (unclassifiedBrl !== undefined && unclassifiedBrl > 0) {
    rows.push(
      toRow(UNCLASSIFIED_LABEL, UNCLASSIFIED_LABEL, unclassifiedBrl, denominatorBrl, targetBaseBrl, null),
    );
  }

  return rows.sort((left, right) => right.currentBrl - left.currentBrl);
}

function buildNestedRows(
  totals: NestedTotal[],
  parentTotals: Map<string, Prisma.Decimal>,
  parentTargetBrl: (label: string) => number,
  targets: { scope: string; primaryLabel: string; secondaryLabel: string | null; percentage: Prisma.Decimal }[],
  scope: string,
  fixedParent?: string,
): AllocationRow[] {
  const scopedTargets = targets.filter((target) => target.scope === scope);

  const rows = totals.map(({ primary, secondary, value }) => {
    const parentKey = fixedParent ?? primary;
    const denominatorBrl = (parentTotals.get(parentKey) ?? new Prisma.Decimal(0)).toNumber();
    const target = scopedTargets.find(
      (candidate) =>
        candidate.primaryLabel === primary && candidate.secondaryLabel === secondary,
    );
    const label = secondary !== null ? `${primary} · ${secondary}` : primary;
    const key = `${primary}\u0000${secondary ?? ""}`;

    return toRow(
      key,
      label,
      value.toNumber(),
      denominatorBrl,
      parentTargetBrl(parentKey),
      target?.percentage ?? null,
    );
  });

  return rows.sort((left, right) => right.currentBrl - left.currentBrl);
}

function toRow(
  key: string,
  label: string,
  currentBrl: number,
  denominatorBrl: number,
  targetBaseBrl: number,
  targetPercentage: Prisma.Decimal | null,
): AllocationRow {
  const currentShare = denominatorBrl === 0 ? 0 : (currentBrl / denominatorBrl) * 100;
  const targetShare = targetPercentage === null ? null : targetPercentage.mul(100).toNumber();
  const targetBrl = targetPercentage === null ? null : targetPercentage.toNumber() * targetBaseBrl;
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
        : Math.abs(differenceShare) <= REBALANCE_TOLERANCE
          ? "BALANCED"
          : differenceBrl > 0
            ? "SELL"
            : "BUY",
  };
}
