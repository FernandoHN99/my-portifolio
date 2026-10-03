// Tipos e regras da atualização de cotações compartilhados entre servidor e
// interface. Sem dependências de banco, para poder ser importado no cliente.

// Só há atualização automática (spec 051): ao abrir o aplicativo, quando a
// última tentativa tem mais de uma hora.
export const QUOTE_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export type QuoteRefreshRunStatus = "RUNNING" | "COMPLETED" | "COMPLETED_WITH_ISSUES" | "FAILED";

export type QuoteFailureView = {
  symbol: string;
  assets: string[];
  provider: string;
  errorCode: string;
  errorMessage: string;
};

/** Uma execução vista por um usuário: só os símbolos dele (spec 051). */
export type QuoteRefreshRunView = {
  id: string;
  status: QuoteRefreshRunStatus;
  quoteDate: string;
  startedAt: string;
  finishedAt: string | null;
  succeeded: number;
  failures: QuoteFailureView[];
  errorMessage: string | null;
  repricedMonth: string | null;
};

export type QuoteRefreshSummary = {
  generatedAt: string;
  lastUpdatedAt: string | null;
  lastRun: QuoteRefreshRunView | null;
};

export type QuoteRefreshOutcome =
  | { state: "fresh"; lastStartedAt: string }
  | { state: "busy"; runId: string }
  | { state: "done"; run: QuoteRefreshRunView }
  | { state: "unavailable"; message: string };

/**
 * Cotação que pode ser editada à mão (spec 028). O usuário não pretende editar
 * cotações: a edição existe só para a que não foi encontrada (sem valor no
 * mês ou repetida de outro mês) ou cuja última busca no mês falhou.
 */
export function isQuoteEditable({
  hasValue,
  carried,
  lastFailed,
}: {
  hasValue: boolean;
  carried: boolean;
  lastFailed: boolean;
}) {
  return !hasValue || carried || lastFailed;
}

export function isRefreshDue(lastStartedAt: Date | null, now: Date) {
  if (!lastStartedAt) {
    return true;
  }

  const elapsed = now.getTime() - lastStartedAt.getTime();
  return elapsed >= QUOTE_REFRESH_INTERVAL_MS || elapsed < 0;
}

const PROVIDER_LABELS: Record<string, string> = {
  "alpha-vantage": "Alpha Vantage",
  "awesome-api": "AwesomeAPI",
  bcb: "Banco Central (PTAX)",
  binance: "Binance",
  brapi: "brapi",
  coingecko: "CoinGecko",
  configuration: "Configuração",
  finnhub: "Finnhub",
  fixed: "Valor fixo",
  provider: "Provedor",
  yahoo: "Yahoo Finance",
};

export function providerLabel(provider: string) {
  return PROVIDER_LABELS[provider] ?? provider;
}
