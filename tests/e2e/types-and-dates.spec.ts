import { expect, test } from "@playwright/test";

import { expectFormStep, openEditableMonth, positionRow, waitForHydration } from "./support/position-form";
import { chooseFilter, openFilterGroup, usesFilterSheet } from "./support/position-filters";
import { stubQuoteChecks } from "./support/quote-checks";

// Specs 068 e 069: tipo do ativo na tabela, no filtro, no agrupamento e na
// Visão geral; campo de data do design system. Nada é salvo.
test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

test("a Visão geral mostra a participação por tipo de ativo", async ({ page }) => {
  await page.goto("/?mes=2026-09");
  await waitForHydration(page);
  const panel = page.getByTestId("asset-type-breakdown");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Tipo de ativo" })).toBeVisible();
  await expect(panel).toContainText("ETF dos EUA");
  await expect(panel).toContainText(/\d+,\d%/);
});

test("Posições filtra e agrupa pelo tipo do ativo", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-09");
  await waitForHydration(page);
  await chooseFilter(page, "Tipo", "ETF dos EUA", /tipo=ETF/);
  const rows = page.getByTestId("position-row");
  await expect(rows.first()).toBeVisible();
  for (const text of await rows.allTextContents()) {
    expect(text).toContain("ETF dos EUA");
  }

  await page.goto("/posicoes?mes=2026-09&agrupar=tipo");
  await waitForHydration(page);
  // No celular, o agrupamento fica na folha de filtros (spec 077).
  const grouping = (await usesFilterSheet(page)) ? await openFilterGroup(page, "Agrupar") : page;
  await expect(grouping.getByRole("button", { name: "Tipo", exact: true, pressed: true })).toBeVisible();
});

test("o dia da movimentação usa o calendário do app e não aceita dia fora da competência", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "Nenhum mês aberto para editar.");
  const row = positionRow(page, "ETF - VOO");
  await row.hover();
  await row.getByRole("button", { name: "Movimentar ETF - VOO" }).click();
  const dialog = page.getByRole("dialog", { name: "Movimentar ETF - VOO" });
  await dialog.getByRole("combobox", { name: "Tipo de movimentação" }).click();
  await page.getByRole("option", { name: /^Aporte/ }).click();
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Como informar" }).click();
  await page.getByRole("option", { name: "Pelo valor desta operação" }).click();
  await dialog.getByRole("textbox", { name: "Quantidade movimentada" }).fill("1");
  await dialog.getByRole("button", { name: "Conferir movimento" }).click();
  await expectFormStep(dialog, "Conferir");

  const day = dialog.getByRole("textbox", { name: "Dia da movimentação", exact: true });
  await expect(day).toHaveValue(/^\d{2}\/\d{2}\/\d{4}$/);
  // Sem o seletor nativo: o campo é texto com máscara e um calendário próprio.
  await expect(dialog.locator('input[type="date"]')).toHaveCount(0);

  await dialog.getByRole("button", { name: "Abrir calendário: Dia da movimentação" }).click();
  const calendar = page.getByRole("dialog", { name: "Calendário: Dia da movimentação" });
  await expect(calendar).toBeVisible();
  await calendar.getByRole("button", { name: /, 1 de / }).first().click();
  await expect(calendar).toHaveCount(0);
  await expect(day).toHaveValue(/^01\/\d{2}\/\d{4}$/);

  // Digitar só os números põe as barras; um dia de outro ano fica inválido.
  await day.fill("");
  await day.pressSequentially("01011999");
  await expect(day).toHaveValue("01/01/1999");
  await expect(day).toHaveAttribute("aria-invalid", "true");
  await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
});
