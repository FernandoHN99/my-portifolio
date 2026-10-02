import { expect, test } from "@playwright/test";

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

  await page.getByRole("button", { name: "Limpar seleção" }).click();
  await expect(page).not.toHaveURL(/inst=/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(page.getByText("21 de 21 posições")).toBeVisible();
});

test("as listas da nova posição abrem ao clicar e filtram ao digitar", async ({ page }) => {
  await page.goto("/posicoes");
  await page.getByRole("button", { name: "Editar posições" }).click();
  await page.getByRole("button", { name: "Adicionar posição" }).click();
  const dialog = page.getByRole("dialog");

  const account = dialog.getByRole("combobox", { name: "Conta" });
  await account.click();
  await expect(account).toHaveAttribute("aria-expanded", "true");
  expect(await page.getByRole("option").count()).toBeGreaterThan(5);
  await page.keyboard.type("c6");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(account).toHaveValue("C6 · Principal");
  await expect(account).toHaveAttribute("aria-expanded", "false");

  const asset = dialog.getByRole("combobox", { name: "Ativo" });
  await asset.click();
  await page.keyboard.type("btc");
  await expect(page.getByRole("option", { name: /Bitcoin 01/ })).toBeVisible();
  await page.keyboard.type("zzz");
  await expect(page.getByText("Nenhum ativo encontrado")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(asset).toHaveAttribute("aria-expanded", "false");
  await expect(dialog).toBeVisible();

  const strategy = dialog.getByRole("combobox", { name: "Estratégia", exact: true });
  await expect(strategy).toHaveValue("Sem estratégia");
  await strategy.click();
  await expect(page.getByRole("option", { name: "Sem estratégia" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("option", { name: "Core", exact: true }).click();
  await expect(strategy).toHaveValue("Core");

  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Sair da edição" }).click();
});

test("a estratégia da tabela abre a lista e mantém as setas entre linhas", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("mobile"), "A estratégia só aparece a partir de telas pequenas.");

  await page.goto("/posicoes?mes=2026-09");
  await page.getByRole("button", { name: "Editar posições" }).click();
  const rows = page.locator('[data-edit-cell="strategy"]');

  const first = page.getByRole("combobox", { name: "Estratégia de Bitcoin 01" });
  await first.click();
  await expect(page.getByRole("option")).toHaveCount(5);
  await expect(page.getByRole("option", { name: "Core-Satellite" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");

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

test("o rateio mostra todas as opções e aceita um valor novo", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-09");
  await page.getByRole("button", { name: "Editar posições" }).click();
  await page.getByRole("button", { name: "Rateio de Bitcoin 01" }).click();
  const drawer = page.getByRole("dialog");

  const assetClass = drawer.getByRole("combobox", { name: "Classe da classificação 1", exact: true });
  await expect(assetClass).toHaveValue("Cripto");
  await assetClass.click();
  await expect(page.getByRole("option", { name: "Renda Fixa" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Cripto" })).toHaveAttribute("aria-selected", "true");

  await page.keyboard.type("Classe nova");
  await page.getByRole("option", { name: "Usar “Classe nova”" }).click();
  await expect(assetClass).toHaveValue("Classe nova");

  await drawer.getByRole("button", { name: "Cancelar" }).click();
  await expect(drawer).toHaveCount(0);
  await page.getByRole("button", { name: "Sair da edição" }).click();
});
