import { expect, type Locator, test } from "@playwright/test";

function parseShare(text: string) {
  return Number(text.replace("%", "").replace(/\./g, "").replace(",", ".").trim());
}

async function columnSum(table: Locator, column: number) {
  const cells = await table.locator(`tbody tr > :nth-child(${column})`).allTextContents();
  return cells.reduce((sum, cell) => sum + parseShare(cell), 0);
}

test("a variação em todo o período substitui o card fora da meta", async ({ page }) => {
  await page.goto("/?mes=2026-09");

  const kpis = page.getByRole("region", { name: "Indicadores da competência" });
  await expect(kpis.getByText("Variação em todo o período")).toBeVisible();
  await expect(kpis.getByText("Fora da meta")).toHaveCount(0);
  await expect(page.getByTestId("period-change")).toContainText("%");
  await expect(kpis.getByText(/desde [A-Z][a-z]{2}\/\d{2}$/)).toBeVisible();

  await page.goto("/?mes=2023-06");
  await expect(page.getByTestId("period-change")).toHaveText("—");
  await expect(kpis.getByText("Primeira competência do histórico")).toBeVisible();
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
  expect(await current.locator(".recharts-label-list text").count()).toBeGreaterThan(0);

  const table = card.getByRole("table", { name: "Renda fixa por duração, atual e ideal" });
  expect(Math.abs((await columnSum(table, 3)) - 100)).toBeLessThan(0.5);
  expect(Math.abs((await columnSum(table, 4)) - 100)).toBeLessThan(0.5);
});

test("os cards respondem ao ponteiro como os indicadores", async ({ page }) => {
  await page.goto("/?mes=2026-09");

  const hoverable = await page.evaluate(() => matchMedia("(hover: hover)").matches);
  const kpi = page.getByRole("region", { name: "Indicadores da competência" }).locator("article").first();
  const panel = page.locator("#evolucao");
  const style = (locator: Locator, property: "transform" | "borderTopColor") =>
    locator.evaluate((element, name) => getComputedStyle(element)[name], property);

  const panelBorder = await style(panel, "borderTopColor");
  await kpi.hover();

  if (!hoverable) {
    await expect.poll(() => style(kpi, "transform")).toBe("none");
    return;
  }

  await expect.poll(() => style(kpi, "transform")).toBe("matrix(1, 0, 0, 1, 0, -1)");

  await panel.hover();
  await expect.poll(() => style(panel, "borderTopColor")).not.toBe(panelBorder);
  expect(await style(panel, "transform")).not.toContain("-1)");

  await page.mouse.move(0, 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await kpi.hover();
  await expect.poll(() => style(kpi, "transform")).toBe("none");
});
