import { ensureMonthsUpToDate } from "@/modules/portfolio/application/month-rollover";
import type { MonthRolloverOutcome, OpenCheckResponse } from "@/modules/portfolio/domain/month-rollover";
import {
  getQuoteRefreshSummary,
  refreshQuotes,
  type QuoteFetcher,
} from "@/modules/quotes/application/refresh-quotes";
import type { QuoteRefreshOutcome } from "@/modules/quotes/domain/quote-refresh";

// Checagem feita quando o aplicativo é aberto. Primeiro a virada de mês, que
// cria as competências que faltam até o mês corrente; depois as cotações, se a
// última tentativa tiver mais de uma hora. Nenhuma falha aqui quebra a página,
// e uma falha na virada não impede a atualização das cotações.
export async function runOpenChecks({
  now = new Date(),
  fetchQuotes,
}: { now?: Date; fetchQuotes?: QuoteFetcher } = {}): Promise<OpenCheckResponse> {
  const rollover = await ensureMonthsUpToDate(now).catch(
    (error: unknown): MonthRolloverOutcome => ({
      state: "unavailable",
      message: describeUnexpected(error, "Não foi possível criar a competência do mês."),
    }),
  );
  const refresh = await refreshQuotes({ trigger: "AUTO", now, fetchQuotes }).catch(
    (error: unknown): QuoteRefreshOutcome => ({
      state: "unavailable",
      message: describeUnexpected(error, "Não foi possível atualizar as cotações."),
    }),
  );

  return { rollover, refresh, summary: await getQuoteRefreshSummary() };
}

function describeUnexpected(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? `${fallback} ${error.message.slice(0, 200)}` : fallback;
}
