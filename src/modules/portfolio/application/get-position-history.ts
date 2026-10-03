import type { PortfolioMonthStatus } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import type { PortfolioMonthSummary } from "@/modules/portfolio/application/get-portfolio-months";
import {
  buildHistorySlots,
  monthKey,
  summarizeHistory,
  type HistorySlot,
  type PositionObservation,
  type PositionSummary,
} from "@/modules/portfolio/domain/position-history";
import { calendarDay, lastDayOf, toDateKey } from "@/modules/quotes/domain/calendar";
import { buildPriceHistory, type PriceHistory } from "@/modules/quotes/domain/price-history";

// Dados da página de uma posição (spec 016): a posição é a combinação de conta
// e ativo, pelos identificadores, em todas as competências. O ativo em outras
// contas entra para o recorte "Todas as contas" e para dizer onde ele estava
// quando a posição falta na conta.

export type PositionScopeView = {
  slots: HistorySlot[];
  summary: PositionSummary;
};

export type OtherAccountHolding = {
  accountId: string;
  label: string;
  firstMonth: string;
  lastMonth: string;
  months: number;
};

export type PositionHistoryView = {
  accountId: string;
  assetId: string;
  assetName: string;
  ticker: string | null;
  quoteSymbol: string | null;
  baseCurrency: string;
  /** AAAA-MM-DD, quando informado na inclusão (spec 026). */
  maturityDate: string | null;
  /** Prazo de liquidez do ativo, opcional (spec 039). */
  liquidity: string | null;
  institutionName: string;
  accountName: string;
  selectedMonth: string;
  monthStatus: PortfolioMonthStatus;
  /** Dia de referência do aviso de vencimento, como na tabela de Posições. */
  referenceDay: string;
  /** Câmbio da competência selecionada. */
  usdRate: number | null;
  /** Total de cada classe na competência selecionada, para a parcela da posição. */
  classTotals: Record<string, number>;
  otherAccounts: OtherAccountHolding[];
  account: PositionScopeView;
  /** Nulo quando o ativo nunca esteve em outra conta. */
  all: PositionScopeView | null;
  prices: PriceHistory | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getPositionHistory({
  accountId,
  assetId,
  months,
  selected,
}: {
  accountId: string;
  assetId: string;
  months: PortfolioMonthSummary[];
  selected: PortfolioMonthSummary | null;
}): Promise<PositionHistoryView | null> {
  const prisma = getPrismaClient();

  if (!prisma || !selected || !UUID.test(accountId) || !UUID.test(assetId)) {
    return null;
  }

  try {
    const [asset, account, positions, classRows] = await Promise.all([
      prisma.asset.findUnique({
        where: { id: assetId },
        select: { name: true, ticker: true, quoteSymbol: true, baseCurrency: true, maturityDate: true, liquidity: true },
      }),
      prisma.account.findUnique({
        where: { id: accountId },
        select: { name: true, institution: { select: { name: true } } },
      }),
      prisma.position.findMany({
        where: { assetId },
        select: {
          accountId: true,
          quantity: true,
          unitPriceBrl: true,
          totalBrl: true,
          strategy: true,
          portfolioMonth: { select: { referenceDate: true } },
          account: { select: { name: true, institution: { select: { name: true } } } },
          allocations: { select: { assetClass: true, subclass: true, duration: true, weight: true } },
        },
      }),
      prisma.positionAllocation.findMany({
        where: { position: { portfolioMonthId: selected.id } },
        select: { assetClass: true, weight: true, position: { select: { totalBrl: true } } },
      }),
    ]);

    if (!asset || !account || !positions.some((position) => position.accountId === accountId)) {
      return null;
    }

    const observations: PositionObservation[] = positions.map((position) => ({
      month: monthKey(position.portfolioMonth.referenceDate),
      accountId: position.accountId,
      accountLabel: `${position.account.institution.name} · ${position.account.name}`,
      quantity: position.quantity.toNumber(),
      unitPriceBrl: position.unitPriceBrl?.toNumber() ?? null,
      totalBrl: position.totalBrl.toNumber(),
      strategy: position.strategy,
      allocations: position.allocations.map((allocation) => ({
        assetClass: allocation.assetClass,
        subclass: allocation.subclass,
        duration: allocation.duration,
        weight: allocation.weight.mul(100).toNumber(),
      })),
    }));

    const quoted = Boolean(asset.quoteSymbol);
    const monthTotals = months.map((month) => ({ month: month.month, totalBrl: month.totalBrl }));
    const selectedMonth = selected.month;
    const scope = (scopeAccountId: string | null): PositionScopeView => {
      const slots = buildHistorySlots({ months: monthTotals, observations, scopeAccountId, quoted });
      return { slots, summary: summarizeHistory(slots, selectedMonth, quoted) };
    };

    const others = new Map<string, OtherAccountHolding>();

    for (const observation of [...observations].sort((left, right) => left.month.localeCompare(right.month))) {
      if (observation.accountId === accountId) {
        continue;
      }

      const current = others.get(observation.accountId);

      if (current) {
        current.lastMonth = observation.month;
        current.months += 1;
      } else {
        others.set(observation.accountId, {
          accountId: observation.accountId,
          label: observation.accountLabel,
          firstMonth: observation.month,
          lastMonth: observation.month,
          months: 1,
        });
      }
    }

    const classTotals: Record<string, number> = {};

    for (const row of classRows) {
      classTotals[row.assetClass] =
        (classTotals[row.assetClass] ?? 0) + row.position.totalBrl.mul(row.weight).toNumber();
    }

    const today = calendarDay(new Date());
    const lastDay = lastDayOf(selected.referenceDate);
    const usdQuote = await prisma.marketQuote.findUnique({
      where: { referenceDate_symbol: { referenceDate: selected.referenceDate, symbol: "USD" } },
      select: { valueBrl: true },
    });

    return {
      accountId,
      assetId,
      assetName: asset.name,
      ticker: asset.ticker,
      quoteSymbol: asset.quoteSymbol,
      baseCurrency: asset.baseCurrency,
      maturityDate: asset.maturityDate ? toDateKey(asset.maturityDate) : null,
      liquidity: asset.liquidity,
      institutionName: account.institution.name,
      accountName: account.name,
      selectedMonth,
      monthStatus: selected.status,
      referenceDay: toDateKey(today.getTime() < lastDay.getTime() ? today : lastDay),
      usdRate: usdQuote?.valueBrl.toNumber() ?? null,
      classTotals,
      otherAccounts: [...others.values()],
      account: scope(accountId),
      all: others.size > 0 ? scope(null) : null,
      prices: asset.quoteSymbol ? await getPriceHistory(asset.quoteSymbol, toDateKey(today)) : null,
    };
  } catch {
    return null;
  }
}

async function getPriceHistory(symbol: string, today: string): Promise<PriceHistory> {
  const prisma = getPrismaClient()!;
  const symbols = symbol === "USD" ? ["USD"] : [symbol, "USD"];
  const [monthly, daily] = await Promise.all([
    prisma.marketQuote.findMany({
      where: { symbol: { in: symbols } },
      orderBy: { referenceDate: "asc" },
      select: { symbol: true, referenceDate: true, valueBrl: true, quoteDate: true, carriedFrom: true },
    }),
    prisma.dailyQuote.findMany({
      where: { symbol: { in: symbols } },
      orderBy: { quoteDate: "asc" },
      select: { symbol: true, quoteDate: true, valueBrl: true },
    }),
  ]);

  const toMonthly = (quote: (typeof monthly)[number]) => ({
    month: monthKey(quote.referenceDate),
    valueBrl: quote.valueBrl.toNumber(),
    quoteDate: quote.quoteDate ? toDateKey(quote.quoteDate) : null,
    carriedFrom: quote.carriedFrom ? monthKey(quote.carriedFrom) : null,
  });
  const toDaily = (quote: (typeof daily)[number]) => ({
    day: toDateKey(quote.quoteDate),
    valueBrl: quote.valueBrl.toNumber(),
  });

  return buildPriceHistory({
    symbol,
    monthly: monthly.filter((quote) => quote.symbol === symbol).map(toMonthly),
    daily: daily.filter((quote) => quote.symbol === symbol).map(toDaily),
    usdMonthly: monthly.filter((quote) => quote.symbol === "USD").map(toMonthly),
    usdDaily: daily.filter((quote) => quote.symbol === "USD").map(toDaily),
    today,
  });
}

