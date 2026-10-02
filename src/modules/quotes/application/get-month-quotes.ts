import { Prisma, QuoteUpdateStatus, type PortfolioMonthStatus } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { toMonthParam } from "@/modules/portfolio/presentation/reference-month";
import { addMonths, currentReferenceMonth, toDateKey } from "@/modules/quotes/domain/calendar";
import { isQuoteEditable, type QuoteRefreshTriggerKind } from "@/modules/quotes/domain/quote-refresh";

// Dados da página de cotações de uma competência: cada cotação com os ativos
// que a usam, a origem do valor, o último resultado da atualização no mês e se
// pode ser editada à mão (spec 028). O histórico de execuções é de todos os
// meses e fica em `get-run-history`.

export type QuoteLastResult = {
  status: "SUCCESS" | "FAILED";
  /** "INCLUSION": cotação buscada ao incluir a posição, antes de uma atualização. */
  trigger: QuoteRefreshTriggerKind | "INCLUSION";
  fetchedAt: string;
  provider: string;
  valueBrl: number | null;
  errorMessage: string | null;
};

export type MonthQuoteRow = {
  symbol: string;
  instrumentType: string | null;
  baseCurrency: string | null;
  valueBrl: number | null;
  // Valor exato guardado, com ponto decimal, para o campo de edição.
  valueText: string;
  // Dia do preço (AAAA-MM-DD), quando a cotação veio do histórico diário.
  quoteDate: string | null;
  // Competência (AAAA-MM) cuja cotação foi repetida, quando o mês não tem
  // valor próprio (spec 021).
  carriedFrom: string | null;
  assets: string[];
  // Quantidade de cada posição que usa a cotação, para a prévia dos totais.
  quantities: number[];
  totalBrl: number;
  lastResult: QuoteLastResult | null;
  /** Sem valor no mês, repetida de outro mês ou com falha na última busca. */
  editable: boolean;
};

export type MonthQuotesView = {
  id: string;
  month: string;
  referenceDate: Date;
  status: PortfolioMonthStatus;
  isLatest: boolean;
  // A atualização de cotações só reprecifica a competência do mês corrente.
  isCurrent: boolean;
  currentMonth: string;
  currentMonthExists: boolean;
  totalBrl: number;
  quotes: MonthQuoteRow[];
};

