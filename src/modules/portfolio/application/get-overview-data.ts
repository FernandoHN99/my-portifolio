import { Prisma, type PortfolioMonthStatus } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import {
  getAllocationOverview,
  REBALANCE_TOLERANCE,
  type AllocationGroup,
} from "@/modules/portfolio/application/get-allocation-overview";
import { toMonthParam } from "@/modules/portfolio/presentation/reference-month";

export type OverviewHistoryPoint = {
  month: string;
  date: Date;
  totalBrl: number;
  byClass: Record<string, number>;
  byCurrency: Record<string, number>;
};

export type CompositionRow = {
  label: string;
  currentShare: number;
  targetShare: number | null;
};

export type CompositionGroup = {
  key: string;
  title: string;
  rows: CompositionRow[];
};

export type OverviewData = {
  referenceDate: Date;
  monthStatus: PortfolioMonthStatus;
  totalBrl: number;
  totalUsd: number | null;
  usdRate: number | null;
  btcRate: number | null;
  changeBrl: number | null;
  changePercent: number | null;
  change12mBrl: number | null;
  change12mPercent: number | null;
  positionCount: number;
  institutionCount: number;
  offTargetCount: number;
  offTargetTolerance: number;
  history: OverviewHistoryPoint[];
  composition: CompositionGroup[];
  rebalanceGroups: AllocationGroup[];
  classLabels: string[];
  currencyLabels: string[];
};

const COMPOSITION_TITLES: Record<string, string> = {
  ASSET_CLASS: "Classe de ativos",
  CURRENCY: "Moeda",
  STRATEGY: "Estratégia",
};

export async function getOverviewData(referenceDate?: Date): Promise<OverviewData | null> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return null;
  }

  try {
    const months = await prisma.portfolioMonth.findMany({
      orderBy: { referenceDate: "asc" },
      select: {
        referenceDate: true,
        status: true,
        positions: {
          select: {
            totalBrl: true,
            asset: { select: { baseCurrency: true } },
            account: { select: { institutionId: true } },
            allocations: { select: { assetClass: true, weight: true } },
          },
        },
      },
    });

    const requestedIndex = referenceDate
      ? months.findIndex((month) => month.referenceDate.getTime() === referenceDate.getTime())
      : -1;
    const selectedIndex = requestedIndex === -1 ? months.length - 1 : requestedIndex;
    const selected = months[selectedIndex];

    if (!selected || selected.positions.length === 0) {
      return null;
    }

    const history: OverviewHistoryPoint[] = months.map((month) => {
      const byClass: Record<string, number> = {};
      const byCurrency: Record<string, number> = {};
      let total = new Prisma.Decimal(0);

      for (const position of month.positions) {
        total = total.plus(position.totalBrl);
        const currency = position.asset.baseCurrency;
        byCurrency[currency] = (byCurrency[currency] ?? 0) + position.totalBrl.toNumber();

        if (position.allocations.length === 0) {
          byClass["Sem classificação"] =
            (byClass["Sem classificação"] ?? 0) + position.totalBrl.toNumber();
          continue;
        }

        for (const allocation of position.allocations) {
          const value = position.totalBrl.mul(allocation.weight).toNumber();
          byClass[allocation.assetClass] = (byClass[allocation.assetClass] ?? 0) + value;
        }
      }

      return {
        month: toMonthParam(month.referenceDate),
        date: month.referenceDate,
        totalBrl: total.toNumber(),
        byClass,
        byCurrency,
      };
    });

    const selectedHistory = history[selectedIndex];
    const previousHistory = history[selectedIndex - 1] ?? null;
    const yearAgoHistory = history[selectedIndex - 12] ?? null;
    const changeBrl = previousHistory ? selectedHistory.totalBrl - previousHistory.totalBrl : null;
    const change12mBrl = yearAgoHistory ? selectedHistory.totalBrl - yearAgoHistory.totalBrl : null;

    const quotes = await prisma.marketQuote.findMany({
      where: { referenceDate: selected.referenceDate, symbol: { in: ["USD", "BTC"] } },
      select: { symbol: true, valueBrl: true },
    });
    const usdRate = quotes.find((quote) => quote.symbol === "USD")?.valueBrl.toNumber() ?? null;
    const btcRate = quotes.find((quote) => quote.symbol === "BTC")?.valueBrl.toNumber() ?? null;

    const allocation = await getAllocationOverview(selected.referenceDate);
    const composition = (allocation?.groups ?? [])
      .filter((group) => group.key in COMPOSITION_TITLES)
      .map((group) => ({
        key: group.key,
        title: COMPOSITION_TITLES[group.key],
        rows: group.rows.map((row) => ({
          label: row.label,
          currentShare: row.currentShare,
          targetShare: row.targetShare,
        })),
      }));
    const offTargetCount = (allocation?.groups ?? []).reduce(
      (total, group) =>
        total + group.rows.filter((row) => row.direction === "BUY" || row.direction === "SELL").length,
      0,
    );

    return {
      referenceDate: selected.referenceDate,
      monthStatus: selected.status,
      totalBrl: selectedHistory.totalBrl,
      totalUsd: usdRate && usdRate !== 0 ? selectedHistory.totalBrl / usdRate : null,
      usdRate,
      btcRate,
      changeBrl,
      changePercent:
        changeBrl === null || !previousHistory || previousHistory.totalBrl === 0
          ? null
          : (changeBrl / previousHistory.totalBrl) * 100,
      change12mBrl,
      change12mPercent:
        change12mBrl === null || !yearAgoHistory || yearAgoHistory.totalBrl === 0
          ? null
          : (change12mBrl / yearAgoHistory.totalBrl) * 100,
      positionCount: selected.positions.length,
      institutionCount: new Set(
        selected.positions.map((position) => position.account.institutionId),
      ).size,
      offTargetCount,
      offTargetTolerance: REBALANCE_TOLERANCE,
      history,
      composition,
      rebalanceGroups: allocation?.groups ?? [],
      classLabels: collectLabels(history, "byClass"),
      currencyLabels: collectLabels(history, "byCurrency"),
    };
  } catch {
    return null;
  }
}

function collectLabels(history: OverviewHistoryPoint[], key: "byClass" | "byCurrency") {
  const totals = new Map<string, number>();

  for (const point of history) {
    for (const [label, value] of Object.entries(point[key])) {
      totals.set(label, (totals.get(label) ?? 0) + value);
    }
  }

  return [...totals.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([label]) => label);
}
