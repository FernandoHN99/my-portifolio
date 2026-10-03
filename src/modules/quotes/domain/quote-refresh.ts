// Tipos e regras da atualização de cotações compartilhados entre servidor e
// interface. Sem dependências de banco, para poder ser importado no cliente.

import type { MonthRolloverOutcome } from "@/modules/portfolio/domain/month-rollover";

export const QUOTE_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

/** Janela do histórico de execuções da página de cotações (spec 028). */
export const RUN_HISTORY_MONTHS = 36;

export type QuoteRefreshTriggerKind = "AUTO" | "MANUAL";
export type QuoteRefreshRunStatus = "RUNNING" | "COMPLETED" | "COMPLETED_WITH_ISSUES" | "FAILED";

export type QuoteFailureView = {
  symbol: string;
  assets: string[];
  provider: string;
  errorCode: string;
  errorMessage: string;
};

export type QuoteRefreshRunView = {
  id: string;
  trigger: QuoteRefreshTriggerKind;
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

export type ManualRefreshResponse = {
  /** Virada de mês conferida antes da atualização (spec 034). */
  rollover?: MonthRolloverOutcome;
  refresh: QuoteRefreshOutcome;
  summary: QuoteRefreshSummary | null;
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
