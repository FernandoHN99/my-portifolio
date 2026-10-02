import {
  getQuoteRefreshSummary,
  refreshQuotes,
  type QuoteFetcher,
} from "@/modules/quotes/application/refresh-quotes";
import type { OpenCheckResponse, QuoteRefreshOutcome } from "@/modules/quotes/domain/quote-refresh";

// Checagem feita quando o aplicativo é aberto: atualiza as cotações se a última
// tentativa tiver mais de uma hora. Nenhuma falha aqui pode quebrar a página.
export async function runOpenChecks({
  now = new Date(),
  fetchQuotes,
}: { now?: Date; fetchQuotes?: QuoteFetcher } = {}): Promise<OpenCheckResponse> {
  const refresh = await refreshQuotes({ trigger: "AUTO", now, fetchQuotes }).catch(
    (error: unknown): QuoteRefreshOutcome => ({
      state: "unavailable",
      message: describeUnexpected(error, "Não foi possível atualizar as cotações."),
    }),
  );

  return { refresh, summary: await getQuoteRefreshSummary() };
}

function describeUnexpected(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? `${fallback} ${error.message.slice(0, 200)}` : fallback;
}
