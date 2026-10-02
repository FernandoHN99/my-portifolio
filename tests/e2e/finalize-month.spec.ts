import { expect, test } from "@playwright/test";

import { stubQuoteChecks } from "./support/quote-checks";

// Finalizar o mês corrente (spec 032). O teste só abre e cancela os diálogos,
// sem gravar nos dados reais.
test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

test("o mês mais recente em rascunho oferece finalizar, com confirmação", async ({ page }) => {
  await page.goto("/posicoes");
  await expect(page.getByRole("heading", { level: 1, name: "Carteira do mês" })).toBeVisible();

  const status = await page.getByTestId("month-status").textContent();
  test.skip(status !== "Rascunho", "A competência mais recente não está em rascunho nos dados reais.");

  await page.getByRole("button", { name: "Finalizar mês" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/Finalizar [A-Z][a-z]{2}\/\d{2}\?/);
  await expect(dialog).toContainText("pede a mesma confirmação dos meses passados");
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByTestId("month-status")).toHaveText("Rascunho");
});

test("meses passados não oferecem finalizar", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-09");
  await expect(page.getByRole("heading", { level: 1, name: "Carteira do mês" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Finalizar mês|Reabrir mês/ })).toHaveCount(0);
  await expect(page.getByTestId("month-locked")).toContainText("competência passada");
});
