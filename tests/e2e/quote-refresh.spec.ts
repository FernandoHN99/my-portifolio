import { expect, test } from "@playwright/test";

import { stubQuoteChecks } from "./support/quote-checks";

const MINUTE = 60 * 1000;

function run(overrides: Record<string, unknown> = {}) {
  const now = Date.now();

  return {
    id: "00000000-0000-4000-8000-000000000001",
    trigger: "AUTO",
    status: "COMPLETED",
    quoteDate: "2026-10-02",
    startedAt: new Date(now - 5.5 * MINUTE).toISOString(),
    finishedAt: new Date(now - 5.5 * MINUTE).toISOString(),
    succeeded: 10,
    failures: [],
    errorMessage: null,
    repricedMonth: "2026-10",
    ...overrides,
  };
}

// O resumo das rotas simuladas é mais novo que o lido pelo servidor ao montar
// a página, para que o cabeçalho passe a usar o resumo simulado.
function summary(lastRun: Record<string, unknown>, lastUpdatedAt: string | null) {
  return {
    generatedAt: new Date(Date.now() + 24 * 60 * MINUTE).toISOString(),
    lastUpdatedAt,
    lastRun,
  };
}

test("o topo mostra a última atualização das cotações", async ({ page }, testInfo) => {
  const lastRun = run();
  await stubQuoteChecks(page, {
    openCheck: {
      refresh: { state: "fresh", lastStartedAt: lastRun.startedAt },
      summary: summary(lastRun, lastRun.finishedAt as string),
    },
  });
  await page.goto("/");

  const button = page.getByRole("button", { name: /^Atualizar cotações/ });
  await expect(button).toHaveAccessibleName("Atualizar cotações. atualizado há 5 min");

  if (testInfo.project.name.startsWith("mobile")) {
    await expect(button).toContainText("5 min");
  } else {
    await expect(page.getByTestId("quote-refresh").getByText("Atualizado há 5 min")).toBeVisible();
  }

  await expect(page.getByTestId("quote-refresh-issue")).toHaveCount(0);
  await expect(page.getByTestId("app-toast")).toHaveCount(0);
});

test("cada cotação com falha vira um aviso que indica o ativo", async ({ page }) => {
  const failed = run({
    status: "COMPLETED_WITH_ISSUES",
    succeeded: 8,
    failures: [
      {
        symbol: "BTC",
        assets: ["Bitcoin 01", "Bitcoin 02"],
        provider: "coingecko",
        errorCode: "RATE_LIMITED",
        errorMessage: "O provedor recusou por excesso de consultas (HTTP 429).",
      },
      {
        symbol: "VOO",
        assets: ["ETF - VOO"],
        provider: "finnhub",
        errorCode: "TIMEOUT",
        errorMessage: "O provedor excedeu o tempo limite.",
      },
    ],
  });
  await stubQuoteChecks(page, {
    openCheck: { refresh: { state: "done", run: failed }, summary: summary(failed, failed.finishedAt as string) },
  });
  await page.goto("/posicoes");

  const toast = page.getByTestId("app-toast");
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText("2 cotações não atualizadas");
  await expect(toast).toContainText("As outras 8 foram atualizadas.");
  await expect(toast).toContainText("BTC");
  await expect(toast).toContainText("Bitcoin 01, Bitcoin 02");
  await expect(toast).toContainText("CoinGecko: O provedor recusou por excesso de consultas (HTTP 429).");
  await expect(toast).toContainText("VOO");
  await expect(toast).toContainText("Finnhub: O provedor excedeu o tempo limite.");
  await expect(page.getByTestId("quote-refresh-issue")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Atualizar cotações/ })).toHaveAccessibleName(
    /Falha na última tentativa: BTC, VOO/,
  );

  // O Base UI só expõe o botão de fechar à acessibilidade com a pilha expandida.
  await toast.locator('button[aria-label="Fechar aviso"]').click();
  await expect(toast).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Carteira do mês" })).toBeVisible();
});

test("o botão do topo atualiza as cotações manualmente", async ({ page }, testInfo) => {
  const manual = run({
    id: "00000000-0000-4000-8000-000000000002",
    trigger: "MANUAL",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  });
  await stubQuoteChecks(page, {
    refresh: { refresh: { state: "done", run: manual }, summary: summary(manual, manual.finishedAt as string) },
    refreshDelayMs: 1200,
  });
  const hydrated = page.waitForRequest("**/api/quotes/open-check");
  await page.goto("/?mes=2026-09");
  await hydrated;

  const button = page.getByRole("button", { name: /^Atualizar cotações/ });
  await button.click();
  await expect(button).toBeDisabled();
  await expect(button.locator("svg")).toHaveClass(/animate-spin/);
  if (!testInfo.project.name.startsWith("mobile")) {
    await expect(page.getByTestId("quote-refresh").getByText("Atualizando cotações…")).toBeVisible();
  }

  const toast = page.getByTestId("app-toast");
  await expect(toast).toContainText("Cotações atualizadas");
  await expect(toast).toContainText("10 cotações gravadas no histórico de hoje e posições de Out/26 recalculadas.");
  await expect(button).toBeEnabled();
  await expect(button).toHaveAccessibleName("Atualizar cotações. atualizado agora");
});

test("uma atualização já em andamento é avisada", async ({ page }) => {
  await stubQuoteChecks(page);
  const hydrated = page.waitForRequest("**/api/quotes/open-check");
  await page.goto("/?mes=2026-09");
  await hydrated;

  await page.getByRole("button", { name: /^Atualizar cotações/ }).click();
  await expect(page.getByTestId("app-toast")).toContainText("Já existe uma atualização de cotações em andamento.");
});
