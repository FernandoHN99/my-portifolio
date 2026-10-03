import { expect, type Page } from "@playwright/test";

// Só um mês aberto aceita edição (spec 034); os cenários que editam abrem a
// competência mais recente, em rascunho.
export async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: "Editar posições" }).click();
  await expect(page.locator('[data-edit-cell="value"]').first()).toBeVisible();
}
