import type { QuoteRefreshSummary } from "@/modules/quotes/domain/quote-refresh";

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
  /**
   * Faltam competências até o mês corrente (spec 078): a abertura só avisa, e
   * o usuário confirma antes de o app criá-las.
   */
  | { state: "pending"; latestMonth: string; months: string[] }
  | { state: "created"; months: GeneratedMonthView[] }
  /** Primeira competência de um usuário novo, vazia e aberta (spec 055). */
  | { state: "started"; month: string }
  | { state: "unavailable"; message: string };

/**
 * Metas padrão na abertura (spec 048): criadas agora, já existentes, sem
 * posições para tirar as categorias ou indisponíveis por uma falha.
 */
export type TargetPlanCheck = "created" | "existing" | "no-positions" | "unavailable";

export type OpenCheckResponse = {
  rollover: MonthRolloverOutcome;
  targetPlan: TargetPlanCheck;
  summary: QuoteRefreshSummary | null;
};
