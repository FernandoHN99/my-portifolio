import type { Page, Route } from "@playwright/test";

// Os testes de interface rodam sobre os dados reais. A checagem de abertura e a
// atualização manual gravam no banco e consultam provedores, então os cenários
// substituem essas rotas por respostas fixas.

type Json = Record<string, unknown>;

export const IDLE_OPEN_CHECK: Json = {
  refresh: { state: "fresh", lastStartedAt: "2026-10-02T12:00:00.000Z" },
  summary: null,
};

export async function stubQuoteChecks(
  page: Page,
  {
    openCheck = IDLE_OPEN_CHECK,
    refresh,
    refreshDelayMs = 0,
  }: { openCheck?: Json; refresh?: Json; refreshDelayMs?: number } = {},
) {
  await page.route("**/api/quotes/open-check", (route) => route.fulfill({ json: openCheck }));
  await page.route("**/api/quotes/refresh", async (route: Route) => {
    if (refreshDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, refreshDelayMs));
    }

    await route.fulfill({ json: refresh ?? { refresh: { state: "busy", runId: "stub" }, summary: null } });
  });
}
