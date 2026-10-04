import { expect, test, type Locator, type Page } from "@playwright/test";

import { SIGNED_OUT } from "./support/auth";
import { chooseKind, closeForm, continueForm, expectFormStep, openAddForm, openEditableMonth } from "./support/position-form";
import { stubQuoteChecks } from "./support/quote-checks";

// Spec 062: revisão de layout e roteamento de gestos, sem salvar dados da carteira.
test.beforeEach(async ({ page, isMobile }) => {
  test.skip(!isMobile, "Revisão da interface de toque.");
  await stubQuoteChecks(page);
});

async function assertPageWidth(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
}

async function assertInputSize(scope: Locator) {
  const inputs = scope.locator('input:not([type="hidden"], [type="checkbox"], [type="radio"], [type="range"], [type="color"]), textarea, select');
  for (const input of await inputs.all()) {
    if (await input.isVisible()) {
      expect(await input.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    }
  }
}

// Eventos sintéticos conferem quem recebe o gesto; não simulam a física do Safari.
async function swipe(target: Locator, dx: number) {
  const touch = { identifier: 1, clientX: 210, clientY: 220 };
  await target.dispatchEvent("touchstart", { touches: [touch], changedTouches: [touch] });
  await target.dispatchEvent("touchend", {
    touches: [],
    changedTouches: [{ ...touch, clientX: touch.clientX + dx }],
  });
}

test("viewport respeita áreas seguras e mantém zoom disponível", async ({ page }) => {
  await page.goto("/");
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewport).toContain("viewport-fit=cover");
  expect(viewport).toContain("interactive-widget=resizes-content");
  expect(viewport).not.toMatch(/user-scalable=(?:no|0)|maximum-scale=1(?:,|$)/);
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute("content", "dark");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", /.+/);
});

test("telas principais cabem em retrato e paisagem", async ({ context }) => {
  for (const viewport of [{ width: 430, height: 739 }, { width: 814, height: 380 }]) {
    for (const url of ["/", "/posicoes", "/posicoes/cotacoes", "/configuracao"]) {
      const page = await context.newPage();
      await stubQuoteChecks(page);
      await page.setViewportSize(viewport);
      await page.goto(url);
      await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
      await assertPageWidth(page);
      await assertInputSize(page.locator("body"));
      await page.close();
    }
  }
});

test("o trilho de metas usa uma linha inteira no celular", async ({ page }) => {
  await page.goto("/configuracao");
  const slider = page.getByRole("slider", { name: "Meta de Caixa", exact: true });
  const control = page.locator("[data-base-ui-slider-control]").filter({ has: slider });
  const input = page.getByRole("textbox", { name: "Percentual de Caixa" });
  await expect(slider).toBeVisible();
  const track = await control.boundingBox();
  const field = await input.boundingBox();
  expect(track).not.toBeNull();
  expect(field).not.toBeNull();
  expect(track!.width).toBeGreaterThan(250);
  expect(track!.y).toBeGreaterThanOrEqual(field!.y + field!.height);
  await assertInputSize(page.locator("body"));
});

test("swipe em conteúdo livre troca a aba e preserva a competência", async ({ page }) => {
  await page.goto("/?mes=2026-09");
  const heading = page.getByRole("heading", { name: "Patrimônio consolidado" });
  await expect(heading).toBeVisible();
  await swipe(heading, -100);
  await expect(page).toHaveURL(/\/posicoes\?mes=2026-09$/);
  await swipe(page.getByRole("heading", { name: "Carteira do mês" }), 100);
  await expect(page).toHaveURL(/\/\?mes=2026-09$/);
});

test("campo e tabela horizontal não acionam swipe de abas", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-09");
  const search = page.getByRole("searchbox");
  await expect(search).toBeVisible();
  await swipe(search, 100);
  await expect(page).toHaveURL(/\/posicoes\?mes=2026-09$/);

  // A tabela compacta de Posições pode caber; o rebalanceamento exige rolagem.
  await page.goto("/?mes=2026-09");
  const table = page.getByRole("region", { name: "Comprar e vender" }).getByRole("table");
  await expect(table).toBeVisible();
  expect(await table.evaluate((element) => element.parentElement!.scrollWidth > element.parentElement!.clientWidth)).toBe(true);
  await swipe(table.getByRole("cell").filter({ hasText: "R$" }).first(), -100);
  await expect(page).toHaveURL(/\/\?mes=2026-09$/);
});

test("cancelar ou usar dois dedos não troca a aba", async ({ page }) => {
  await page.goto("/");
  const heading = page.getByRole("heading", { name: "Patrimônio consolidado" });
  await expect(heading).toBeVisible();
  const touch = { identifier: 1, clientX: 210, clientY: 220 };
  await heading.dispatchEvent("touchstart", { touches: [touch], changedTouches: [touch] });
  await heading.dispatchEvent("touchcancel", { touches: [], changedTouches: [touch] });
  await heading.dispatchEvent("touchend", { touches: [], changedTouches: [{ ...touch, clientX: 80 }] });
  await expect(page).toHaveURL(/\/$/);

  await heading.dispatchEvent("touchstart", { touches: [touch, { ...touch, identifier: 2 }], changedTouches: [touch] });
  await heading.dispatchEvent("touchend", { touches: [], changedTouches: [{ ...touch, clientX: 80 }] });
  await expect(page).toHaveURL(/\/$/);
});

test("faixa de competências mantém mês ativo visível e alvo de toque", async ({ page }) => {
  await page.goto("/?mes=2026-09");
  const timeline = page.getByRole("navigation", { name: "Competências" });
  await expect(timeline).toHaveAttribute("data-hydrated");
  const active = timeline.locator('[aria-current="date"]');
  await expect.poll(() => active.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const strip = element.closest("nav")!.getBoundingClientRect();
    return box.left >= strip.left - 1 && box.right <= strip.right + 1;
  })).toBe(true);
  expect((await active.boundingBox())!.height).toBeGreaterThanOrEqual(40);
});

test("formulário da posição continua rolável com viewport reduzida", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "Não há competência aberta nos dados de teste.");
  const dialog = await openAddForm(page);
  await expectFormStep(dialog, "Posição");
  await chooseKind(page, dialog, /Renda fixa/);
  const institution = dialog.getByRole("combobox", { name: "Instituição", exact: true });
  await institution.click();
  await page.getByRole("option", { name: "C6", exact: true }).click();
  await continueForm(dialog, "Ativo");
  await dialog.getByRole("textbox", { name: "Nome do ativo", exact: true }).fill("CDB Teste mobile");
  await dialog.getByRole("textbox", { name: "Saldo (R$)", exact: true }).fill("1000");
  await page.setViewportSize({ width: 430, height: 420 });
  await expect(dialog.getByRole("button", { name: "Continuar", exact: true })).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "Voltar", exact: true })).toBeInViewport();
  const box = await dialog.boundingBox();
  expect(box!.height).toBeLessThanOrEqual(420);
  await assertInputSize(dialog);
  await closeForm(dialog);
});

test.describe("entrada sem sessão", () => {
  test.use({ storageState: SIGNED_OUT });

  test("entrada e cadastro têm campos legíveis sem cortar ações", async ({ page }) => {
    await page.goto("/entrar");
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await assertInputSize(page.locator("body"));
    await assertPageWidth(page);
    await page.getByRole("button", { name: "Criar conta", exact: true }).click();
    await expect(page.getByLabel("Nome")).toBeVisible();
    await assertInputSize(page.locator("body"));
    await assertPageWidth(page);
  });
});
