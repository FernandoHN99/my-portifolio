import { expect, test, type Page } from "@playwright/test";

import { stubQuoteChecks } from "./support/quote-checks";

// Filtros em cascata e vencimento em Posições (spec 031). Só leitura: a
// checagem de abertura é substituída por uma resposta fixa.
test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

async function optionsOf(page: Page, label: string) {
  await page.getByRole("combobox", { name: new RegExp(`^${label}`) }).click();
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  const options = await list.getByRole("option").allTextContents();
  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
  return options.map((option) => option.trim());
}

test("a classe escolhida primeiro limita as subclasses", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-09&classe=Caixa");
  await expect(page.getByRole("heading", { level: 1, name: "Carteira do mês" })).toBeVisible();

  expect(await optionsOf(page, "Subclasse")).toEqual(["Curto", "Pós-fixado", "Stablecoin"]);
  // A classe é o primeiro filtro: as próprias opções não encolhem.
  expect(await optionsOf(page, "Classe")).toEqual(
    expect.arrayContaining(["Caixa", "Cripto", "Renda Fixa", "Renda Variável"]),
  );
});

test("a ordem de aplicação decide quem limita quem", async ({ page }) => {
  // Subclasse aplicada antes da classe: a classe só oferece as que têm Pós-fixado.
  await page.goto("/posicoes?mes=2026-09&subclasse=P%C3%B3s-fixado&classe=Caixa");
  await expect(page.getByRole("heading", { level: 1, name: "Carteira do mês" })).toBeVisible();

  expect(await optionsOf(page, "Classe")).toEqual(["Caixa", "Renda Fixa"]);
  expect(await optionsOf(page, "Subclasse")).toEqual(expect.arrayContaining(["BTC", "IPCA", "Pós-fixado"]));
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

test("pela tela, o filtro aplicado depois fica depois na URL", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-09");
  await expect(page.getByRole("heading", { level: 1, name: "Carteira do mês" })).toBeVisible();

  await page.getByRole("combobox", { name: /^Instituição/ }).click();
  await page.getByRole("option", { name: "Inter" }).click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/inst=Inter/);

  await page.getByRole("button", { name: "Caixa", exact: true }).click();
  await expect(page).toHaveURL(/inst=Inter&classe=Caixa/);

  // A classe veio depois da instituição: só as classes que existem no Inter.
  const classes = await optionsOf(page, "Classe");
  expect(classes).toContain("Caixa");
  expect(classes).not.toContain("Cripto");
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
