import { Prisma, type PortfolioMonthStatus } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";

export type PortfolioHistoryPoint = {
  date: Date;
  totalBrl: number;
};

export type PortfolioBreakdownItem = {
  label: string;
  valueBrl: number;
  share: number;
};

export type PortfolioPositionItem = {
  id: string;
  assetName: string;
  ticker: string | null;
  institutionName: string;
  accountName: string;
  baseCurrency: string;
  totalBrl: number;
};

export type PortfolioOverview = {
  referenceDate: Date;
  monthStatus: PortfolioMonthStatus;
  updateRunId: string | null;
  totalBrl: number;
  previousTotalBrl: number | null;
  changeBrl: number | null;
  changePercent: number | null;
  positionCount: number;
  institutionCount: number;
  history: PortfolioHistoryPoint[];
  institutions: PortfolioBreakdownItem[];
  currencies: PortfolioBreakdownItem[];
  topPositions: PortfolioPositionItem[];
};

type PositionWithRelations = {
  id: string;
  totalBrl: Prisma.Decimal;
  asset: {
    name: string;
    ticker: string | null;
    baseCurrency: string;
  };
  account: {
    name: string;
    institution: { name: string };
  };
};

export async function getPortfolioOverview(): Promise<PortfolioOverview | null> {
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
        targetUpdate: { select: { id: true } },
        positions: {
          select: {
            id: true,
            totalBrl: true,
            asset: {
              select: {
                name: true,
                ticker: true,
                baseCurrency: true,
              },
            },
            account: {
              select: {
                name: true,
                institution: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    const latestMonth = months.at(-1);

    if (!latestMonth || latestMonth.positions.length === 0) {
      return null;
    }

    const history = months.map((month) => ({
      date: month.referenceDate,
      totalBrl: sumPositions(month.positions).toNumber(),
    }));
    const latestHistory = history.at(-1)!;
    const previousHistory = history.at(-2) ?? null;
    const changeBrl = previousHistory
      ? latestHistory.totalBrl - previousHistory.totalBrl
      : null;
    const changePercent =
      previousHistory && previousHistory.totalBrl !== 0
        ? (changeBrl! / previousHistory.totalBrl) * 100
        : null;

    const institutionTotals = aggregatePositions(
      latestMonth.positions,
      (position) => position.account.institution.name,
    );
    const currencyTotals = aggregatePositions(
      latestMonth.positions,
      (position) => position.asset.baseCurrency,
    );
    const totalBrl = latestHistory.totalBrl;

    return {
      referenceDate: latestMonth.referenceDate,
      monthStatus: latestMonth.status,
      updateRunId: latestMonth.targetUpdate?.id ?? null,
      totalBrl,
      previousTotalBrl: previousHistory?.totalBrl ?? null,
      changeBrl,
      changePercent,
      positionCount: latestMonth.positions.length,
      institutionCount: institutionTotals.length,
      history,
      institutions: withShares(institutionTotals, totalBrl),
      currencies: withShares(currencyTotals, totalBrl),
      topPositions: [...latestMonth.positions]
        .sort((left, right) => right.totalBrl.comparedTo(left.totalBrl))
        .slice(0, 6)
        .map((position) => ({
          id: position.id,
          assetName: position.asset.name,
          ticker: position.asset.ticker,
          institutionName: position.account.institution.name,
          accountName: position.account.name,
          baseCurrency: position.asset.baseCurrency,
          totalBrl: position.totalBrl.toNumber(),
        })),
    };
  } catch {
    return null;
  }
}

function sumPositions(positions: PositionWithRelations[]) {
  return positions.reduce(
    (total, position) => total.plus(position.totalBrl),
    new Prisma.Decimal(0),
  );
}

function aggregatePositions(
  positions: PositionWithRelations[],
  getLabel: (position: PositionWithRelations) => string,
) {
  const totals = new Map<string, Prisma.Decimal>();

  for (const position of positions) {
    const label = getLabel(position);
    totals.set(label, (totals.get(label) ?? new Prisma.Decimal(0)).plus(position.totalBrl));
  }

  return [...totals.entries()]
    .map(([label, value]) => ({ label, valueBrl: value.toNumber() }))
    .sort((left, right) => right.valueBrl - left.valueBrl);
}

function withShares(
  items: Array<{ label: string; valueBrl: number }>,
  totalBrl: number,
): PortfolioBreakdownItem[] {
  return items.map((item) => ({
    ...item,
    share: totalBrl === 0 ? 0 : (item.valueBrl / totalBrl) * 100,
  }));
}
