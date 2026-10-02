import { rejectForeignRequest } from "@/lib/same-origin-request";
import { getQuoteRefreshSummary, refreshQuotes } from "@/modules/quotes/application/refresh-quotes";
import type { ManualRefreshResponse, QuoteRefreshOutcome } from "@/modules/quotes/domain/quote-refresh";

export const dynamic = "force-dynamic";

// Atualização manual pelo botão do topo. Ver a nota da rota open-check sobre
// por que não é uma Server Action.
export async function POST(request: Request) {
  const rejection = rejectForeignRequest(request);

  if (rejection) {
    return rejection;
  }

  const refresh = await refreshQuotes({ trigger: "MANUAL" }).catch(
    (): QuoteRefreshOutcome => ({ state: "unavailable", message: "Não foi possível atualizar as cotações." }),
  );
  const body: ManualRefreshResponse = { refresh, summary: await getQuoteRefreshSummary() };

  return Response.json(body);
}
