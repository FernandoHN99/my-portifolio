import { expect, test } from "@playwright/test";

import { positionRow } from "./support/position-form";
import { stubQuoteChecks } from "./support/quote-checks";

// Spec 073, no lugar da ilha da spec 046, e spec 077: dentro de Posições, a
// posição ou as cotações abertas aparecem numa trilha abaixo das abas, nas
// cores do projeto;
// a Configuração vira uma aba selecionada, e a engrenagem do canto some. Só
// leitura.
test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

test("a trilha abaixo das abas mostra a posição e as cotações; a configuração vira aba", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  const trail = page.getByTestId("nav-trail");
  const gear = page.getByRole("link", { name: "Configuração da carteira" });

  await page.goto("/posicoes?mes=2026-09");
  await expect(page.getByRole("navigation", { name: "Competências" })).toHaveAttribute("data-hydrated");
  await expect(trail).toHaveCount(0);
  await expect(page.getByTestId("nav-island")).toHaveCount(0);

  await positionRow(page, "Porquinho").getByRole("link", { name: "Porquinho" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Porquinho" })).toBeVisible();
  await expect(trail).toHaveAttribute("data-kind", "position");
  await expect(trail).toContainText("Você está em Porquinho");
  // Sem repetir "Posições" (spec 077) e sem as setas, que saíram (spec 078); a
  // faixa de competências mostra só os meses da posição.
  await expect(trail).not.toContainText("Posições");
  await expect(page.getByTestId("nav-trail-connectors")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Competências" })).toHaveAttribute("data-scoped", "true");
  await expect(nav.getByRole("link", { name: "Posições" })).toHaveAttribute("aria-current", "page");
  // A trilha fica fora das abas, abaixo delas.
  const navBox = await nav.boundingBox();
  const trailBox = await trail.boundingBox();
  expect(trailBox!.y).toBeGreaterThan(navBox!.y + navBox!.height - 1);

  await page.goto("/posicoes/cotacoes?mes=2026-09");
  await expect(trail).toHaveAttribute("data-kind", "quotes");
  await expect(trail).toContainText("Cotações · Set/26");
  // Nas cotações, a faixa é a de sempre.
  await expect(page.getByRole("navigation", { name: "Competências" })).not.toHaveAttribute("data-scoped", "true");
  await expect(gear).toBeVisible();

  await page.goto("/configuracao?mes=2026-09");
  await expect(trail).toHaveCount(0);
  const settings = nav.getByTestId("settings-tab");
  await expect(settings).toHaveAttribute("aria-current", "page");
  await expect(settings).toContainText("Configuração");
  await expect(gear).toHaveCount(0);
  await expect(nav.locator("[aria-current='page']")).toHaveCount(1);
});

test("as abas e a trilha cabem em telas estreitas", async ({ page }) => {
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 760 });
    for (const path of ["/posicoes/cotacoes?mes=2026-09", "/configuracao?mes=2026-09"]) {
      await page.goto(path);
      const nav = page.getByRole("navigation", { name: "Navegação principal" });
      await expect(nav.getByRole("link", { name: "Posições" })).toBeVisible();
      const scroller = await nav.evaluate((element) => {
        const parent = element.parentElement as HTMLElement;
        return { clientWidth: parent.clientWidth, scrollWidth: parent.scrollWidth };
      });
      expect(scroller.scrollWidth).toBeLessThanOrEqual(scroller.clientWidth);
      // O topo inteiro cabe na tela, com a trilha e sem a engrenagem na Configuração.
      const header = await page.locator("header").first().evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(header).toBeLessThanOrEqual(0);
    }
  }
});
