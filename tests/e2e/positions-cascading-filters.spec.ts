import { expect, test } from "@playwright/test";

import { chooseFilter, filterOptions as optionsOf } from "./support/position-filters";
import { stubQuoteChecks } from "./support/quote-checks";

// Filtros em cascata e vencimento em Posições (spec 031). Só leitura: a
// checagem de abertura é substituída por uma resposta fixa.
test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

test("a classe escolhida primeiro limita as subclasses", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-09&classe=Caixa");
  await expect(page.getByRole("heading", { level: 1, name: "Carteira do mês" })).toBeVisible();

  // A subclasse "Curto" do caixa virou Pós-fixado no histórico preparado (spec 041).
  expect(await optionsOf(page, "Subclasse")).toEqual(["Pós-fixado", "Stablecoin"]);
  // A classe é o primeiro filtro: as próprias opções não encolhem.
  expect(await optionsOf(page, "Classe")).toEqual(
    expect.arrayContaining(["Caixa", "Cripto", "Renda Fixa", "Renda Variável"]),
  );
});

test("os filtros limitam da esquerda para a direita, não pela ordem de aplicação", async ({ page }) => {
  // Mesmo com a subclasse aplicada antes, a classe fica à esquerda: ela não
  // encolhe, e a subclasse só oferece as de Caixa (spec 044).
  await page.goto("/posicoes?mes=2026-09&subclasse=P%C3%B3s-fixado&classe=Caixa");
  await expect(page.getByRole("heading", { level: 1, name: "Carteira do mês" })).toBeVisible();

  expect(await optionsOf(page, "Classe")).toEqual(
    expect.arrayContaining(["Caixa", "Cripto", "Renda Fixa", "Renda Variável"]),
  );
  expect(await optionsOf(page, "Subclasse")).toEqual(["Pós-fixado", "Stablecoin"]);
});

test("o vencimento tem coluna e filtro", async ({ page }, testInfo) => {
  await page.goto("/posicoes?mes=2026-09");
  await expect(page.getByRole("heading", { level: 1, name: "Carteira do mês" })).toBeVisible();

  expect(await optionsOf(page, "Vencimento")).toContain("Sem vencimento");

  if (!testInfo.project.name.startsWith("mobile")) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByRole("columnheader", { name: "Vencimento" })).toBeVisible();
  }

  await page.goto("/posicoes?mes=2026-09&venc=Sem%20vencimento");
  await expect(page.getByTestId("position-row").first()).toBeVisible();
});

test("pela tela, a instituição só oferece as que têm a classe escolhida", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-09");
  await expect(page.getByRole("heading", { level: 1, name: "Carteira do mês" })).toBeVisible();

  await chooseFilter(page, "Instituição", "Inter", /inst=Inter/);

  // A classe fica à esquerda da instituição: escolher Inter não a encolhe.
  expect(await optionsOf(page, "Classe")).toContain("Cripto");

  // Com Caixa, a instituição só oferece as que têm caixa: a Ledger, só com
  // Bitcoin, sai da lista.
  await page.getByRole("button", { name: "Caixa", exact: true }).click();
  await expect(page).toHaveURL(/classe=Caixa/);
  const institutions = await optionsOf(page, "Instituição");
  expect(institutions).toContain("Inter");
  expect(institutions).not.toContain("Ledger");
});

test("no celular, busca e filtros dividem a linha e os filtros abrem numa folha", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Folha de filtros do celular (spec 077).");
  await page.goto("/posicoes?mes=2026-09");
  const search = page.getByRole("searchbox", { name: "Buscar posição" });
  const filters = page.getByRole("button", { name: /^Filtros/ });
  await expect(search).toBeVisible();
  await expect(filters).toBeVisible();
  await expect(page.getByRole("combobox", { name: /^Subclasse/ })).toBeHidden();
  // As duas caixas lidas de uma vez: a página ainda pode deslizar na entrada.
  const [searchBox, filtersBox] = await page.evaluate(() => {
    const box = (element: Element | null) => {
      const rect = element!.getBoundingClientRect();
      return { center: rect.top + rect.height / 2, width: rect.width };
    };
    const button = [...document.querySelectorAll("button")].find((entry) => entry.textContent?.trim().startsWith("Filtros"));
    return [box(document.querySelector('input[type="search"]')), box(button ?? null)];
  });
  expect(Math.abs(searchBox.center - filtersBox.center)).toBeLessThan(2);
  expect(searchBox.width).toBeGreaterThan(200);

  await filters.click();
  const sheet = page.getByTestId("positions-filter-sheet");
  await sheet.getByRole("group", { name: /^Moeda/ }).getByRole("button", { name: "USD", exact: true }).click();
  await expect(page).toHaveURL(/moeda=USD/);
  await sheet.getByRole("group", { name: /^Agrupar/ }).getByRole("button", { name: "Instituição", exact: true }).click();
  await expect(page).toHaveURL(/agrupar=instituicao/);
  await sheet.getByRole("button", { name: /^Ver \d+ posiç/ }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Filtros, 1 ativo" })).toBeVisible();
});

test("em tela de toque os campos usam 16 px para o Safari não ampliar", async ({ page }, testInfo) => {
  await page.goto("/posicoes?mes=2026-09");
  const search = page.getByRole("searchbox");
  await expect(search).toBeVisible();
  const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  expect(coarse).toBe(testInfo.project.name.startsWith("mobile"));
  const size = await search.evaluate((element) => getComputedStyle(element).fontSize);
  expect(size).toBe(coarse ? "16px" : "12px");
});

test("a liquidez fica no filtro, sem coluna", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/posicoes?mes=2026-09");
  await expect(page.getByRole("heading", { level: 1, name: "Carteira do mês" })).toBeVisible();
  expect(await optionsOf(page, "Liquidez")).toContain("Sem liquidez informada");
  // A coluna saiu para compactar a tabela (spec 044); o filtro continua.
  await expect(page.getByRole("columnheader", { name: "Liquidez" })).toHaveCount(0);
});
