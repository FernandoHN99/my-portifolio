import { Prisma, type PortfolioMonthStatus } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { toMonthParam } from "@/modules/portfolio/presentation/reference-month";

export type PortfolioMonthSummary = {
  id: string;
  month: string;
  referenceDate: Date;
  status: PortfolioMonthStatus;
  totalBrl: number;
  changeBrl: number | null;
  changePercent: number | null;
};

export async function getPortfolioMonths(): Promise<PortfolioMonthSummary[]> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return [];
  }

  try {
    const months = await prisma.portfolioMonth.findMany({
      orderBy: { referenceDate: "asc" },
      select: {
        id: true,
        referenceDate: true,
        status: true,
        positions: { select: { totalBrl: true } },
      },
    });

    return months.map((month, index) => {
      const totalBrl = month.positions
        .reduce((total, position) => total.plus(position.totalBrl), new Prisma.Decimal(0))
        .toNumber();
      const previous = months[index - 1];
      const previousTotalBrl = previous
        ? previous.positions
            .reduce((total, position) => total.plus(position.totalBrl), new Prisma.Decimal(0))
            .toNumber()
        : null;
      const changeBrl = previousTotalBrl === null ? null : totalBrl - previousTotalBrl;

      return {
        id: month.id,
        month: toMonthParam(month.referenceDate),
        referenceDate: month.referenceDate,
        status: month.status,
        totalBrl,
        changeBrl,
        changePercent:
          changeBrl === null || previousTotalBrl === null || previousTotalBrl === 0
            ? null
            : (changeBrl / previousTotalBrl) * 100,
      };
    });
  } catch {
    return [];
  }
}
