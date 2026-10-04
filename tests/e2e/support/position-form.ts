import { expect, type Locator, type Page } from "@playwright/test";

// Formulário único da posição (spec 043). Só um mês aberto aceita edição
// (spec 034): sem ele, "Adicionar posição" e o lápis das linhas não aparecem,
// e os cenários que editam ficam pulados. Os testes rodam sobre os dados reais
// e nunca salvam: preenchem, conferem e cancelam.

/**
 * Espera a página hidratar: no WebKit, mais lento, um campo preenchido antes
 * disso mostra o texto sem o React receber a mudança. A faixa de competências
 * marca `data-hydrated` quando monta no navegador.
 */
export async function waitForHydration(page: Page) {
  await expect(page.getByRole("navigation", { name: "Competências" })).toHaveAttribute("data-hydrated");
}

export async function hasOpenMonth(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "Carteira do mês" })).toBeVisible();
  await waitForHydration(page);
  return (await page.getByRole("button", { name: "Adicionar posição" }).count()) > 0;
}

/**
 * Abre Posições num mês aberto: o mais recente ou, fechado ele, o anterior,
 * como quando o usuário reabre o mês passado para acertar algo. Devolve falso
 * quando os dois estão fechados, para o cenário ser pulado.
 */
export async function openEditableMonth(page: Page) {
  await page.goto("/posicoes");

  if (await hasOpenMonth(page)) {
    await page.waitForLoadState("networkidle");
    return true;
  }

  const now = new Date();
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  await page.goto(`/posicoes?mes=${previous}`);
  const open = await hasOpenMonth(page);
  await page.waitForLoadState("networkidle");
  return open;
}

export async function openAddForm(page: Page) {
  await page.getByRole("button", { name: "Adicionar posição" }).click();
  const dialog = page.getByRole("dialog", { name: "Adicionar posição" });
  await expect(dialog).toBeVisible();
  return dialog;
}

export function positionRow(page: Page, asset: string, institution?: string) {
  const rows = page.getByTestId("position-row").filter({ hasText: asset });
  return (institution ? rows.filter({ hasText: institution }) : rows).first();
}

export async function openEditForm(page: Page, asset: string, institution?: string) {
  const row = positionRow(page, asset, institution);
  await row.hover();
  await row.getByRole("button", { name: `Editar ${asset}` }).click();
  const dialog = page.getByRole("dialog", { name: `Editar ${asset}` });
  await expect(dialog).toBeVisible();
  return dialog;
}

export function formTab(dialog: Locator, name: "Geral" | "Ativo" | "Rateio") {
  return dialog.getByRole("tab", { name: new RegExp(`^${name}`) });
}

/** Inclusão guiada (spec 066): as etapas são informativas, sem atalhos. */
export async function expectFormStep(dialog: Locator, label: string) {
  await expect(dialog.getByRole("list", { name: "Etapas do formulário" }).locator('li[aria-current="step"]')).toContainText(label);
}

export async function continueForm(dialog: Locator, next: "Ativo" | "Rateio" | "Conferir") {
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await expectFormStep(dialog, next);
}

export async function closeForm(dialog: Locator) {
  await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

/** Pendências que impedem salvar; zero quer dizer pronto, sem precisar salvar. */
export function issueCount(dialog: Locator) {
  return dialog.locator("footer[data-issue-count]");
}

export async function pick(page: Page, field: Locator, text: string, option: string | RegExp) {
  await field.click();
  await page.keyboard.type(text);
  await page.getByRole("option", { name: option }).click();
}

export async function chooseKind(page: Page, dialog: Locator, kind: RegExp) {
  await dialog.getByRole("combobox", { name: "Tipo do ativo" }).click();
  await page.getByRole("option", { name: kind }).click();
}
