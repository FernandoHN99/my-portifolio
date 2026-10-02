import { getPrismaClient } from "@/lib/prisma";
import { toMonthParam } from "@/modules/portfolio/presentation/reference-month";
import { currentReferenceMonth } from "@/modules/quotes/domain/calendar";

export type EditingCatalog = {
  accounts: { id: string; label: string }[];
  assets: { id: string; name: string; ticker: string | null; quoteSymbol: string | null; baseCurrency: string }[];
  strategies: string[];
  allocation: { classes: string[]; subclasses: string[]; durations: string[] };
  clone: { allowed: boolean; sourceMonth: string | null; targetMonth: string | null };
};

const EMPTY_CATALOG: EditingCatalog = {
  accounts: [],
  assets: [],
  strategies: [],
  allocation: { classes: [], subclasses: [], durations: [] },
  clone: { allowed: false, sourceMonth: null, targetMonth: null },
};

export async function getEditingCatalog(): Promise<EditingCatalog> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return EMPTY_CATALOG;
  }

  try {
    const [accounts, assets, strategies, allocations, targets, latest] = await Promise.all([
      prisma.account.findMany({
        select: { id: true, name: true, institution: { select: { name: true } } },
      }),
      prisma.asset.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, ticker: true, quoteSymbol: true, baseCurrency: true },
      }),
      prisma.position.findMany({
        where: { strategy: { not: null } },
        distinct: ["strategy"],
        select: { strategy: true },
      }),
      prisma.positionAllocation.findMany({
        distinct: ["assetClass", "subclass", "duration"],
        select: { assetClass: true, subclass: true, duration: true },
      }),
      prisma.allocationTarget.findMany({
        where: { scope: { in: ["ASSET_CLASS", "STRATEGY"] } },
        select: { scope: true, primaryLabel: true },
      }),
      prisma.portfolioMonth.findFirst({
        orderBy: { referenceDate: "desc" },
        select: { referenceDate: true },
      }),
    ]);

    const sorted = (values: Iterable<string>) =>
      [...new Set(values)].sort((left, right) => left.localeCompare(right, "pt-BR"));
    const target = latest
      ? new Date(Date.UTC(latest.referenceDate.getUTCFullYear(), latest.referenceDate.getUTCMonth() + 1, 1))
      : null;

    return {
      accounts: accounts
        .map((account) => ({
          id: account.id,
          label: `${account.institution.name} · ${account.name}`,
        }))
        .sort((left, right) => left.label.localeCompare(right.label, "pt-BR")),
      assets,
      strategies: sorted([
        ...strategies.flatMap((entry) => (entry.strategy ? [entry.strategy] : [])),
        ...targets.filter((entry) => entry.scope === "STRATEGY").map((entry) => entry.primaryLabel),
      ]),
      allocation: {
        classes: sorted([
          ...allocations.map((entry) => entry.assetClass),
          ...targets.filter((entry) => entry.scope === "ASSET_CLASS").map((entry) => entry.primaryLabel),
        ]),
        subclasses: sorted(allocations.map((entry) => entry.subclass)),
        durations: sorted(allocations.map((entry) => entry.duration)),
      },
      clone: {
        allowed: target !== null && target.getTime() <= currentReferenceMonth().getTime(),
        sourceMonth: latest ? toMonthParam(latest.referenceDate) : null,
        targetMonth: target ? toMonthParam(target) : null,
      },
    };
  } catch {
    return EMPTY_CATALOG;
  }
}
