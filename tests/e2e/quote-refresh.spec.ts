import { expect, test } from "@playwright/test";

import { stubQuoteChecks, stubRun as run, stubSummary as summary } from "./support/quote-checks";

const MINUTE = 60 * 1000;

test("o topo mostra a última atualização das cotações", async ({ page }, testInfo) => {
  const lastRun = run();
  await stubQuoteChecks(page, {
    openCheck: {
      refresh: { state: "fresh", lastStartedAt: lastRun.startedAt },
      summary: summary(lastRun, lastRun.finishedAt),
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
    openCheck: { refresh: { state: "done", run: failed }, summary: summary(failed, failed.finishedAt) },
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
    refresh: { refresh: { state: "done", run: manual }, summary: summary(manual, manual.finishedAt) },
    refreshDelayMs: 1200,
  });
  const hydrated = page.waitForRequest("**/api/quotes/open-check");
  await page.goto("/?mes=2026-09");
  await hydrated;

  // Pelo teclado: o botão continua focado enquanto a atualização roda.
  const button = page.getByRole("button", { name: /^Atualizar cotações/ });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveAttribute("aria-disabled", "true");
  await expect(button).toHaveAttribute("aria-busy", "true");
  await expect(button).toBeFocused();
  await expect(button.locator("svg")).toHaveClass(/animate-spin/);
  if (!testInfo.project.name.startsWith("mobile")) {
    await expect(page.getByTestId("quote-refresh").getByText("Atualizando cotações…")).toBeVisible();
  }

  const toast = page.getByTestId("app-toast");
  await expect(toast).toContainText("Cotações atualizadas");
  await expect(toast).toContainText("10 cotações gravadas no histórico de hoje e posições de Out/26 recalculadas.");
  await expect(button).not.toHaveAttribute("aria-disabled");
  await expect(button).toBeFocused();
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

test("uma falha ao gravar a atualização indica cada ativo", async ({ page }) => {
  const failed = run({
    status: "FAILED",
    succeeded: 0,
    errorMessage: "As cotações foram consultadas, mas não puderam ser gravadas.",
    failures: ["BTC", "VOO"].map((symbol) => ({
      symbol,
      assets: [symbol === "BTC" ? "Bitcoin 01" : "ETF - VOO"],
      provider: symbol === "BTC" ? "coingecko" : "finnhub",
      errorCode: "NOT_SAVED",
      errorMessage: "A cotação foi obtida, mas não pôde ser gravada.",
    })),
  });
  await stubQuoteChecks(page, {
    openCheck: { refresh: { state: "done", run: failed }, summary: summary(failed, null) },
  });
  await page.goto("/");

  const toast = page.getByTestId("app-toast");
  await expect(toast).toContainText("2 cotações não atualizadas");
  await expect(toast).toContainText("Os ativos mantêm o valor anterior.");
  await expect(toast).toContainText("Bitcoin 01");
  await expect(toast).toContainText("Finnhub: A cotação foi obtida, mas não pôde ser gravada.");
  await expect(page.getByRole("heading", { level: 1, name: "Patrimônio consolidado" })).toBeVisible();
});

test("a checagem automática avisa quando o aplicativo não responde", async ({ page }) => {
  await stubQuoteChecks(page);
  await page.route("**/api/quotes/open-check", (route) => route.fulfill({ status: 500, body: "erro" }));
  await page.goto("/posicoes");

  await expect(page.getByTestId("app-toast")).toContainText("Não foi possível verificar as cotações");
  await expect(page.getByRole("heading", { level: 1, name: "Carteira do mês" })).toBeVisible();
});

// As abas principais não podem ser cortadas pelo indicador do topo. O rótulo
// de data é o mais longo no computador, e "59 min" o mais largo no celular.
test("o indicador do topo não corta as abas em telas estreitas", async ({ page }) => {
  const labels = [
    { lastUpdatedAt: "2026-09-30T07:39:00.000Z", widths: [320, 360, 375, 640, 768, 1024] },
    { lastUpdatedAt: new Date(Date.now() - 59 * MINUTE).toISOString(), widths: [320, 360] },
  ];

  for (const { lastUpdatedAt, widths } of labels) {
    const lastRun = run({ startedAt: lastUpdatedAt, finishedAt: lastUpdatedAt });
    await page.unrouteAll();
    await stubQuoteChecks(page, {
      openCheck: { refresh: { state: "fresh", lastStartedAt: lastUpdatedAt }, summary: summary(lastRun, lastUpdatedAt) },
    });

    for (const width of widths) {
      await page.setViewportSize({ width, height: 760 });
      await page.goto("/posicoes?mes=2026-09");
      const nav = page.getByRole("navigation", { name: "Navegação principal" });
      await expect(page.getByTestId("quote-refresh")).toContainText(/\d/);
      await expect(page.getByRole("link", { name: "Posições" })).toBeVisible();

      const scroller = await nav.evaluate((element) => {
        const parent = element.parentElement as HTMLElement;
        return { clientWidth: parent.clientWidth, scrollWidth: parent.scrollWidth };
      });
      expect(scroller.scrollWidth, `abas cortadas em ${width} px`).toBeLessThanOrEqual(scroller.clientWidth);
    }
  }
});
