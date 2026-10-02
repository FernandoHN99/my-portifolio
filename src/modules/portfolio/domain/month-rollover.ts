import type { QuoteRefreshOutcome, QuoteRefreshSummary } from "@/modules/quotes/domain/quote-refresh";

// Tipos da virada de mês e da checagem de abertura, sem dependências de banco,
// para poderem ser usados no navegador.

export type GeneratedMonthView = {
  month: string;
  sourceMonth: string;
  isCurrent: boolean;
  positions: number;
  // Símbolos das posições cuja cotação veio do histórico diário do próprio mês.
  quotesFromHistory: string[];
  // Símbolos das posições que repetem a cotação do mês anterior por falta de
  // histórico diário dentro do mês.
  carriedQuotes: string[];
};

export type MonthRolloverOutcome =
  | { state: "up-to-date"; latestMonth: string | null }
  | { state: "created"; months: GeneratedMonthView[] }
  | { state: "unavailable"; message: string };

export type OpenCheckResponse = {
  rollover: MonthRolloverOutcome;
  refresh: QuoteRefreshOutcome;
  summary: QuoteRefreshSummary | null;
};
