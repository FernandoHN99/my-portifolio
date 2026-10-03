import { expect, type Locator, type Page, test } from "@playwright/test";

import { stubQuoteChecks } from "./support/quote-checks";

// A checagem de abertura grava no banco e pode criar competências; os
// cenários usam a resposta fixa para não alterar os dados reais.
test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

function parseShare(text: string) {
  return Number(text.replace("%", "").replace(/\./g, "").replace(",", ".").trim());
}

async function columnShares(table: Locator, column: number) {
  const cells = await table.locator(`tbody tr > :nth-child(${column})`).allTextContents();
  return cells.map(parseShare);
}

async function columnSum(table: Locator, column: number) {
  return (await columnShares(table, column)).reduce((sum, share) => sum + share, 0);
}

async function pageWidth(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth);
}

test("a variação em todo o período substitui o card fora da meta", async ({ page }) => {
  await page.goto("/?mes=2026-09");

  const kpis = page.getByRole("region", { name: "Indicadores da competência" });
  const periodCard = kpis.locator("article").filter({ hasText: "Variação em todo o período" });
  await expect(periodCard).toBeVisible();
  await expect(kpis.getByText("Fora da meta")).toHaveCount(0);

  // O período começa em outubro de 2023, a primeira competência minimamente
  // completa (spec 030).
  await expect(page.getByTestId("period-change")).toHaveAttribute("data-value", /^\+[\d.]+(,\d{1,2})?%$/);
  await expect(page.getByTestId("period-change")).toHaveClass(/text-primary/);
  await expect(periodCard.locator("p").last()).toHaveText(/^R\$\s[\d.]+,\d{2} desde Out\/23$/);

  await page.goto("/?mes=2023-10");
  await expect(page.getByTestId("period-change")).toHaveText("—");
  await expect(periodCard.locator("p").last()).toHaveText("Início do período");

  await page.goto("/?mes=2023-06");
  await expect(page.getByTestId("period-change")).toHaveText("—");
  await expect(periodCard.locator("p").last()).toHaveText("O período começa em Out/23");
});

test("as variações comparam com meses do calendário", async ({ page }) => {
  const kpis = page.getByRole("region", { name: "Indicadores da competência" });
  const detail = (title: string) => kpis.locator("article").filter({ hasText: title }).locator("p").last();

  await page.goto("/?mes=2026-09");
  await expect(detail("Variação no mês")).toHaveText(/^R\$\s[\d.]+,\d{2}$/);
  await expect(detail("Variação em 12 meses")).toHaveText(/ desde Set\/25$/);

  // Agosto de 2024: julho de 2024 e agosto de 2023 não existem no histórico.
  await page.goto("/?mes=2024-08");
  await expect(page.getByTestId("month-change")).toHaveText("—");
  await expect(detail("Variação no mês")).toHaveText("Histórico insuficiente: sem Jul/24");
  await expect(page.getByTestId("year-change")).toHaveText("—");
  await expect(detail("Variação em 12 meses")).toHaveText("Histórico insuficiente: sem Ago/23");

  // Junho de 2024 compara com junho de 2023, exatamente doze meses antes.
  await page.goto("/?mes=2024-06");
  await expect(detail("Variação em 12 meses")).toHaveText(/ desde Jun\/23$/);

  await page.goto("/?mes=2023-06");
  await expect(detail("Variação no mês")).toHaveText("Primeira competência do histórico");
});

test("uma meta sem posição aparece para comprar", async ({ page }) => {
  await page.goto("/?mes=2024-03&corte=renda-fixa");
  const panel = page.getByRole("region", { name: "Comprar e vender" });
  const row = panel.getByRole("row").filter({ hasText: "IPCA · Curto" });
  await expect(row).toContainText("0,0%");
  await expect(row).toContainText("10,0%");
  await expect(row).toContainText("-R$");
  await expect(panel.getByText(/Comprar · \d+/)).toBeVisible();
});

test("a Visão Geral cabe na largura da tela", async ({ page }) => {
  await page.goto("/?mes=2026-09");

  await expect(page.getByRole("region", { name: "Comprar e vender" })).toBeVisible();
  await expect(
    page.getByTestId("duration-current").locator(".recharts-bar-rectangle").first(),
  ).toBeVisible();

  expect(await pageWidth(page)).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
});

