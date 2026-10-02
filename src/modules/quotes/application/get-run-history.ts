import { MonthlyUpdateStatus, QuoteUpdateStatus } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import {
  RUN_HISTORY_MONTHS,
  type QuoteFailureView,
  type QuoteRefreshRunStatus,
  type QuoteRefreshTriggerKind,
} from "@/modules/quotes/domain/quote-refresh";

// Histórico das execuções de cotações (spec 028): todas, de qualquer mês, dos
// últimos 36 meses, da mais recente para a mais antiga, em páginas. A
// execução antiga de "Atualizar carteira" (spec 003) continua visível.

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

export async function getRunHistory(before?: string): Promise<QuoteRunHistoryPage | null> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return null;
  }

  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - RUN_HISTORY_MONTHS, now.getUTCDate()));
  const cursor = before ? new Date(before) : null;

  if (cursor && Number.isNaN(cursor.getTime())) {
    return null;
  }

  const resultSelect = {
    orderBy: { symbol: "asc" },
    select: { symbol: true, provider: true, status: true, errorCode: true, errorMessage: true },
  } as const;

  try {
    const [runs, runCount, legacyRuns] = await Promise.all([
      prisma.quoteRefreshRun.findMany({
        where: { startedAt: { gte: since, ...(cursor ? { lt: cursor } : {}) } },
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
      prisma.quoteRefreshRun.count({ where: { startedAt: { gte: since } } }),
      prisma.monthlyUpdateRun.findMany({
        where: { startedAt: { gte: since } },
        select: {
          id: true,
          status: true,
          startedAt: true,
          completedAt: true,
          errorMessage: true,
          quoteResults: resultSelect,
        },
      }),
    ]);

    const failedSymbols = new Set(
      [...runs.flatMap((run) => run.results), ...legacyRuns.flatMap((run) => run.quoteResults)]
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

    for (const legacy of legacyRuns) {
      const at = legacy.completedAt ?? legacy.startedAt;

      if (cursor && at.getTime() >= cursor.getTime()) {
        continue;
      }

      const failures = failuresOf(legacy.quoteResults);
      entries.push({
        id: legacy.id,
        origin: "MONTHLY_UPDATE",
        status: legacy.status === MonthlyUpdateStatus.RUNNING ? "INTERRUPTED" : legacy.status,
        at: at.toISOString(),
        succeeded: legacy.quoteResults.length - failures.length,
        failures,
        errorMessage: legacy.errorMessage,
      });
    }

    entries.sort((left, right) => right.at.localeCompare(left.at));
    const page = entries.slice(0, RUN_HISTORY_PAGE_SIZE);

    return {
      runs: page,
      total: runCount + legacyRuns.length,
      nextCursor: entries.length > RUN_HISTORY_PAGE_SIZE ? page.at(-1)!.at : null,
    };
  } catch (error) {
    console.error("Não foi possível ler o histórico de execuções.", error);
    return null;
  }
}
