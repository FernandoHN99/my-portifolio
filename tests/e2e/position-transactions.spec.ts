import { expect, test, type Locator, type Page } from "@playwright/test";

import { closeForm, expectFormStep, openAddForm, openEditableMonth, positionRow } from "./support/position-form";
import { stubQuoteChecks } from "./support/quote-checks";

// Spec 066: escolhas obrigatórias, cálculo flexível e conferência antes da
// gravação. Os cenários preenchem e cancelam; nunca registram movimentações.
test.beforeEach(async ({ page }) => { await stubQuoteChecks(page); });

async function openMovement(page: Page, asset: string) {
  const row = positionRow(page, asset);
  await row.hover();
  await row.getByRole("button", { name: `Movimentar ${asset}` }).click();
  const dialog = page.getByRole("dialog", { name: `Movimentar ${asset}` });
  await expect(dialog).toBeVisible();
  await expectFormStep(dialog, "Movimento");
  return dialog;
}

// As escolhas usam a lista do projeto (Picker), como os demais formulários (spec 069).
const KIND_OPTIONS = { CONTRIBUTION: /^Aporte/, WITHDRAWAL: /^Retirada/, INCOME: /^Rendimento/ } as const;
const MODE_OPTIONS = { operation: "Pelo valor desta operação", total: "Pelo novo total da posição" } as const;

async function choose(dialog: Locator, field: string, option: string | RegExp) {
  await dialog.getByRole("combobox", { name: field }).click();
  await dialog.page().getByRole("option", { name: option }).click();
}

async function chooseMovement(dialog: Locator, kind: keyof typeof KIND_OPTIONS, mode: keyof typeof MODE_OPTIONS) {
  await choose(dialog, "Tipo de movimentação", KIND_OPTIONS[kind]);
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await expectFormStep(dialog, "Valores");
  await choose(dialog, "Como informar", MODE_OPTIONS[mode]);
}

