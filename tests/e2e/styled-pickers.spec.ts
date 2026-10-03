import { expect, test } from "@playwright/test";

import { formTab, openAddForm, openEditableMonth, openEditForm } from "./support/position-form";
import { stubQuoteChecks } from "./support/quote-checks";

// A checagem de abertura grava no banco e pode criar competências; os
// cenários usam a resposta fixa para não alterar os dados reais.
test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

test("os filtros abrem com busca e marcam as opções", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-09");
  await expect(page.getByText("21 de 21 posições")).toBeVisible();

  const filter = page.getByRole("combobox", { name: "Instituição", exact: true });
  await filter.click();
  await expect(page.getByRole("option").first()).toBeVisible();
  const total = await page.getByRole("option").count();
  expect(total).toBeGreaterThan(1);

  await page.getByRole("combobox", { name: "Buscar em Instituição" }).fill("inte");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.getByRole("option", { name: "Inter" }).click();
  await expect(page.getByRole("option", { name: "Inter" })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/inst=Inter/);
  await expect(page.getByRole("combobox", { name: /Instituição 1 selecionado/ })).toBeVisible();

  // Limpar fecha a lista e devolve o foco ao filtro, sem perdê-lo na página.
  await page.getByRole("button", { name: "Limpar seleção" }).click();
  await expect(page).not.toHaveURL(/inst=/);
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(filter).toBeFocused();
  await expect(page.getByText("21 de 21 posições")).toBeVisible();
});

test("as listas da nova posição abrem ao clicar e filtram ao digitar", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "O mês mais recente e o anterior estão fechados nos dados reais.");
  const dialog = await openAddForm(page);

  // O tipo vem primeiro (spec 040); a conta não aparece.
  const kind = dialog.getByRole("combobox", { name: "Tipo do ativo" });
  await kind.click();
  await page.getByRole("option", { name: /Renda fixa/ }).click();
  const institution = dialog.getByRole("combobox", { name: "Instituição" });
  await institution.click();
  await expect(institution).toHaveAttribute("aria-expanded", "true");
  expect(await page.getByRole("option").count()).toBeGreaterThan(5);
  await page.keyboard.type("c6");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(institution).toHaveValue("C6");
  await expect(institution).toHaveAttribute("aria-expanded", "false");

  // Apagar o texto abre a lista sem trocar o valor; sair do campo volta a mostrá-lo.
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await expect(institution).toHaveValue("");
  await expect(institution).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(dialog).toBeVisible();
  await expect(institution).toHaveValue("C6");

  // O nome do ativo é texto livre (spec 040).
  await expect(dialog.getByRole("combobox", { name: "Ativo", exact: true })).toHaveCount(0);
  await dialog.getByRole("textbox", { name: "Nome do ativo" }).fill("CDB Teste");

  const strategy = dialog.getByRole("combobox", { name: "Estratégia", exact: true });
  await expect(strategy).toHaveValue("Sem estratégia");
  await strategy.click();
  await expect(page.getByRole("option", { name: "Sem estratégia" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("option", { name: "Core", exact: true }).click();
  await expect(strategy).toHaveValue("Core");
  await expect(strategy).toBeFocused();

  // Com a lista fechada, Escape fecha o diálogo, como num select nativo.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("a estratégia da posição abre a lista e o Escape fecha só a lista", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "O mês mais recente e o anterior estão fechados nos dados reais.");
  // O Bitcoin 01 pode estar em mais de uma conta; o cenário usa o da Ledger.
  const dialog = await openEditForm(page, "Bitcoin 01", "Ledger");
  const strategy = dialog.getByRole("combobox", { name: "Estratégia", exact: true });

  await strategy.click();
  await expect(page.getByRole("option")).toHaveCount(5);
  await expect(page.getByRole("option", { name: "Core-Satellite" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(strategy).toHaveAttribute("aria-expanded", "false");
  await expect(dialog).toBeVisible();

  // Apagar o texto não troca a estratégia; o Escape devolve o valor.
  await strategy.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await expect(strategy).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(strategy).toHaveValue("Core-Satellite");

  await strategy.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("hed");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(strategy).toHaveValue("Hedge");

  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toHaveCount(0);
});

test("o rateio aceita só classes existentes, subclasse nova e resgate fixo", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "O mês mais recente e o anterior estão fechados nos dados reais.");
  const dialog = await openEditForm(page, "Bitcoin 01", "Ledger");
  await formTab(dialog, "Rateio").click();

  const assetClass = dialog.getByRole("combobox", { name: "Classe da classificação 1", exact: true });
  await expect(assetClass).toHaveValue("Cripto");
  await assetClass.click();
  await expect(page.getByRole("option", { name: "Renda Fixa" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Cripto" })).toHaveAttribute("aria-selected", "true");

  // A classe só aceita as cadastradas (spec 035): digitar outra não oferece "Usar".
  await page.keyboard.type("Classe nova");
  await expect(page.getByRole("option", { name: /Usar/ })).toHaveCount(0);
  await expect(page.getByText("Nenhuma classe com esse nome")).toBeVisible();
  // Sair do campo sem escolher volta ao valor anterior. O Tab abre a lista da
  // subclasse, e o Escape fecha só essa lista.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(assetClass).toHaveValue("Cripto");

  // A subclasse continua aceitando um valor novo.
  const subclass = dialog.getByRole("combobox", { name: "Subclasse da classificação 1", exact: true });
  await subclass.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Subclasse nova");
  await page.getByRole("option", { name: "Usar “Subclasse nova”" }).click();
  await expect(subclass).toHaveValue("Subclasse nova");

  // O resgate é fixo: Curto, Médio, Longo ou Nenhum.
  const redemption = dialog.getByRole("combobox", { name: "Resgate da classificação 1", exact: true });
  await expect(redemption).toHaveValue("Nenhum");
  await redemption.click();
  await expect(page.getByRole("option")).toHaveText(["Curto", "Médio", "Longo", "Nenhum"]);
  await page.keyboard.press("Escape");

  // Com a lista fechada, Escape fecha o formulário sem salvar.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