export async function getMonthQuotes(referenceDate?: Date): Promise<MonthQuotesView | null> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return null;
  }

  try {
    const current = currentReferenceMonth();
    const [month, latest, currentMonth] = await Promise.all([
      prisma.portfolioMonth.findFirst({
        where: referenceDate ? { referenceDate } : undefined,
        orderBy: { referenceDate: "desc" },
        select: {
          id: true,
          referenceDate: true,
          status: true,
          positions: {
            select: {
              quantity: true,
              totalBrl: true,
              asset: { select: { name: true, quoteSymbol: true } },
            },
          },
        },
      }),
      prisma.portfolioMonth.findFirst({ orderBy: { referenceDate: "desc" }, select: { id: true } }),
      prisma.portfolioMonth.findUnique({ where: { referenceDate: current }, select: { id: true } }),
    ]);

    if (!month) {
      return null;
    }

    // Execuções do mês: as que consultaram cotações num dia desta competência.
    // Só elas podem ter reprecificado o mês, que era o corrente naquele dia.
    const runsInMonth = {
      quoteDate: { gte: month.referenceDate, lt: addMonths(month.referenceDate, 1) },
    } satisfies Prisma.QuoteRefreshRunWhereInput;

    const [storedQuotes, lastResults, inclusions] = await Promise.all([
      prisma.marketQuote.findMany({
        where: { referenceDate: month.referenceDate },
        select: {
          symbol: true,
          instrumentType: true,
          baseCurrency: true,
          valueBrl: true,
          quoteDate: true,
          carriedFrom: true,
        },
      }),
      prisma.quoteRefreshResult.findMany({
        where: { run: runsInMonth },
        orderBy: [{ fetchedAt: "desc" }, { id: "desc" }],
        distinct: ["symbol"],
        select: {
          symbol: true,
          status: true,
          provider: true,
          valueBrl: true,
          errorMessage: true,
          fetchedAt: true,
          run: { select: { trigger: true } },
        },
      }),
      // Cotação buscada pela inclusão de uma posição nova (spec 026): fica no
      // histórico diário sem execução até a próxima atualização.
      prisma.dailyQuote.findMany({
        where: { runId: null, quoteDate: runsInMonth.quoteDate },
        orderBy: { fetchedAt: "desc" },
        distinct: ["symbol"],
        select: { symbol: true, provider: true, valueBrl: true, fetchedAt: true },
      }),
    ]);

    const usage = new Map<string, { assets: Set<string>; quantities: number[]; total: Prisma.Decimal }>();

    for (const position of month.positions) {
      const symbol = position.asset.quoteSymbol;

      if (!symbol) {
        continue;
      }

      const entry = usage.get(symbol) ?? { assets: new Set<string>(), quantities: [], total: new Prisma.Decimal(0) };
      entry.assets.add(position.asset.name);
      entry.quantities.push(position.quantity.toNumber());
      entry.total = entry.total.plus(position.totalBrl);
      usage.set(symbol, entry);
    }

    const stored = new Map(storedQuotes.map((quote) => [quote.symbol, quote]));
    const lastBySymbol = new Map(lastResults.map((result) => [result.symbol, result]));
    const symbols = [...new Set([...stored.keys(), ...usage.keys()])].sort((left, right) =>
      left === "USD" ? -1 : right === "USD" ? 1 : left.localeCompare(right),
    );
    const assetsOf = (symbol: string) =>
      [...(usage.get(symbol)?.assets ?? [])].sort((left, right) => left.localeCompare(right, "pt-BR"));
    const inclusionBySymbol = new Map(inclusions.map((quote) => [quote.symbol, quote]));

    return {
      id: month.id,
      month: toMonthParam(month.referenceDate),
      referenceDate: month.referenceDate,
      status: month.status,
      isLatest: latest?.id === month.id,
      isCurrent: month.referenceDate.getTime() === current.getTime(),
      currentMonth: toMonthParam(current),
      currentMonthExists: currentMonth !== null,
      totalBrl: month.positions
        .reduce((total, position) => total.plus(position.totalBrl), new Prisma.Decimal(0))
        .toNumber(),
      quotes: symbols.map((symbol) => {
        const quote = stored.get(symbol);
        const used = usage.get(symbol);
        const last = lastBySymbol.get(symbol);
        const inclusion = last ? undefined : inclusionBySymbol.get(symbol);
        const lastResult: QuoteLastResult | null = last
          ? {
              status: last.status === QuoteUpdateStatus.SUCCESS ? "SUCCESS" : "FAILED",
              trigger: last.run.trigger,
              fetchedAt: last.fetchedAt.toISOString(),
              provider: last.provider,
              valueBrl: last.valueBrl?.toNumber() ?? null,
              errorMessage: last.errorMessage,
            }
          : inclusion
            ? {
                status: "SUCCESS",
                trigger: "INCLUSION",
                fetchedAt: inclusion.fetchedAt.toISOString(),
                provider: inclusion.provider,
                valueBrl: inclusion.valueBrl.toNumber(),
                errorMessage: null,
              }
            : null;

        return {
          symbol,
          instrumentType: quote?.instrumentType ?? null,
          baseCurrency: quote?.baseCurrency ?? null,
          valueBrl: quote?.valueBrl.toNumber() ?? null,
          valueText: quote?.valueBrl.toString() ?? "",
          quoteDate: quote?.quoteDate ? toDateKey(quote.quoteDate) : null,
          carriedFrom: quote?.carriedFrom ? toMonthParam(quote.carriedFrom) : null,
          assets: assetsOf(symbol),
          quantities: used?.quantities ?? [],
          totalBrl: used?.total.toNumber() ?? 0,
          lastResult,
          editable: isQuoteEditable({
            hasValue: quote !== undefined,
            carried: Boolean(quote?.carriedFrom),
            lastFailed: lastResult?.status === "FAILED",
          }),
        };
      }),
    };
  } catch (error) {
    console.error("Não foi possível ler as cotações da competência.", error);
    return null;
  }
}
