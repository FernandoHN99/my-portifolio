import { PortfolioMonthStatus, Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import type { GeneratedMonthView, MonthRolloverOutcome } from "@/modules/portfolio/domain/month-rollover";
import { toMonthParam } from "@/modules/portfolio/presentation/reference-month";
import { addMonths, calendarDay, lastDayOf, monthOf } from "@/modules/quotes/domain/calendar";

type Transaction = Prisma.TransactionClient;

// Chave do bloqueio consultivo que serializa a criação de competências.
const MONTH_ROLLOVER_LOCK_KEY = 2_026_100_202;

// Garante que exista a competência do mês de `today`, copiando a anterior para
// cada mês que faltar depois da mais recente. Competências passadas geradas
// aqui usam a cotação do último dia do mês disponível no histórico diário; na
// falta dele, repetem a do mês anterior e isso é informado no resultado.
export async function ensureMonthsUpToDate(today: Date = new Date()): Promise<MonthRolloverOutcome> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return { state: "unavailable", message: "O banco de dados não está configurado." };
  }

  const day = calendarDay(today);
  const target = monthOf(day);
  const latest = await prisma.portfolioMonth.findFirst({
    orderBy: { referenceDate: "desc" },
    select: { referenceDate: true },
  });

  if (!latest || latest.referenceDate.getTime() >= target.getTime()) {
    return { state: "up-to-date", latestMonth: latest ? toMonthParam(latest.referenceDate) : null };
  }

  return prisma.$transaction(
    async (transaction): Promise<MonthRolloverOutcome> => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${MONTH_ROLLOVER_LOCK_KEY})`;

      // Relê dentro do bloqueio: outra aba pode ter criado as competências.
      let source = await transaction.portfolioMonth.findFirst({
        orderBy: { referenceDate: "desc" },
        select: { id: true, referenceDate: true },
      });

      if (!source || source.referenceDate.getTime() >= target.getTime()) {
        return { state: "up-to-date", latestMonth: source ? toMonthParam(source.referenceDate) : null };
      }

      const months: GeneratedMonthView[] = [];

      for (
        let month = addMonths(source.referenceDate, 1);
        month.getTime() <= target.getTime();
        month = addMonths(month, 1)
      ) {
        const generated = await copyMonth(transaction, source, month, day);
        months.push({ ...generated.view, isCurrent: month.getTime() === target.getTime() });
        source = generated.month;
      }

      return { state: "created", months };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

async function copyMonth(
  transaction: Transaction,
  source: { id: string; referenceDate: Date },
  month: Date,
  today: Date,
) {
  const [positions, sourceQuotes] = await Promise.all([
    transaction.position.findMany({
      where: { portfolioMonthId: source.id },
      orderBy: { id: "asc" },
      select: {
        accountId: true,
        assetId: true,
        quantity: true,
        unitPriceBrl: true,
        exchangeRateBrl: true,
        totalBrl: true,
        strategy: true,
        asset: { select: { quoteSymbol: true } },
        allocations: {
          orderBy: { id: "asc" },
          select: { assetClass: true, subclass: true, duration: true, weight: true },
        },
      },
    }),
    transaction.marketQuote.findMany({
      where: { referenceDate: source.referenceDate },
      orderBy: { symbol: "asc" },
      select: {
        symbol: true,
        instrumentType: true,
        baseCurrency: true,
        valueBrl: true,
        quoteDate: true,
        carriedFrom: true,
      },
    }),
  ]);

  const positionSymbols = new Set(
    positions
      .map((position) => position.asset.quoteSymbol)
      .filter((symbol): symbol is string => Boolean(symbol)),
  );
  const symbols = [...new Set([...sourceQuotes.map((quote) => quote.symbol), ...positionSymbols])];
  const windowEnd = new Date(Math.min(lastDayOf(month).getTime(), today.getTime()));
  const dailyQuotes = await transaction.dailyQuote.findMany({
    where: { symbol: { in: symbols }, quoteDate: { gte: month, lte: windowEnd } },
    orderBy: { quoteDate: "desc" },
    select: { symbol: true, quoteDate: true, valueBrl: true, instrumentType: true, baseCurrency: true },
  });
  const lastDaily = new Map<string, (typeof dailyQuotes)[number]>();

  for (const quote of dailyQuotes) {
    if (!lastDaily.has(quote.symbol)) {
      lastDaily.set(quote.symbol, quote);
    }
  }

  const quotes = new Map<
    string,
    {
      instrumentType: string;
      baseCurrency: string;
      valueBrl: Prisma.Decimal;
      quoteDate: Date | null;
      carriedFrom: Date | null;
      fromHistory: boolean;
    }
  >();

  for (const quote of sourceQuotes) {
    const daily = lastDaily.get(quote.symbol);
    quotes.set(
      quote.symbol,
      daily
        ? { ...quote, valueBrl: daily.valueBrl, quoteDate: daily.quoteDate, carriedFrom: null, fromHistory: true }
        : // A repetida aponta para a competência que tem o valor próprio, mesmo
          // depois de vários meses repetidos.
          { ...quote, carriedFrom: quote.carriedFrom ?? source.referenceDate, fromHistory: false },
    );
  }

  for (const [symbol, daily] of lastDaily) {
    if (!quotes.has(symbol)) {
      quotes.set(symbol, {
        instrumentType: daily.instrumentType,
        baseCurrency: daily.baseCurrency,
        valueBrl: daily.valueBrl,
        quoteDate: daily.quoteDate,
        carriedFrom: null,
        fromHistory: true,
      });
    }
  }

  const created = await transaction.portfolioMonth.create({
    data: { referenceDate: month, status: PortfolioMonthStatus.DRAFT },
    select: { id: true, referenceDate: true },
  });

  if (quotes.size > 0) {
    await transaction.marketQuote.createMany({
      data: [...quotes].map(([symbol, quote]) => ({
        referenceDate: month,
        symbol,
        instrumentType: quote.instrumentType,
        baseCurrency: quote.baseCurrency,
        valueBrl: quote.valueBrl,
        quoteDate: quote.quoteDate,
        carriedFrom: quote.carriedFrom,
      })),
    });
  }

  const usd = quotes.get("USD");

  if (positions.length > 0) {
    await transaction.position.createMany({
      data: positions.map((position) => {
        const quote = position.asset.quoteSymbol ? quotes.get(position.asset.quoteSymbol) : undefined;
        // Cotação repetida mantém preço e total copiados, como o clone; só a
        // cotação vinda do histórico do mês reprecifica a posição.
        const repriced = quote?.fromHistory ? quote.valueBrl : null;

        return {
          portfolioMonthId: created.id,
          accountId: position.accountId,
          assetId: position.assetId,
          quantity: position.quantity,
          unitPriceBrl: repriced ?? position.unitPriceBrl,
          exchangeRateBrl:
            position.exchangeRateBrl !== null && usd?.fromHistory ? usd.valueBrl : position.exchangeRateBrl,
          totalBrl: repriced ? position.quantity.mul(repriced).toDecimalPlaces(2) : position.totalBrl,
          strategy: position.strategy,
        };
      }),
    });

    const createdPositions = await transaction.position.findMany({
      where: { portfolioMonthId: created.id },
      select: { id: true, accountId: true, assetId: true },
    });
    const idByIdentity = new Map(
      createdPositions.map((position) => [`${position.accountId}:${position.assetId}`, position.id]),
    );
    const allocations = positions.flatMap((position) => {
      const positionId = idByIdentity.get(`${position.accountId}:${position.assetId}`);
      return positionId ? position.allocations.map((allocation) => ({ ...allocation, positionId })) : [];
    });

    if (allocations.length > 0) {
      await transaction.positionAllocation.createMany({ data: allocations });
    }
  }

  const reported = [...positionSymbols].sort((left, right) => left.localeCompare(right));

  return {
    month: created,
    view: {
      month: toMonthParam(month),
      sourceMonth: toMonthParam(source.referenceDate),
      positions: positions.length,
      quotesFromHistory: reported.filter((symbol) => quotes.get(symbol)?.fromHistory),
      carriedQuotes: reported.filter((symbol) => quotes.has(symbol) && !quotes.get(symbol)?.fromHistory),
    },
  };
}
