import type { Prisma } from "@/generated/prisma/client";

// Cotação de um mês para um usuário (spec 051): a compartilhada, vinda dos
// provedores ou da virada de mês, ou, por cima dela, a digitada por ele. O
// cliente precisa ser o com escopo do usuário (src/lib/user-db.ts): as
// cotações à mão só aparecem para quem as digitou.

type QuoteReader = Pick<Prisma.TransactionClient, "marketQuote" | "manualQuote">;

export type MonthQuoteValue = {
  symbol: string;
  instrumentType: string;
  baseCurrency: string;
  valueBrl: Prisma.Decimal;
  /** Dia do preço, quando a compartilhada veio do histórico diário. */
  quoteDate: Date | null;
  /** Competência repetida, quando a compartilhada não tem valor próprio no mês. */
  carriedFrom: Date | null;
  /** Digitada pelo usuário; vale por cima da compartilhada. */
  manual: boolean;
};

export type QuoteSeriesPoint = MonthQuoteValue & { referenceDate: Date };

/** Cotações efetivas de uma competência, por símbolo. */
export async function readMonthQuoteValues(
  db: QuoteReader,
  referenceDate: Date,
  symbols?: string[],
): Promise<Map<string, MonthQuoteValue>> {
  const symbolFilter = symbols ? { symbol: { in: symbols } } : {};
  const [shared, manual] = await Promise.all([
    db.marketQuote.findMany({
      where: { referenceDate, ...symbolFilter },
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
    db.manualQuote.findMany({
      where: { referenceDate, ...symbolFilter },
      select: { symbol: true, instrumentType: true, baseCurrency: true, valueBrl: true },
    }),
  ]);
  const values = new Map<string, MonthQuoteValue>();

  for (const quote of shared) {
    values.set(quote.symbol, { ...quote, manual: false });
  }

  for (const quote of manual) {
    values.set(quote.symbol, { ...quote, quoteDate: null, carriedFrom: null, manual: true });
  }

  return values;
}

/** Cotações efetivas de todos os meses dos símbolos, em ordem de competência. */
export async function readQuoteSeries(db: QuoteReader, symbols: string[]): Promise<QuoteSeriesPoint[]> {
  const [shared, manual] = await Promise.all([
    db.marketQuote.findMany({
      where: { symbol: { in: symbols } },
      select: {
        referenceDate: true,
        symbol: true,
        instrumentType: true,
        baseCurrency: true,
        valueBrl: true,
        quoteDate: true,
        carriedFrom: true,
      },
    }),
    db.manualQuote.findMany({
      where: { symbol: { in: symbols } },
      select: { referenceDate: true, symbol: true, instrumentType: true, baseCurrency: true, valueBrl: true },
    }),
  ]);
  const points = new Map<string, QuoteSeriesPoint>();
  const key = (referenceDate: Date, symbol: string) => `${referenceDate.toISOString()}|${symbol}`;

  for (const quote of shared) {
    points.set(key(quote.referenceDate, quote.symbol), { ...quote, manual: false });
  }

  for (const quote of manual) {
    points.set(key(quote.referenceDate, quote.symbol), { ...quote, quoteDate: null, carriedFrom: null, manual: true });
  }

  return [...points.values()].sort(
    (left, right) =>
      left.referenceDate.getTime() - right.referenceDate.getTime() || left.symbol.localeCompare(right.symbol),
  );
}