test("movimentar exige escolher o tipo e a forma de informar antes de mostrar os valores", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "Nenhum mês aberto para editar.");
  const dialog = await openMovement(page, "ETF - VOO");
  await expect(dialog.getByRole("button", { name: "Continuar", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("combobox", { name: "Como informar" })).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "Quantidade movimentada" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /Registrar/ })).toHaveCount(0);
  await expect(dialog.getByRole("tab")).toHaveCount(0);
  await choose(dialog, "Tipo de movimentação", KIND_OPTIONS.CONTRIBUTION);
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await expectFormStep(dialog, "Valores");
  await expect(dialog.getByRole("textbox", { name: "Quantidade movimentada" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Conferir movimento" })).toBeDisabled();
  await choose(dialog, "Como informar", MODE_OPTIONS.operation);
  await expect(dialog.getByRole("textbox", { name: "Quantidade movimentada" })).toBeVisible();
  await expect(dialog.getByTestId("transaction-preview")).toHaveCount(0);
  await closeForm(dialog);
});

test("dois entre quantidade, preço e valor calculam o terceiro; conflito bloqueia a conferência", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "Nenhum mês aberto para editar.");
  const dialog = await openMovement(page, "ETF - VOO");
  await chooseMovement(dialog, "CONTRIBUTION", "operation");
  const quantity = dialog.getByRole("textbox", { name: "Quantidade movimentada" });
  const price = dialog.getByRole("textbox", { name: "Preço executado" });
  const amount = dialog.getByRole("textbox", { name: "Valor da operação" });
  await quantity.fill("2");
  await expect(dialog.getByText("cotação do mês", { exact: true })).toBeVisible();
  await expect(amount).not.toHaveValue("");
  await price.fill("25");
  await expect(amount).toHaveValue("50");
  await quantity.fill("");
  await amount.fill("60");
  await expect(quantity).toHaveValue("2,4");
  if (test.info().project.name === "mobile-safari") {
    await page.screenshot({ path: "artifacts/dialog-e2e/movement-values-iphone.png" });
  }
  await quantity.fill("3");
  await expect(dialog.getByTestId("transaction-issue")).toContainText("diferente do valor digitado");
  await expect(dialog.getByRole("button", { name: "Conferir movimento" })).toBeDisabled();
  await quantity.fill("");
  await dialog.getByRole("button", { name: "Conferir movimento" }).click();
  await expectFormStep(dialog, "Conferir");
  await expect(dialog.getByTestId("transaction-preview")).toContainText("+R$ 60,00");
  await expect(dialog.getByRole("button", { name: "Registrar aporte" })).toBeEnabled();
  await expect(dialog.getByRole("textbox", { name: "Dia da movimentação", exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Quantidade movimentada" })).toHaveCount(0);
  if (test.info().project.name === "mobile-safari") {
    await page.screenshot({ path: "artifacts/dialog-e2e/movement-review-iphone.png" });
  }
  await closeForm(dialog);
});

test("novo total abaixo do atual calcula retirada e a prévia separa dinheiro e valor de mercado", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "Nenhum mês aberto para editar.");
  const dialog = await openMovement(page, "ETF - VOO");
  await chooseMovement(dialog, "CONTRIBUTION", "total");
  await dialog.getByRole("textbox", { name: "Novo total da posição" }).fill("0,5");
  await expect(dialog.getByText(/será registrado como retirada/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Conferir movimento" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Conferir movimento" }).click();
  await expect(dialog.getByTestId("transaction-preview")).toContainText("0,5 un.");
  await expect(dialog.getByRole("button", { name: "Registrar retirada" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Voltar" }).click();
  await choose(dialog, "Novo total em", "Valor de mercado (R$)");
  await expect(dialog.getByText("Novo valor de mercado (R$)")).toBeVisible();
  await closeForm(dialog);
});

test("saldo manual aceita rendimento e novo saldo calcula retirada", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "Nenhum mês aberto para editar.");
  const row = page.getByTestId("position-row").filter({ hasText: "SALDO" }).first();
  test.skip((await row.count()) === 0, "Sem saldo em reais no mês aberto.");
  const asset = (await row.getByRole("link").first().textContent())?.trim() ?? "";
  const dialog = await openMovement(page, asset);
  await chooseMovement(dialog, "CONTRIBUTION", "total");
  await expect(dialog.getByRole("textbox", { name: "Quantidade movimentada" })).toHaveCount(0);
  await dialog.getByRole("textbox", { name: "Novo total da posição" }).fill("1");
  await dialog.getByRole("button", { name: "Conferir movimento" }).click();
  await expect(dialog.getByTestId("transaction-preview")).toContainText("R$ 1,00");
  await expect(dialog.getByRole("button", { name: "Registrar retirada" })).toBeEnabled();
  await closeForm(dialog);
  const income = await openMovement(page, asset);
  await chooseMovement(income, "INCOME", "operation");
  await income.getByRole("textbox", { name: "Valor da operação" }).fill("10");
  await income.getByRole("button", { name: "Conferir movimento" }).click();
  await expect(income.getByTestId("transaction-preview")).toContainText("+R$ 10,00");
  await expect(income.getByRole("button", { name: "Registrar rendimento" })).toBeEnabled();
  await closeForm(income);
});

test("dividendos em ativo cotado registram rendimento sem inventar unidades", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "Nenhum mês aberto para editar.");
  const dialog = await openMovement(page, "ETF - VOO");
  await chooseMovement(dialog, "INCOME", "operation");
  await dialog.getByRole("textbox", { name: "Valor da operação" }).fill("10");
  await dialog.getByRole("button", { name: "Conferir movimento" }).click();
  await expect(dialog.getByTestId("transaction-preview")).toContainText("sem unidades");
  await expect(dialog.getByRole("button", { name: "Registrar rendimento" })).toBeEnabled();
  await closeForm(dialog);
});

test("inclusão não pede escolher entre saldo inicial e aporte", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "Nenhum mês aberto para editar.");
  const dialog = await openAddForm(page);
  await expect(dialog.getByRole("radiogroup", { name: "Como o valor entra" })).toHaveCount(0);
  await expect(dialog.getByText("Saldo que já tinha", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("Aporte agora", { exact: true })).toHaveCount(0);
  await closeForm(dialog);
});

test("a página da posição abre o mesmo fluxo guiado de movimentação", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "Nenhum mês aberto para editar.");
  await positionRow(page, "ETF - VOO").getByRole("link", { name: "ETF - VOO" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "ETF - VOO" })).toBeVisible();
  // Recolhida desde a spec 075: o cartão aparece, e o conteúdo abre no clique.
  await expect(page.getByTestId("position-transactions-section")).toBeVisible();
  await page.getByRole("button", { name: "Movimentar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Movimentar ETF - VOO" });
  await expectFormStep(dialog, "Movimento");
  await closeForm(dialog);
});
