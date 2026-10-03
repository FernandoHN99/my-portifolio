import type { Page, Route } from "@playwright/test";

import type { OpenCheckResponse } from "@/modules/portfolio/domain/month-rollover";
import type { QuoteRefreshRunView, QuoteRefreshSummary } from "@/modules/quotes/domain/quote-refresh";

// Os testes de interface rodam sobre os dados reais. A checagem de abertura
// grava no banco, cria competências e consulta provedores, então os cenários a
// substituem por respostas fixas. Só há atualização automática (spec 051). As
// respostas usam os tipos da rota, para o typecheck acusar mudanças no
// contrato.

export const IDLE_OPEN_CHECK: OpenCheckResponse = {
  rollover: { state: "up-to-date", latestMonth: null },
  targetPlan: "existing",
  refresh: { state: "fresh", lastStartedAt: "2026-10-02T12:00:00.000Z" },
  summary: null,
};

export async function stubQuoteChecks(
  page: Page,
  { openCheck, delayMs = 0 }: { openCheck?: Partial<OpenCheckResponse>; delayMs?: number } = {},
) {
  const openCheckResponse: OpenCheckResponse = { ...IDLE_OPEN_CHECK, ...openCheck };

  await page.route("**/api/quotes/open-check", async (route: Route) => {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    await route.fulfill({ json: openCheckResponse });
  });
}

const MINUTE = 60 * 1000;

// Execução de cotações concluída há cinco minutos e meio, ajustável por cenário.
export function stubRun(overrides: Partial<QuoteRefreshRunView> = {}): QuoteRefreshRunView {
  const startedAt = new Date(Date.now() - 5.5 * MINUTE).toISOString();

  return {
    id: "00000000-0000-4000-8000-000000000001",
    status: "COMPLETED",
    quoteDate: "2026-10-02",
    startedAt,
    finishedAt: startedAt,
    succeeded: 10,
    failures: [],
    errorMessage: null,
    repricedMonth: "2026-10",
    ...overrides,
  };
}

// O resumo das rotas simuladas é mais novo que o lido pelo servidor ao montar
// a página, para que o cabeçalho passe a usar o resumo simulado.
export function stubSummary(lastRun: QuoteRefreshRunView, lastUpdatedAt: string | null): QuoteRefreshSummary {
  return {
    generatedAt: new Date(Date.now() + 24 * 60 * MINUTE).toISOString(),
    lastUpdatedAt,
    lastRun,
  };
}
