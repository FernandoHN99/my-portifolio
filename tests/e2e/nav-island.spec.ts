import { expect, test } from "@playwright/test";

import { positionRow } from "./support/position-form";
import { stubQuoteChecks } from "./support/quote-checks";

// Ilha do topo (spec 046): mostra onde o usuário está dentro de uma aba, numa
// posição ou nas cotações, e na configuração. Só leitura.
test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

test("a ilha do topo acompanha a posição, as cotações e a configuração", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  const island = nav.getByTestId("nav-island");

  await page.goto("/posicoes?mes=2026-09");
  await expect(page.getByRole("navigation", { name: "Competências" })).toHaveAttribute("data-hydrated");
  await expect(island).toHaveCount(0);

  await positionRow(page, "Porquinho").getByRole("link", { name: "Porquinho" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Porquinho" })).toBeVisible();
  await expect(island).toHaveAttribute("data-kind", "position");
  await expect(island).toContainText("Você está em Porquinho");
  await expect(nav.getByRole("link", { name: "Posições" })).toHaveAttribute("aria-current", "page");

  await page.goto("/posicoes/cotacoes?mes=2026-09");
  await expect(island).toHaveAttribute("data-kind", "quotes");
  await expect(island).toContainText("Cotações · Set/26");

  await page.goto("/configuracao?mes=2026-09");
  await expect(island).toHaveAttribute("data-kind", "settings");
  await expect(island).toContainText("Configuração");
  await expect(nav.locator("[aria-current='page']")).toHaveCount(0);
});

test("a ilha não corta as abas em telas estreitas", async ({ page }) => {
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 760 });
    await page.goto("/posicoes/cotacoes?mes=2026-09");
    const nav = page.getByRole("navigation", { name: "Navegação principal" });
    // Abaixo de 360 px a ilha sai, como a marca, para caberem as abas.
    if (width < 360) {
      await expect(nav.getByTestId("nav-island")).toBeHidden();
    } else {
      await expect(nav.getByTestId("nav-island")).toBeVisible();
    }
    await expect(nav.getByRole("link", { name: "Posições" })).toBeVisible();
    const scroller = await nav.evaluate((element) => {
      const parent = element.parentElement as HTMLElement;
      return { clientWidth: parent.clientWidth, scrollWidth: parent.scrollWidth };
    });
    expect(scroller.scrollWidth).toBeLessThanOrEqual(scroller.clientWidth);
  }
});
