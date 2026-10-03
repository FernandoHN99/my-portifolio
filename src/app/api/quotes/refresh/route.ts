import { rejectForeignRequest } from "@/lib/same-origin-request";
import { rejectWithoutSession } from "@/modules/auth/session";
import { ensureMonthsUpToDate } from "@/modules/portfolio/application/month-rollover";
import type { MonthRolloverOutcome } from "@/modules/portfolio/domain/month-rollover";
import { getQuoteRefreshSummary, refreshQuotes } from "@/modules/quotes/application/refresh-quotes";
import type { ManualRefreshResponse, QuoteRefreshOutcome } from "@/modules/quotes/domain/quote-refresh";

export const dynamic = "force-dynamic";

// Atualização manual pelo botão do topo. Como a checagem ao abrir, confere
// antes a virada de mês (spec 034). Ver a nota da rota open-check sobre por que
// não é uma Server Action.
export async function POST(request: Request) {
  const rejection = rejectForeignRequest(request);

  if (rejection) {
    return rejection;
  }

  const unauthorized = await rejectWithoutSession();

  if (unauthorized) {
    return unauthorized;
  }

  const rollover = await ensureMonthsUpToDate().catch(
    (): MonthRolloverOutcome => ({ state: "unavailable", message: "Não foi possível criar a competência do mês." }),
  );
  const refresh = await refreshQuotes({ trigger: "MANUAL" }).catch(
    (): QuoteRefreshOutcome => ({ state: "unavailable", message: "Não foi possível atualizar as cotações." }),
  );
  const body: ManualRefreshResponse = { rollover, refresh, summary: await getQuoteRefreshSummary() };

  return Response.json(body);
}