test("renda fixa por duração mostra o atual em cima e o ideal embaixo na mesma escala", async ({ page }) => {
  await page.goto("/?mes=2026-09");

  const card = page.getByRole("region", { name: "Renda fixa por duração" });
  await card.scrollIntoViewIfNeeded();

  const legend = card.getByRole("list", { name: "Prazos" });
  for (const duration of ["Curto", "Médio", "Longo"]) {
    await expect(legend.getByText(duration, { exact: true })).toBeVisible();
  }

  const current = card.getByTestId("duration-current");
  const target = card.getByTestId("duration-target");
  await expect(current.locator(".recharts-bar-rectangle").first()).toBeVisible();
  await expect(target.locator(".recharts-bar-rectangle").first()).toBeVisible();

  const currentBox = await current.boundingBox();
  const targetBox = await target.boundingBox();
  expect(currentBox && targetBox && currentBox.y + currentBox.height <= targetBox.y).toBe(true);

  const ticks = (chart: Locator) =>
    chart.locator(".recharts-yAxis .recharts-cartesian-axis-tick-value").allTextContents();
  const categories = (chart: Locator) =>
    chart.locator(".recharts-xAxis .recharts-cartesian-axis-tick-value").allTextContents();
  expect(await ticks(current)).toEqual(await ticks(target));
  expect(await categories(current)).toEqual(await categories(target));
  await expect(current.locator(".recharts-label-list text").first()).toBeVisible();

  const table = card.getByRole("table", { name: "Renda fixa por duração, atual e ideal" });
  expect(Math.abs((await columnSum(table, 3)) - 100)).toBeLessThan(0.5);
  expect(Math.abs((await columnSum(table, 4)) - 100)).toBeLessThan(0.5);
});

test("um prazo fora do padrão ocupa a mesma posição nos dois gráficos", async ({ page }) => {
  // Em outubro de 2025 há BTC sem prazo só no atual; os dois gráficos mantêm as mesmas séries.
  await page.goto("/?mes=2025-10");

  const card = page.getByRole("region", { name: "Renda fixa por duração" });
  await card.scrollIntoViewIfNeeded();

  const legend = card.getByRole("list", { name: "Prazos" });
  await expect(legend.getByText("Sem prazo", { exact: true })).toBeVisible();

  const current = card.getByTestId("duration-current");
  const target = card.getByTestId("duration-target");
  const legendCount = await legend.getByRole("listitem").count();
  await expect(current.locator(".recharts-bar")).toHaveCount(legendCount);
  await expect(target.locator(".recharts-bar")).toHaveCount(legendCount);

  // Os rótulos só aparecem quando as barras terminam de entrar.
  await expect(current.locator(".recharts-label-list text").first()).toBeVisible();
  await expect(target.locator(".recharts-label-list text").first()).toBeVisible();

  const longBarsX = (chart: Locator) =>
    chart
      .locator(".recharts-bar")
      .nth(2)
      .locator(".recharts-bar-rectangle path")
      .evaluateAll((paths) => paths.map((path) => Math.round(path.getBoundingClientRect().x)));
  const currentLongX = await longBarsX(current);
  expect(currentLongX).toHaveLength(2);
  expect(await longBarsX(target)).toEqual(currentLongX);
});

test("num celular de 360 px, toda barra da renda fixa tem rótulo", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/?mes=2026-09");

  const card = page.getByRole("region", { name: "Renda fixa por duração" });
  await card.scrollIntoViewIfNeeded();

  const table = card.getByRole("table", { name: "Renda fixa por duração, atual e ideal" });
  const filled = async (column: number) =>
    (await columnShares(table, column)).filter((share) => share > 0).length;
  const labels = (mode: string) => card.getByTestId(`duration-${mode}`).locator(".recharts-label-list text");

  await expect(labels("current")).toHaveCount(await filled(3));
  await expect(labels("target")).toHaveCount(await filled(4));
  expect(await pageWidth(page)).toBeLessThanOrEqual(360);
});

test("os cards respondem ao ponteiro como os indicadores", async ({ page }) => {
  await page.goto("/?mes=2026-09");

  const hoverable = await page.evaluate(() => matchMedia("(hover: hover)").matches);
  const kpi = page.getByRole("region", { name: "Indicadores da competência" }).locator("article").first();
  const panel = page.locator("#evolucao");
  const style = (locator: Locator, property: "transform" | "borderTopColor") =>
    locator.evaluate((element, name) => getComputedStyle(element)[name], property);
  const settled = (locator: Locator) =>
    locator.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
  const documentTop = (locator: Locator) =>
    locator.evaluate((element) => element.getBoundingClientRect().top + window.scrollY);

  // A entrada da aba e os números animados movem os cards; o cursor parado
  // sobre um card que ainda se move pode sair dele. Espera as animações
  // finitas da página antes do hover.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  await settled(panel);
  const panelBorder = await style(panel, "borderTopColor");
  await kpi.hover();

  if (!hoverable) {
    await expect.poll(() => style(kpi, "transform")).toBe("none");
    return;
  }

  // Repete o hover a cada tentativa: um card que ainda se movia pode ter saído
  // de baixo do cursor.
  await expect
    .poll(async () => {
      await kpi.hover();
      return style(kpi, "transform");
    })
    .toBe("matrix(1, 0, 0, 1, 0, -1)");

  // O painel ganha a borda e o fundo do hover, mas não sobe.
  const panelTop = await documentTop(panel);
  await panel.hover();
  await expect.poll(() => style(panel, "borderTopColor")).not.toBe(panelBorder);
  await settled(panel);
  expect(await documentTop(panel)).toBeCloseTo(panelTop, 0);

  await page.mouse.move(0, 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await kpi.hover();
  await expect.poll(() => style(kpi, "transform")).toBe("none");
});
