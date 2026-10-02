import { expect, type Page } from "@playwright/test";

// A virada automática de mês pode tornar a competência aberta um mês passado,
// que pede a confirmação de histórico antes de entrar em edição.
export async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: "Editar posições" }).click();
  const confirm = page.getByRole("button", { name: "Editar mesmo assim" });
  const field = page.locator('[data-edit-cell="value"]').first();
  await expect(field.or(confirm)).toBeVisible();

  if (await confirm.isVisible()) {
    await confirm.click();
  }

  await expect(field).toBeVisible();
}
