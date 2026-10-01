import { PortfolioMonthStatus } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";

export type EditablePortfolioPosition = {
  id: string;
  assetName: string;
  ticker: string | null;
  quoteSymbol: string | null;
  institutionName: string;
  accountName: string;
  baseCurrency: string;
  quantity: string;
  unitPriceBrl: number | null;
  totalBrl: number;
};

export type EditablePortfolioMonth = {
  id: string;
  referenceDate: Date;
  totalBrl: number;
  positions: EditablePortfolioPosition[];
};

export async function getEditablePortfolioMonth(): Promise<EditablePortfolioMonth | null> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return null;
  }

  const month = await prisma.portfolioMonth.findFirst({
    where: { status: PortfolioMonthStatus.DRAFT },
    orderBy: { referenceDate: "desc" },
    select: {
      id: true,
      referenceDate: true,
      positions: {
        select: {
          id: true,
          quantity: true,
          unitPriceBrl: true,
          totalBrl: true,
          asset: {
            select: {
              name: true,
              ticker: true,
              quoteSymbol: true,
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

  if (!month) {
    return null;
  }

  const positions = month.positions
    .map((position) => ({
      id: position.id,
      assetName: position.asset.name,
      ticker: position.asset.ticker,
      quoteSymbol: position.asset.quoteSymbol,
      institutionName: position.account.institution.name,
      accountName: position.account.name,
      baseCurrency: position.asset.baseCurrency,
      quantity: position.quantity.toString(),
      unitPriceBrl: position.unitPriceBrl?.toNumber() ?? null,
      totalBrl: position.totalBrl.toNumber(),
    }))
    .sort(
      (left, right) =>
        left.institutionName.localeCompare(right.institutionName, "pt-BR") ||
        left.accountName.localeCompare(right.accountName, "pt-BR") ||
        left.assetName.localeCompare(right.assetName, "pt-BR"),
    );

  return {
    id: month.id,
    referenceDate: month.referenceDate,
    totalBrl: positions.reduce((total, position) => total + position.totalBrl, 0),
    positions,
  };
}
