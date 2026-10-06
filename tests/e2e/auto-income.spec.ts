import { expect, test, type Locator, type Page } from "@playwright/test";

import { closeForm, formTab, openEditableMonth, openEditForm, positionRow, waitForHydration } from "./support/position-form";
import { stubQuoteChecks } from "./support/quote-checks";

// Spec 079: rendimento automático da renda fixa e do caixa em reais, o
// prefixado nas metas e os filtros das movimentações. Os cenários só leem os
// dados; nos formulários, preenchem e fecham sem salvar.
test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

const POSITION_PATH = /\/posicoes\/[0-9a-f-]{36}\/[0-9a-f-]{36}/;

async function openPosition(page: Page, asset: string, query = "mes=2026-09") {
  await page.goto(`/posicoes?${query}`);
  await waitForHydration(page);
  await positionRow(page, asset).getByRole("link", { name: asset, exact: true }).click();
  await expect(page).toHaveURL(POSITION_PATH, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1, name: asset })).toBeVisible();
}

async function openMovements(page: Page) {
  const section = page.getByTestId("position-transactions-section");
  await section.getByRole("button", { name: /^Movimentações/ }).click();
  await expect(section.getByTestId("position-transactions")).toBeVisible();
  return section;
}

const chipCount = async (chip: Locator) => Number((await chip.innerText()).replace(/\D/g, ""));

test("as movimentações filtram por tipo, com a contagem de cada um", async ({ page }) => {
  // Bitcoin 01: o saldo inicial de Jun/23 e as compras (specs 071 e 073).
  await openPosition(page, "Bitcoin 01");
  const section = await openMovements(page);
  const filters = section.getByRole("group", { name: "Tipo de movimentação" });
  const rows = section.getByTestId("position-transactions").locator("tbody tr");
  const all = filters.getByRole("button", { name: "Todos", exact: true });
  const contributions = filters.getByRole("button", { name: /^Aportes/ });
  const opening = filters.getByRole("button", { name: /^Saldo inicial/ });
  const total = await rows.count();

  await expect(all).toHaveAttribute("aria-pressed", "true");
  // Só os tipos que a posição tem viram filtro.
  await expect(filters.getByRole("button")).toHaveCount(
    1 + (await section.getByTestId("position-transactions").evaluate((table) =>
      new Set([...table.querySelectorAll("tbody tr")].map((row) => row.getAttribute("data-transaction-kind"))).size,
    )),
  );

  await contributions.click();
  await expect(contributions).toHaveAttribute("aria-pressed", "true");
  await expect(all).toHaveAttribute("aria-pressed", "false");
  await expect(rows).toHaveCount(await chipCount(contributions));
  await expect(rows.and(page.locator('[data-transaction-kind="CONTRIBUTION"]'))).toHaveCount(await chipCount(contributions));

  await opening.click();
  await expect(rows).toHaveCount(await chipCount(opening));
  await expect(rows.first()).toHaveAttribute("data-transaction-kind", "OPENING");

  await all.click();
  await expect(rows).toHaveCount(total);
});

test("as metas da renda fixa têm o prefixado, e a alocação esconde o que tem meta e saldo zero", async ({ page }) => {
  await page.goto("/configuracao");
  const matrix = page.getByRole("region", { name: "Renda fixa: subclasse × resgate" });
  await expect(matrix.getByText("Pós-fixado", { exact: true })).toBeVisible();
  await expect(matrix.getByText("Prefixado", { exact: true })).toBeVisible();

  // Na Visão geral, cada linha de comprar e vender tem saldo ou meta.
  await page.goto("/?mes=2026-09&corte=renda-fixa");
  const allocation = page.getByRole("region", { name: "Alocação" });
  await allocation.scrollIntoViewIfNeeded();
  const shares = await allocation.locator("table tbody tr").evaluateAll((rows) =>
    rows.map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim() ?? "")),
  );
  for (const cells of shares) {
    expect(cells.filter((cell) => /^0,0\s?%$/.test(cell)).length, cells.join(" | ")).toBeLessThan(2);
  }
});

test("cada classificação compatível tem a própria rentabilidade, e a flag exige a de todas", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "Nenhum mês aberto para editar.");
  const asset = await page
    .getByTestId("position-row")
    .filter({ hasText: /· Renda fixa/ })
    .filter({ hasText: "Pós-fixado" })
    .first()
    .getByRole("link")
    .first()
    .innerText()
    .catch(() => null);
  test.skip(!asset, "Nenhuma renda fixa pós-fixada no mês aberto.");

  const dialog = await openEditForm(page, asset!.trim());
  await formTab(dialog, "Rateio").click();
  const rates = dialog.getByTestId("allocation-rate");
  const rows = await dialog.locator("[data-allocation-row]").count();
  const compatible = await rates.count();
  expect(compatible).toBeGreaterThan(0);
  await expect(dialog.getByTestId("auto-income")).toBeVisible();

  // Uma classificação nova ganha a taxa dela quando a subclasse é compatível.
  const added = rows + 1;
  const choose = async (field: string, option: string) => {
    await dialog.getByRole("combobox", { name: `${field} da classificação ${added}`, exact: true }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
  };
  await dialog.getByRole("button", { name: "Adicionar classificação" }).click();
  await choose("Classe", "Renda Fixa");
  await choose("Subclasse", "Prefixado");
  await expect(rates).toHaveCount(compatible + 1);
  await expect(dialog.getByRole("textbox", { name: `Rentabilidade da classificação ${added}` })).toBeVisible();
  await expect(rates.last()).toContainText("% a.a.");
  await choose("Subclasse", "IPCA");
  await expect(rates).toHaveCount(compatible);
  await dialog.getByRole("button", { name: `Remover classificação ${added}` }).click();

  // Com a flag, a taxa de cada classificação é obrigatória.
  const first = await rates.first().getByRole("textbox").getAttribute("aria-label");
  await dialog.getByRole("textbox", { name: first! }).fill("");
  await dialog.getByRole("checkbox", { name: "Calcular rendimento automaticamente" }).check();
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog.getByText("Informe a rentabilidade para calcular o rendimento automaticamente.")).toBeVisible();

  await closeForm(dialog);
});
