import { Prisma, type PortfolioMonthStatus } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";

export type MonthPositionAllocation = {
  assetClass: string;
  subclass: string;
  duration: string;
  weight: number;
};

export type MonthPosition = {
  id: string;
  assetName: string;
  ticker: string | null;
  quoteSymbol: string | null;
  institutionName: string;
  accountName: string;
  strategy: string | null;
  baseCurrency: string;
  quantity: number;
  unitPriceBrl: number | null;
  totalBrl: number;
  totalUsd: number | null;
  share: number;
  allocations: MonthPositionAllocation[];
};

export type MonthPositions = {
  referenceDate: Date;
  status: PortfolioMonthStatus;
  totalBrl: number;
  usdRate: number | null;
  positions: MonthPosition[];
};

export async function getMonthPositions(
  referenceDate?: Date,
): Promise<MonthPositions | null> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return null;
  }

  try {
    const month = await prisma.portfolioMonth.findFirst({
      where: referenceDate ? { referenceDate } : undefined,
      orderBy: { referenceDate: "desc" },
      select: {
        referenceDate: true,
        status: true,
        positions: {
          select: {
            id: true,
            quantity: true,
            unitPriceBrl: true,
            totalBrl: true,
            strategy: true,
            asset: {
              select: { name: true, ticker: true, quoteSymbol: true, baseCurrency: true },
            },
            account: {
              select: { name: true, institution: { select: { name: true } } },
            },
            allocations: {
              select: { assetClass: true, subclass: true, duration: true, weight: true },
            },
          },
        },
      },
    });

    if (!month) {
      return null;
    }

    const usdQuote = await prisma.marketQuote.findFirst({
      where: { referenceDate: month.referenceDate, symbol: "USD" },
      select: { valueBrl: true },
    });
    const usdRate = usdQuote ? usdQuote.valueBrl.toNumber() : null;
    const totalBrl = month.positions
      .reduce((total, position) => total.plus(position.totalBrl), new Prisma.Decimal(0))
      .toNumber();

    return {
      referenceDate: month.referenceDate,
      status: month.status,
      totalBrl,
      usdRate,
      positions: month.positions
        .map((position) => {
          const positionTotal = position.totalBrl.toNumber();

          return {
            id: position.id,
            assetName: position.asset.name,
            ticker: position.asset.ticker,
            quoteSymbol: position.asset.quoteSymbol,
            institutionName: position.account.institution.name,
            accountName: position.account.name,
            strategy: position.strategy,
            baseCurrency: position.asset.baseCurrency,
            quantity: position.quantity.toNumber(),
            unitPriceBrl: position.unitPriceBrl ? position.unitPriceBrl.toNumber() : null,
            totalBrl: positionTotal,
            totalUsd: usdRate === null || usdRate === 0 ? null : positionTotal / usdRate,
            share: totalBrl === 0 ? 0 : (positionTotal / totalBrl) * 100,
            allocations: position.allocations.map((allocation) => ({
              assetClass: allocation.assetClass,
              subclass: allocation.subclass,
              duration: allocation.duration,
              weight: allocation.weight.toNumber() * 100,
            })),
          };
        })
        .sort((left, right) => right.totalBrl - left.totalBrl),
    };
  } catch {
    return null;
  }
}
