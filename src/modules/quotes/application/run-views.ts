import { QuoteUpdateStatus, type PrismaClient } from "@/generated/prisma/client";
import type {
  QuoteFailureView,
  QuoteRefreshRunStatus,
  QuoteRefreshRunView,
} from "@/modules/quotes/domain/quote-refresh";
import { toDateKey } from "@/modules/quotes/domain/calendar";

// As execuções da atualização são de todos os usuários (spec 051). Cada um vê,
// de cada execução, só os símbolos dos próprios ativos: o que deu certo, as
// falhas com os nomes dos ativos dele e um estado calculado sobre esses
// símbolos. A falha de um símbolo que só outro usuário tem não aparece.

export type QuoteViewer = {
  symbols: Set<string>;
  /** Nomes dos ativos do usuário por símbolo, para os avisos indicarem o ativo. */
  assetNames: Map<string, string[]>;
};

/** Símbolos e nomes dos ativos do usuário, pelo cliente com escopo dele. */
export async function readQuoteViewer(db: PrismaClient): Promise<QuoteViewer> {
  const [assets, latest] = await Promise.all([
    db.asset.findMany({
      where: { quoteSymbol: { not: null } },
      orderBy: { name: "asc" },
      select: { name: true, quoteSymbol: true, positions: { select: { portfolioMonthId: true } } },
    }),
    db.portfolioMonth.findFirst({ orderBy: { referenceDate: "desc" }, select: { id: true } }),
  ]);
  const symbols = new Set<string>();
  const current = new Map<string, string[]>();
  const all = new Map<string, string[]>();

  for (const asset of assets) {
    const symbol = asset.quoteSymbol!;
    symbols.add(symbol);
    all.set(symbol, [...(all.get(symbol) ?? []), asset.name]);

    // Os avisos nomeiam os ativos da competência mais recente, como antes; um
    // símbolo que saiu dela usa os nomes de qualquer mês.
    if (latest && asset.positions.some((position) => position.portfolioMonthId === latest.id)) {
      current.set(symbol, [...(current.get(symbol) ?? []), asset.name]);
    }
  }

  return {
    symbols,
    assetNames: new Map([...symbols].map((symbol) => [symbol, current.get(symbol) ?? all.get(symbol) ?? []])),
  };
}

type RunRow = {
  id: string;
  status: QuoteRefreshRunStatus;
  quoteDate: Date;
  repricedMonth: Date | null;
  startedAt: Date;
  finishedAt: Date | null;
  errorMessage: string | null;
};

type ResultRow = {
  symbol: string;
  provider: string;
  status: QuoteUpdateStatus;
  errorCode: string | null;
  errorMessage: string | null;
};

/** A execução vista por um usuário. */
export function runViewFor(run: RunRow, results: ResultRow[], viewer: QuoteViewer): QuoteRefreshRunView {
  const own = results.filter((result) => viewer.symbols.has(result.symbol));
  const failed = own.filter((result) => result.status === QuoteUpdateStatus.FAILED);
  const succeeded = own.filter((result) => result.status === QuoteUpdateStatus.SUCCESS).length;
  const failures: QuoteFailureView[] = failed.map((result) => ({
    symbol: result.symbol,
    assets: viewer.assetNames.get(result.symbol) ?? [],
    provider: result.provider,
    errorCode: result.errorCode ?? "UNKNOWN",
    errorMessage: result.errorMessage ?? "Falha sem descrição.",
  }));

  return {
    id: run.id,
    status: statusFor(run.status, own.length, failed.length, succeeded),
    quoteDate: toDateKey(run.quoteDate),
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    succeeded,
    failures,
    // A falha da execução inteira vale para todos; a contagem de falhas, só
    // sobre os símbolos do usuário.
    errorMessage:
      run.status === "FAILED"
        ? run.errorMessage
        : failed.length > 0
          ? `${failed.length} de ${own.length} cotações não foram atualizadas.`
          : null,
    repricedMonth: run.repricedMonth ? toDateKey(run.repricedMonth).slice(0, 7) : null,
  };
}

function statusFor(
  status: QuoteRefreshRunStatus,
  own: number,
  failed: number,
  succeeded: number,
): QuoteRefreshRunStatus {
  if (status === "RUNNING" || status === "FAILED") {
    return status;
  }

  if (own === 0 || failed === 0) {
    return "COMPLETED";
  }

  return succeeded === 0 ? "FAILED" : "COMPLETED_WITH_ISSUES";
}
