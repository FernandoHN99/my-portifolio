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

  const indicator = page.getByTestId("quote-refresh");
  await expect(indicator).toHaveAccessibleName("Atualizado há 5 min");

  if (testInfo.project.name.startsWith("mobile")) {
    await expect(indicator).toContainText("5 min");
  } else {
    await expect(indicator.getByText("Atualizado há 5 min")).toBeVisible();
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
  await expect(page.getByTestId("quote-refresh")).toHaveAccessibleName(/Falha na última tentativa: BTC, VOO/);

  // O Base UI só expõe o botão de fechar à acessibilidade com a pilha expandida.
  await toast.locator('button[aria-label="Fechar aviso"]').click();
  await expect(toast).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Carteira do mês" })).toBeVisible();
});

// Só há atualização automática (spec 051): nenhuma tela oferece atualizar na
// hora, e a rota da atualização manual não existe mais.
test("não há atualização manual em nenhum mês", async ({ page }, testInfo) => {
  const lastRun = run();
  await stubQuoteChecks(page, {
    openCheck: {
      refresh: { state: "fresh", lastStartedAt: lastRun.startedAt },
      summary: summary(lastRun, lastRun.finishedAt),
    },
  });

  for (const path of ["/", "/?mes=2026-09", "/posicoes/cotacoes"]) {
    await page.goto(path);
    const indicator = page.getByTestId("quote-refresh");
    await expect(indicator).toContainText(testInfo.project.name.startsWith("mobile") ? "5 min" : "Atualizado há 5 min");
    await expect(page.getByRole("button", { name: /Atualizar cotações/ })).toHaveCount(0);
  }

  // O card da última atualização só aparece no mês corrente (spec 038).
  await expect(page.getByRole("region", { name: "Última atualização" })).toContainText(
    "As cotações são buscadas automaticamente ao abrir o aplicativo",
  );
  await page.goto("/posicoes/cotacoes?mes=2026-09");
  await expect(page.getByRole("heading", { level: 1, name: "Cotações do mês" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Última atualização" })).toHaveCount(0);

  const response = await page.request.post("/api/quotes/refresh", { data: {} });
  expect(response.status()).toBe(404);
});

test("uma checagem demorada mostra que as cotações estão sendo atualizadas", async ({ page }, testInfo) => {
  const fresh = run({ startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() });
  await stubQuoteChecks(page, {
    openCheck: { refresh: { state: "done", run: fresh }, summary: summary(fresh, fresh.finishedAt) },
    delayMs: 1500,
  });
  await page.goto("/");

  const indicator = page.getByTestId("quote-refresh");
  await expect(indicator).toHaveAttribute("aria-busy", "true");
  if (!testInfo.project.name.startsWith("mobile")) {
    await expect(indicator.getByText("Atualizando cotações…")).toBeVisible();
  }

  await expect(indicator).not.toHaveAttribute("aria-busy");
  await expect(indicator).toHaveAccessibleName("Atualizado agora");
  // Uma atualização sem falhas não gera aviso.
  await expect(page.getByTestId("app-toast")).toHaveCount(0);
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
  // Vinte e quatro navegações: o tempo padrão não basta com a suíte em paralelo.
  test.setTimeout(120_000);
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

    // O mês corrente e um mês passado, com o mesmo indicador.
    for (const [width, path] of widths.flatMap((width) => ["/posicoes", "/posicoes?mes=2026-09"].map((path) => [width, path] as const))) {
      await page.setViewportSize({ width, height: 760 });
      await page.goto(path);
      const nav = page.getByRole("navigation", { name: "Navegação principal" });
      await expect(page.getByTestId("quote-refresh")).toContainText(/\d/);
      await expect(page.getByRole("link", { name: "Posições" })).toBeVisible();

      const scroller = await nav.evaluate((element) => {
        const parent = element.parentElement as HTMLElement;
        return { clientWidth: parent.clientWidth, scrollWidth: parent.scrollWidth };
      });
      expect(scroller.scrollWidth, `abas cortadas em ${width} px (${path})`).toBeLessThanOrEqual(scroller.clientWidth);
    }
  }
});
