import { expect, test } from "@playwright/test";

import { enterEditMode } from "./support/edit-mode";
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
  await page.goto("/posicoes");
  await enterEditMode(page);
  await page.getByRole("button", { name: "Adicionar posição" }).click();
  const dialog = page.getByRole("dialog", { name: "Adicionar posição" });

  // O tipo vem primeiro (spec 040); a conta não aparece mais.
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
  await page.getByRole("button", { name: "Sair da edição" }).click();
});

test("a estratégia da tabela abre a lista e mantém as setas entre linhas", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("mobile"), "A estratégia só aparece a partir de telas pequenas.");

  await page.goto("/posicoes");
  await enterEditMode(page);
  const rows = page.locator('[data-edit-cell="strategy"]');

  // O Bitcoin 01 pode estar em mais de uma conta; o cenário usa o da Ledger.
  const first = page
    .getByTestId("position-row")
    .filter({ hasText: "Ledger" })
    .getByRole("combobox", { name: "Estratégia de Bitcoin 01" });
  await first.click();
  await expect(page.getByRole("option")).toHaveCount(5);
  await expect(page.getByRole("option", { name: "Core-Satellite" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(first).toHaveAttribute("aria-expanded", "false");

  // Escape com a lista fechada e apagar o texto não trocam nem escondem a estratégia.
  await page.keyboard.press("Escape");
  await expect(first).toHaveValue("Core-Satellite");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await expect(first).toHaveValue("");
  await expect(first).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(first).toHaveValue("Core-Satellite");
  await expect(page.getByText(/alteraç(ão|ões) pendente/)).toHaveCount(0);

  await rows.nth(0).focus();
  await page.keyboard.press("ArrowDown");
  await expect(rows.nth(1)).toBeFocused();
  await expect(rows.nth(1)).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowUp");
  await expect(rows.nth(0)).toBeFocused();

  await page.keyboard.press("Alt+ArrowDown");
  await expect(rows.nth(0)).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.type("hed");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(rows.nth(0)).toHaveValue("Hedge");
  await expect(page.getByText("1 alteração pendente")).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(rows.nth(1)).toBeFocused();

  await page.getByRole("button", { name: "Descartar" }).click();
  await expect(page.locator("[data-edit-cell]")).toHaveCount(0);
});

test("o rateio aceita só classes existentes, subclasse nova e resgate fixo", async ({ page }) => {
  await page.goto("/posicoes");
  await enterEditMode(page);
  await page.getByTestId("position-row").filter({ hasText: "Ledger" }).getByRole("button", { name: "Rateio de Bitcoin 01" }).click();
  const drawer = page.getByRole("dialog");

  const assetClass = drawer.getByRole("combobox", { name: "Classe da classificação 1", exact: true });
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
  await expect(drawer).toBeVisible();
  await expect(assetClass).toHaveValue("Cripto");

  // A subclasse continua aceitando um valor novo.
  const subclass = drawer.getByRole("combobox", { name: "Subclasse da classificação 1", exact: true });
  await subclass.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Subclasse nova");
  await page.getByRole("option", { name: "Usar “Subclasse nova”" }).click();
  await expect(subclass).toHaveValue("Subclasse nova");

  // O resgate é fixo: Curto, Médio, Longo ou Nenhum.
  const redemption = drawer.getByRole("combobox", { name: "Resgate da classificação 1", exact: true });
  await expect(redemption).toHaveValue("Nenhum");
  await redemption.click();
  await expect(page.getByRole("option")).toHaveText(["Curto", "Médio", "Longo", "Nenhum"]);
  await page.keyboard.press("Escape");

  // Com a lista fechada, Escape fecha o painel sem salvar.
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await page.getByRole("button", { name: "Sair da edição" }).click();
});
