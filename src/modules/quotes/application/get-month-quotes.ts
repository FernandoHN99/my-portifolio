import {
  MonthlyUpdateStatus,
  Prisma,
  QuoteUpdateStatus,
  type PortfolioMonthStatus,
} from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { toMonthParam } from "@/modules/portfolio/presentation/reference-month";
import { addMonths, currentReferenceMonth, toDateKey } from "@/modules/quotes/domain/calendar";
import type {
  QuoteFailureView,
  QuoteRefreshRunStatus,
  QuoteRefreshTriggerKind,
} from "@/modules/quotes/domain/quote-refresh";

// Dados da página de cotações de uma competência: cada cotação com os ativos
// que a usam, a origem do valor e o último resultado da atualização no mês, e
// o histórico das execuções do mês.

export type QuoteLastResult = {
  status: "SUCCESS" | "FAILED";
  trigger: QuoteRefreshTriggerKind;
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
};

export type QuoteRunOrigin = QuoteRefreshTriggerKind | "MONTHLY_UPDATE";

// "INTERRUPTED" só vale para a execução antiga: ela ficou RUNNING quando o
// processo parou no meio, e o código que a encerrava foi removido.
export type QuoteRunHistoryStatus = QuoteRefreshRunStatus | "INTERRUPTED";

export type QuoteRunHistoryEntry = {
  id: string;
  origin: QuoteRunOrigin;
  status: QuoteRunHistoryStatus;
  // Instante mostrado e usado na ordenação: o início da execução, ou, na
  // execução antiga, o fim da última tentativa, porque cada nova tentativa
  // substituía os resultados mantendo o início da primeira.
  at: string;
  succeeded: number;
  failures: QuoteFailureView[];
  errorMessage: string | null;
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
  runs: QuoteRunHistoryEntry[];
  runCount: number;
};

export const RUN_HISTORY_LIMIT = 30;

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

    const [storedQuotes, runs, runCount, lastResults, legacyRun] = await Promise.all([
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
      prisma.quoteRefreshRun.findMany({
        where: runsInMonth,
        orderBy: { startedAt: "desc" },
        take: RUN_HISTORY_LIMIT,
        select: {
          id: true,
          trigger: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          errorMessage: true,
          results: {
            orderBy: { symbol: "asc" },
            select: { symbol: true, provider: true, status: true, errorCode: true, errorMessage: true },
          },
        },
      }),
      prisma.quoteRefreshRun.count({ where: runsInMonth }),
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
      // A atualização da spec 003, removida pela spec 022, registrava uma
      // execução por competência criada; ela continua visível no histórico.
      prisma.monthlyUpdateRun.findUnique({
        where: { targetMonthId: month.id },
        select: {
          id: true,
          status: true,
          startedAt: true,
          completedAt: true,
          errorMessage: true,
          quoteResults: {
            orderBy: { symbol: "asc" },
            select: { symbol: true, provider: true, status: true, errorCode: true, errorMessage: true },
          },
        },
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
    const failureView = (result: {
      symbol: string;
      provider: string;
      errorCode: string | null;
      errorMessage: string | null;
    }): QuoteFailureView => ({
      symbol: result.symbol,
      assets: assetsOf(result.symbol),
      provider: result.provider,
      errorCode: result.errorCode ?? "UNKNOWN",
      errorMessage: result.errorMessage ?? "Falha sem descrição.",
    });

    const history: QuoteRunHistoryEntry[] = runs.map((run) => {
      const failed = run.results.filter((result) => result.status === QuoteUpdateStatus.FAILED);

      return {
        id: run.id,
        origin: run.trigger,
        status: run.status,
        at: run.startedAt.toISOString(),
        succeeded: run.results.length - failed.length,
        failures: failed.map(failureView),
        errorMessage: run.errorMessage,
      };
    });

    if (legacyRun) {
      const failed = legacyRun.quoteResults.filter((result) => result.status === QuoteUpdateStatus.FAILED);
      history.push({
        id: legacyRun.id,
        origin: "MONTHLY_UPDATE",
        status: legacyRun.status === MonthlyUpdateStatus.RUNNING ? "INTERRUPTED" : legacyRun.status,
        at: (legacyRun.completedAt ?? legacyRun.startedAt).toISOString(),
        succeeded: legacyRun.quoteResults.length - failed.length,
        failures: failed.map(failureView),
        errorMessage: legacyRun.errorMessage,
      });
      history.sort((left, right) => right.at.localeCompare(left.at));
      history.splice(RUN_HISTORY_LIMIT);
    }

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
          lastResult: last
            ? {
                status: last.status === QuoteUpdateStatus.SUCCESS ? "SUCCESS" : "FAILED",
                trigger: last.run.trigger,
                fetchedAt: last.fetchedAt.toISOString(),
                provider: last.provider,
                valueBrl: last.valueBrl?.toNumber() ?? null,
                errorMessage: last.errorMessage,
              }
            : null,
        };
      }),
      runs: history,
      runCount: runCount + (legacyRun ? 1 : 0),
    };
  } catch (error) {
    console.error("Não foi possível ler as cotações da competência.", error);
    return null;
  }
}
