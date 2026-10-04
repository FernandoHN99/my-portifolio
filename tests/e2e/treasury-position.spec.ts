import { expect, test } from "@playwright/test";

import { chooseKind, closeForm, continueForm, openAddForm, openEditableMonth, pick } from "./support/position-form";
import { stubQuoteChecks } from "./support/quote-checks";

// Spec 061/066: título e vencimento oficiais, preço consultado e conferência
// final. Fontes simuladas e formulário cancelado, sem salvar carteira.
test.beforeEach(async ({ page }) => { await stubQuoteChecks(page); });

test("o catálogo oficial preenche nome e vencimento e calcula quantidade pelo PU conferido", async ({ page }) => {
  const bonds = [
    { symbol: "TD:TESOURO-IPCA:2032-08-15", providerId: "Tesouro IPCA+|2032-08-15", name: "Tesouro IPCA+ 2032", type: "Tesouro IPCA+", maturityDate: "2032-08-15", quoteDate: "2026-10-02", valueBrl: 2912.33 },
    { symbol: "TD:TESOURO-IPCA:2035-05-15", providerId: "Tesouro IPCA+|2035-05-15", name: "Tesouro IPCA+ 2035", type: "Tesouro IPCA+", maturityDate: "2035-05-15", quoteDate: "2026-10-02", valueBrl: 2311.05 },
  ];
  await page.route("**/api/quotes/treasury-catalog", (route) => route.fulfill({ json: { bonds, valuation: "market" } }));
  const checked: string[] = [];
  await page.route("**/api/quotes/ticker-check", async (route) => {
    const { ticker } = route.request().postDataJSON();
    checked.push(ticker);
    await route.fulfill({ json: { status: "found", symbol: ticker, provider: "tesouro", priceBrl: 2912.33, name: "Tesouro IPCA+ 2032", quoteDate: "2026-10-02", token: "treasury-test-token", coinId: "Tesouro IPCA+|2032-08-15" } });
  });
  test.skip(!(await openEditableMonth(page)), "Nenhum mês aberto para editar.");
  const dialog = await openAddForm(page);
  await chooseKind(page, dialog, /Tesouro Direto/);
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "inter", /^Inter$/);
  await continueForm(dialog, "Ativo");
  await expect(dialog.getByRole("textbox", { name: "Ticker" })).toHaveCount(0);
  await dialog.getByRole("combobox", { name: "Título do Tesouro" }).click();
  await page.getByRole("option", { name: /Tesouro IPCA\+ 2032/ }).click();
  await expect(dialog.getByText("Preço de mercado de 02/10/2026")).toBeVisible();
  await expect(dialog.getByText("Vencimento do título")).toBeVisible();
  await expect(dialog.getByText("15/08/2032")).toBeVisible();
  await expect.poll(() => checked.at(-1)).toBe("TD:TESOURO-IPCA:2032-08-15");
  await expect(dialog.getByRole("textbox", { name: "Nome do ativo" })).toHaveValue("Tesouro IPCA+ 2032");
  await dialog.getByRole("textbox", { name: "Quantidade de títulos" }).fill("2");
  // Fora do mês corrente, o preço do título é obrigatório; no corrente, vale o oficial.
  if (await dialog.getByText("Informe o preço do título").count()) await dialog.getByRole("textbox", { name: "Preço do título" }).fill("2912,33");
  await expect(dialog.getByTestId("position-form-total")).toContainText("R$ 5.824,66");
  await continueForm(dialog, "Rateio");
  // A subclasse é a da planilha, pelo indexador do título (spec 068).
  await expect(dialog.getByRole("combobox", { name: "Subclasse da classificação 1", exact: true })).toHaveValue("IPCA");
  await dialog.getByRole("combobox", { name: "Resgate da classificação 1", exact: true }).click();
  await page.getByRole("option", { name: "Longo", exact: true }).click();
  await continueForm(dialog, "Conferir");
  await expect(dialog).toContainText("Tesouro IPCA+ 2032");
  await expect(dialog).toContainText("R$ 5.824,66");
  await expect(dialog).toContainText("15/08/2032");
  await closeForm(dialog);
});

test("o Tesouro aceita o valor da posição em reais e um preço próprio no lugar do oficial", async ({ page }) => {
  const bond = { symbol: "TD:TESOURO-SELIC:2031-03-01", providerId: "Tesouro Selic|2031-03-01", name: "Tesouro Selic · 01/03/2031", type: "Tesouro Selic", maturityDate: "2031-03-01", quoteDate: "2026-10-02", valueBrl: 20000 };
  await page.route("**/api/quotes/treasury-catalog", (route) => route.fulfill({ json: { bonds: [bond], valuation: "market" } }));
  await page.route("**/api/quotes/ticker-check", (route) => route.fulfill({ json: { status: "found", symbol: bond.symbol, provider: "tesouro", priceBrl: 20000, name: bond.name, quoteDate: "2026-10-02", token: "treasury-test-token", coinId: bond.providerId } }));
  test.skip(!(await openEditableMonth(page)), "Nenhum mês aberto para editar.");
  const dialog = await openAddForm(page);
  await chooseKind(page, dialog, /Tesouro Direto/);
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "inter", /^Inter$/);
  await continueForm(dialog, "Ativo");
  await dialog.getByRole("combobox", { name: "Título do Tesouro" }).click();
  await page.getByRole("option", { name: /Tesouro Selic/ }).click();
  const price = dialog.getByRole("textbox", { name: "Preço do título" });
  // O campo do preço surge quando a conferência do título termina; esperar por
  // ele evita abrir a lista seguinte enquanto o formulário ainda se desloca.
  await expect(price).toBeVisible();
  await dialog.getByRole("combobox", { name: "Informar a posição por" }).click();
  await page.getByRole("option", { name: /Valor da posição/ }).click();
  await dialog.getByRole("textbox", { name: "Valor da posição (R$)" }).fill("10000");
  if (await dialog.getByTestId("treasury-price-hint").count()) {
    // No mês corrente, o oficial vem sugerido e pode ser trocado pelo seu.
    await expect(dialog.getByTestId("treasury-price-hint")).toContainText("Preço oficial: R$ 20.000,00");
    await expect(dialog.getByTestId("position-form-total")).toContainText("0,50 títulos");
    await price.fill("25000");
    await expect(dialog.getByTestId("treasury-price-hint")).toContainText("Vale o seu preço");
  } else {
    await price.fill("25000");
  }
  await expect(dialog.getByTestId("position-form-total")).toContainText("0,40 títulos");
  await continueForm(dialog, "Rateio");
  await expect(dialog.getByRole("combobox", { name: "Subclasse da classificação 1", exact: true })).toHaveValue("Pós-fixado");
  await dialog.getByRole("combobox", { name: "Resgate da classificação 1", exact: true }).click();
  await page.getByRole("option", { name: "Curto", exact: true }).click();
  await continueForm(dialog, "Conferir");
  await expect(dialog).toContainText("Preço informado");
  await expect(dialog).toContainText("R$ 10.000,00");
  await closeForm(dialog);
});
