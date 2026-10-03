import { QuoteUpdateStatus } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { addMonths } from "@/modules/quotes/domain/calendar";
import {
  type QuoteFailureView,
  type QuoteRefreshRunStatus,
  type QuoteRefreshTriggerKind,
} from "@/modules/quotes/domain/quote-refresh";

// Histórico das execuções de cotações da competência (spec 046, que trocou o
// histórico de todos os meses da spec 028): as execuções que consultaram
// cotações num dia do mês, da mais recente para a mais antiga, em páginas.

export type QuoteRunOrigin = QuoteRefreshTriggerKind;
export type QuoteRunHistoryStatus = QuoteRefreshRunStatus;

export type QuoteRunHistoryEntry = {
  id: string;
  origin: QuoteRunOrigin;
  status: QuoteRunHistoryStatus;
  /** Início da execução. */
  at: string;
  succeeded: number;
  failures: QuoteFailureView[];
  errorMessage: string | null;
};

export type QuoteRunHistoryPage = {
  runs: QuoteRunHistoryEntry[];
  total: number;
  /** Instante da última execução da página, para pedir a seguinte. */
  nextCursor: string | null;
};

export const RUN_HISTORY_PAGE_SIZE = 30;

type ResultRow = {
  symbol: string;
  provider: string;
  status: QuoteUpdateStatus;
  errorCode: string | null;
  errorMessage: string | null;
};

export async function getRunHistory(referenceDate: Date, before?: string): Promise<QuoteRunHistoryPage | null> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return null;
  }

  const inMonth = { gte: referenceDate, lt: addMonths(referenceDate, 1) };
  const cursor = before ? new Date(before) : null;

  if (cursor && Number.isNaN(cursor.getTime())) {
    return null;
  }

  const resultSelect = {
    orderBy: { symbol: "asc" },
    select: { symbol: true, provider: true, status: true, errorCode: true, errorMessage: true },
  } as const;

  try {
    const [runs, total] = await Promise.all([
      prisma.quoteRefreshRun.findMany({
        where: { quoteDate: inMonth, ...(cursor ? { startedAt: { lt: cursor } } : {}) },
        orderBy: { startedAt: "desc" },
        take: RUN_HISTORY_PAGE_SIZE + 1,
        select: {
          id: true,
          trigger: true,
          status: true,
          startedAt: true,
          errorMessage: true,
          results: resultSelect,
        },
      }),
      prisma.quoteRefreshRun.count({ where: { quoteDate: inMonth } }),
    ]);

    const failedSymbols = new Set(
      runs
        .flatMap((run) => run.results)
        .filter((result) => result.status === QuoteUpdateStatus.FAILED)
        .map((result) => result.symbol),
    );
    const assets = failedSymbols.size
      ? await prisma.asset.findMany({
          where: { quoteSymbol: { in: [...failedSymbols] } },
          select: { name: true, quoteSymbol: true },
        })
      : [];
    const assetsOf = (symbol: string) =>
      assets
        .filter((asset) => asset.quoteSymbol === symbol)
        .map((asset) => asset.name)
        .sort((left, right) => left.localeCompare(right, "pt-BR"));
    const failuresOf = (results: ResultRow[]) =>
      results
        .filter((result) => result.status === QuoteUpdateStatus.FAILED)
        .map(
          (result): QuoteFailureView => ({
            symbol: result.symbol,
            assets: assetsOf(result.symbol),
            provider: result.provider,
            errorCode: result.errorCode ?? "UNKNOWN",
            errorMessage: result.errorMessage ?? "Falha sem descrição.",
          }),
        );

    const entries: QuoteRunHistoryEntry[] = runs.map((run) => {
      const failures = failuresOf(run.results);

      return {
        id: run.id,
        origin: run.trigger,
        status: run.status,
        at: run.startedAt.toISOString(),
        succeeded: run.results.length - failures.length,
        failures,
        errorMessage: run.errorMessage,
      };
    });

    const page = entries.slice(0, RUN_HISTORY_PAGE_SIZE);

    return {
      runs: page,
      total,
      nextCursor: entries.length > RUN_HISTORY_PAGE_SIZE ? page.at(-1)!.at : null,
    };
  } catch (error) {
    console.error("Não foi possível ler o histórico de execuções.", error);
    return null;
  }
}
