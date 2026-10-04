// Tipos e regras da atualização de cotações compartilhados entre servidor e
// interface. Sem dependências de banco, para poder ser importado no cliente.

// As cotações são atualizadas só pelo job agendado, de hora em hora (spec
// 053); a interface lê o resumo da última execução.

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
  tesouro: "Tesouro Nacional",
};

export function providerLabel(provider: string) {
  return PROVIDER_LABELS[provider] ?? provider;
}
