import { PortfolioMonthStatus, Prisma } from "@/generated/prisma/client";
import { MONTH_ROLLOVER_LOCK_KEY } from "@/lib/advisory-locks";
import { getUserDb, SCOPED_USER } from "@/lib/user-db";
import type { GeneratedMonthView, MonthRolloverOutcome } from "@/modules/portfolio/domain/month-rollover";
import { toMonthParam } from "@/modules/portfolio/presentation/reference-month";
import { addMonths, calendarDay, lastDayOf, monthOf } from "@/modules/quotes/domain/calendar";

type Transaction = Prisma.TransactionClient;


// Garante que exista a competência do mês de `today`, copiando a anterior para
// cada mês que faltar depois da mais recente. Competências passadas geradas
// aqui usam a cotação do último dia do mês disponível no histórico diário; na
// falta dele, repetem a do mês anterior e isso é informado no resultado.
export async function ensureMonthsUpToDate(today: Date = new Date()): Promise<MonthRolloverOutcome> {
  const prisma = await getUserDb();

  if (!prisma) {
    return { state: "unavailable", message: "O banco de dados não está configurado." };
  }

  const day = calendarDay(today);
  const target = monthOf(day);
  const latest = await prisma.portfolioMonth.findFirst({
    orderBy: { referenceDate: "desc" },
    select: { referenceDate: true },
  });

  if (!latest) {
    return startFirstMonth(target);
  }

  if (latest.referenceDate.getTime() >= target.getTime()) {
    return { state: "up-to-date", latestMonth: toMonthParam(latest.referenceDate) };
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

      // Os meses anteriores ao corrente ficam fechados (spec 034): editá-los
      // exige abri-los de novo na linha do tempo, como os meses passados.
      await transaction.portfolioMonth.updateMany({
        where: { referenceDate: { lt: target }, status: PortfolioMonthStatus.DRAFT },
        data: { status: PortfolioMonthStatus.REVIEWED },
      });

      return { state: "created", months };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

/**
 * Usuário novo, sem competência nenhuma (spec 055): cria a do mês corrente,
 * vazia e aberta, para ele já poder incluir a primeira posição. Restaurar um
 * backup depois troca tudo, como sempre.
 */
async function startFirstMonth(target: Date): Promise<MonthRolloverOutcome> {
  const prisma = (await getUserDb())!;

  return prisma.$transaction(async (transaction): Promise<MonthRolloverOutcome> => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${MONTH_ROLLOVER_LOCK_KEY})`;
    const existing = await transaction.portfolioMonth.findFirst({
      orderBy: { referenceDate: "desc" },
      select: { referenceDate: true },
    });

    if (existing) {
      return { state: "up-to-date", latestMonth: toMonthParam(existing.referenceDate) };
    }

    await transaction.portfolioMonth.create({
      data: { userId: SCOPED_USER, referenceDate: target, status: PortfolioMonthStatus.DRAFT },
    });

    return { state: "started", month: toMonthParam(target) };
  });
}

async function copyMonth(
  transaction: Transaction,
  source: { id: string; referenceDate: Date },
  month: Date,
  today: Date,
) {
  const [positions, sharedQuotes, manualQuotes] = await Promise.all([
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
    transaction.manualQuote.findMany({
      where: { referenceDate: source.referenceDate },
      orderBy: { symbol: "asc" },
      select: { symbol: true, instrumentType: true, baseCurrency: true, valueBrl: true },
    }),
  ]);

  const positionSymbols = new Set(
    positions
      .map((position) => position.asset.quoteSymbol)
      .filter((symbol): symbol is string => Boolean(symbol)),
  );
  // As cotações do mês são de todos (spec 051): a virada cuida só das do
  // usuário, das que ele digitou e do dólar.
  const relevant = new Set([...positionSymbols, ...manualQuotes.map((quote) => quote.symbol), "USD"]);
  const sharedSymbols = new Set(sharedQuotes.map((quote) => quote.symbol));
  const sourceQuotes = [
    ...sharedQuotes.filter((quote) => relevant.has(quote.symbol)).map((quote) => ({ ...quote, manual: false })),
    ...manualQuotes
      .filter((quote) => !sharedSymbols.has(quote.symbol))
      .map((quote) => ({ ...quote, quoteDate: null, carriedFrom: null, manual: true })),
  ];
  const symbols = [...relevant];
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
      /** Repetida de uma digitada à mão: continua só do usuário. */
      manual: boolean;
    }
  >();

  for (const quote of sourceQuotes) {
    const daily = lastDaily.get(quote.symbol);
    quotes.set(
      quote.symbol,
      daily
        ? { ...quote, valueBrl: daily.valueBrl, quoteDate: daily.quoteDate, carriedFrom: null, fromHistory: true, manual: false }
        : // A repetida aponta para a competência que tem o valor próprio, mesmo
          // depois de vários meses repetidos.
          { ...quote, carriedFrom: quote.manual ? null : (quote.carriedFrom ?? source.referenceDate), fromHistory: false },
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
        manual: false,
      });
    }
  }

  const created = await transaction.portfolioMonth.create({
    data: { userId: SCOPED_USER, referenceDate: month, status: PortfolioMonthStatus.DRAFT },
    select: { id: true, referenceDate: true },
  });

  const shared = [...quotes].filter(([, quote]) => !quote.manual);
  const manual = [...quotes].filter(([, quote]) => quote.manual);

  // Outro usuário pode já ter criado as cotações do mês; as existentes ficam.
  if (shared.length > 0) {
    await transaction.marketQuote.createMany({
      data: shared.map(([symbol, quote]) => ({
        referenceDate: month,
        symbol,
        instrumentType: quote.instrumentType,
        baseCurrency: quote.baseCurrency,
        valueBrl: quote.valueBrl,
        quoteDate: quote.quoteDate,
        carriedFrom: quote.carriedFrom,
      })),
      skipDuplicates: true,
    });
  }

  if (manual.length > 0) {
    await transaction.manualQuote.createMany({
      data: manual.map(([symbol, quote]) => ({
        userId: SCOPED_USER,
        referenceDate: month,
        symbol,
        instrumentType: quote.instrumentType,
        baseCurrency: quote.baseCurrency,
        valueBrl: quote.valueBrl,
      })),
      skipDuplicates: true,
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
          userId: SCOPED_USER,
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
      return positionId ? position.allocations.map((allocation) => ({ ...allocation, userId: SCOPED_USER, positionId })) : [];
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
