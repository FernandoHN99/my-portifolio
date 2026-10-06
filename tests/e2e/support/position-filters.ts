import { expect, type Page } from "@playwright/test";

// Filtros de Posições (specs 031, 044 e 077): no computador, listas na própria
// linha; no celular, uma folha com chips, aberta pelo botão Filtros.

export async function usesFilterSheet(page: Page) {
  return page.getByRole("button", { name: /^Filtros/ }).isVisible();
}

export async function openFilterGroup(page: Page, label: string) {
  await page.getByRole("button", { name: /^Filtros/ }).click();
  const group = page.getByTestId("positions-filter-sheet").getByRole("group", { name: new RegExp(`^${label}`) });
  await expect(group).toBeVisible();
  return group;
}

export async function closeFilterSheet(page: Page) {
  await page.getByTestId("positions-filter-sheet").getByRole("button", { name: "Fechar" }).click();
  await expect(page.getByTestId("positions-filter-sheet")).toHaveCount(0);
}

/** As opções que um filtro oferece agora, em cascata com os da esquerda. */
export async function filterOptions(page: Page, label: string) {
  if (await usesFilterSheet(page)) {
    const options = await (await openFilterGroup(page, label)).getByRole("button").allTextContents();
    await closeFilterSheet(page);
    return options.map((option) => option.trim());
  }

  await page.getByRole("combobox", { name: new RegExp(`^${label}`) }).click();
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  const options = await list.getByRole("option").allTextContents();
  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
  return options.map((option) => option.trim());
}

/** Marca uma opção do filtro e espera a URL refletir a escolha. */
export async function chooseFilter(page: Page, label: string, option: string, url: RegExp) {
  if (await usesFilterSheet(page)) {
    await (await openFilterGroup(page, label)).getByRole("button", { name: option, exact: true }).click();
    await expect(page).toHaveURL(url);
    await closeFilterSheet(page);
    return;
  }

  await page.getByRole("combobox", { name: new RegExp(`^${label}`) }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  // Fecha a lista só depois de a escolha chegar à URL: um Escape no meio da
  // atualização pode se perder e deixar a lista aberta.
  await expect(page).toHaveURL(url);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
}
