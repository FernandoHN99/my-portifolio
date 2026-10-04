import { expect, test, type Page } from "@playwright/test";

import { openAddForm, openEditableMonth, positionRow } from "./support/position-form";
import { stubQuoteChecks } from "./support/quote-checks";

// Movimentações das posições (specs 056 e 057): o ícone ao lado do lápis abre o
// formulário único de aporte, retirada e rendimento. Os testes rodam sobre os
// dados reais e nunca salvam: preenchem, conferem os cálculos e cancelam.

test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

async function openMovement(page: Page, asset: string) {
  const row = positionRow(page, asset);
  await row.hover();
  await row.getByRole("button", { name: `Movimentar ${asset}` }).click();
  const dialog = page.getByRole("dialog", { name: `Movimentar ${asset}` });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("num ativo cotado, dois entre quantidade, preço executado e valor calculam o terceiro", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "Nenhum mês aberto para editar.");
  const dialog = await openMovement(page, "ETF - VOO");
  const quantity = dialog.getByRole("textbox", { name: "Quantidade movimentada" });
  const price = dialog.getByRole("textbox", { name: "Preço executado" });
  const amount = dialog.getByRole("textbox", { name: "Valor da operação" });

  // Só a quantidade: o preço vem sugerido pela cotação do mês e o valor é calculado.
  await quantity.fill("2");
  await expect(dialog.getByText("cotação do mês", { exact: true })).toBeVisible();
  await expect(amount).not.toHaveValue("");

  // Quantidade e preço executado: o valor sai deles (2 × 25 = 50).
  await price.fill("25");
  await expect(amount).toHaveValue("50");
  await expect(dialog.getByTestId("transaction-preview")).toContainText("+R$ 50,00");

  // Valor e preço executado calculam a quantidade (60 / 25 = 2,4).
  await quantity.fill("");
  await amount.fill("60");
  await expect(quantity).toHaveValue("2,4");

  // Os três digitados sem fechar mostram a divergência e impedem salvar.
  await quantity.fill("3");
  await expect(dialog.getByTestId("transaction-issue")).toContainText("diferente do valor digitado");
  await expect(dialog.getByRole("button", { name: "Registrar aporte" })).toBeDisabled();

  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toHaveCount(0);
});

test("o novo total da posição vira a diferença, e menor que o atual é retirada", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "Nenhum mês aberto para editar.");
  const dialog = await openMovement(page, "ETF - VOO");

  await dialog.getByRole("radio", { name: "Novo total da posição" }).click();
  await dialog.getByRole("textbox", { name: "Novo total da posição" }).fill("0,5");
  await expect(dialog.getByRole("radio", { name: "Retirada" })).toHaveAttribute("aria-checked", "true");
  await expect(dialog.getByTestId("transaction-preview")).toContainText("0,5 un.");
  await expect(dialog.getByRole("button", { name: "Registrar retirada" })).toBeEnabled();

  // Pelo valor de mercado: a cotação do mês converte em quantidade.
  await dialog.getByRole("radio", { name: "Valor de mercado (R$)" }).click();
  await expect(dialog.getByText("Novo valor de mercado (R$)")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
});

test("num saldo em reais, o novo saldo vira aporte, retirada ou rendimento", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "Nenhum mês aberto para editar.");
  const row = page.getByTestId("position-row").filter({ hasText: "SALDO" }).first();
  test.skip((await row.count()) === 0, "Sem saldo em reais no mês aberto.");
  const asset = (await row.getByRole("link").first().textContent())?.trim() ?? "";
  const dialog = await openMovement(page, asset);

  await expect(dialog.getByRole("textbox", { name: "Quantidade movimentada" })).toHaveCount(0);
  await dialog.getByRole("radio", { name: "Novo total da posição" }).click();
  await dialog.getByRole("textbox", { name: "Novo total da posição" }).fill("1");
  await expect(dialog.getByRole("radio", { name: "Retirada" })).toHaveAttribute("aria-checked", "true");
  await expect(dialog.getByTestId("transaction-preview")).toContainText("R$ 1,00");

  await dialog.getByRole("radio", { name: "Valor desta operação" }).click();
  await dialog.getByRole("radio", { name: "Rendimento" }).click();
  await dialog.getByRole("textbox", { name: "Valor da operação" }).fill("10");
  await expect(dialog.getByRole("button", { name: "Registrar rendimento" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
});

test("a inclusão escolhe entre saldo que já tinha e aporte", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "Nenhum mês aberto para editar.");
  const dialog = await openAddForm(page);
  const group = dialog.getByRole("radiogroup", { name: "Como o valor entra" });
  await expect(group.getByRole("radio", { name: "Saldo que já tinha" })).toHaveAttribute("aria-checked", "true");
  await expect(dialog.getByText("não conta como aporte nem como custo de compra")).toBeVisible();
  await group.getByRole("radio", { name: "Aporte agora" }).click();
  await expect(dialog.getByText("Fica registrado como aporte de dinheiro novo.")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
});

test("a página da posição mostra as movimentações e o botão Movimentar", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "Nenhum mês aberto para editar.");
  await positionRow(page, "ETF - VOO").getByRole("link", { name: "ETF - VOO" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "ETF - VOO" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Movimentações" })).toBeVisible();
  await page.getByRole("button", { name: "Movimentar" }).click();
  await expect(page.getByRole("dialog", { name: "Movimentar ETF - VOO" })).toBeVisible();
});
