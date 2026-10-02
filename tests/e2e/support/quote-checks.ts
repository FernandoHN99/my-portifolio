import type { Page, Route } from "@playwright/test";

import type { OpenCheckResponse } from "@/modules/portfolio/domain/month-rollover";
import type {
  ManualRefreshResponse,
  QuoteRefreshRunView,
  QuoteRefreshSummary,
} from "@/modules/quotes/domain/quote-refresh";

// Os testes de interface rodam sobre os dados reais. A checagem de abertura e a
// atualização manual gravam no banco, criam competências e consultam
// provedores, então os cenários substituem essas rotas por respostas fixas.
// As respostas usam os tipos das rotas, para o typecheck acusar mudanças no
// contrato.

export const IDLE_OPEN_CHECK: OpenCheckResponse = {
  rollover: { state: "up-to-date", latestMonth: null },
  refresh: { state: "fresh", lastStartedAt: "2026-10-02T12:00:00.000Z" },
  summary: null,
};

const BUSY_REFRESH: ManualRefreshResponse = { refresh: { state: "busy", runId: "stub" }, summary: null };

export async function stubQuoteChecks(
  page: Page,
  {
    openCheck,
    refresh = BUSY_REFRESH,
    refreshDelayMs = 0,
  }: { openCheck?: Partial<OpenCheckResponse>; refresh?: ManualRefreshResponse; refreshDelayMs?: number } = {},
) {
  const openCheckResponse: OpenCheckResponse = { ...IDLE_OPEN_CHECK, ...openCheck };

  await page.route("**/api/quotes/open-check", (route) => route.fulfill({ json: openCheckResponse }));
  await page.route("**/api/quotes/refresh", async (route: Route) => {
    if (refreshDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, refreshDelayMs));
    }

    await route.fulfill({ json: refresh });
  });
}

const MINUTE = 60 * 1000;

// Execução de cotações concluída há cinco minutos e meio, ajustável por cenário.
export function stubRun(overrides: Partial<QuoteRefreshRunView> = {}): QuoteRefreshRunView {
  const startedAt = new Date(Date.now() - 5.5 * MINUTE).toISOString();

  return {
    id: "00000000-0000-4000-8000-000000000001",
    trigger: "AUTO",
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
