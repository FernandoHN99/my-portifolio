import { expect, type Locator, type Page } from "@playwright/test";

// A competência da carteira tem dois desenhos (spec 096): a faixa de anos e meses,
// de `sm` para cima, e, no celular, um botão com o mês escolhido que abre a escolha
// numa folha de baixo. Os cenários que só precisam saber em que competência estão,
// ou trocá-la, passam por aqui e valem nos dois.

/** A faixa; no celular ela fica oculta, mas marca `data-hydrated` ao montar no navegador. */
export const competenceNav = (page: Page) => page.getByRole("navigation", { name: "Competências", includeHidden: true });

export const competenceTrigger = (page: Page) => page.getByTestId("month-trigger");
export const competenceSheet = (page: Page) => page.getByTestId("month-sheet");

/** Espera a página hidratar: antes disso, os botões da competência não respondem. */
export async function waitForCompetenceHydration(page: Page) {
  await expect(competenceNav(page)).toHaveAttribute("data-hydrated");
}

/** No celular, o botão da folha aparece no lugar da faixa. */
export const usesCompetenceSheet = (page: Page) => competenceTrigger(page).isVisible();

/** Confere a competência selecionada pelo nome do mês, como "Fevereiro de 2026". */
export async function expectCompetence(page: Page, name: string) {
  if (await usesCompetenceSheet(page)) {
    await expect(competenceTrigger(page)).toHaveAccessibleName(`Competência: ${name}`);
    return;
  }

  await expect(competenceNav(page).getByRole("button", { name: new RegExp(`^${name}`) })).toHaveAttribute("aria-current", "date");
}

/** Abre a folha do celular e espera a animação de entrada terminar. */
export async function openCompetenceSheet(page: Page) {
  await competenceTrigger(page).click();
  await expect(competenceSheet(page)).toBeVisible();
  await expect(competenceSheet(page)).not.toHaveAttribute("data-starting-style");
}

/** Os botões de um ano: na faixa, no computador; na folha aberta, no celular. */
export async function competenceYear(page: Page, year: number): Promise<Locator> {
  const scope = (await usesCompetenceSheet(page)) ? page.getByTestId("month-sheet-years") : competenceNav(page);

  return scope.getByRole("button", { name: new RegExp(`^${year}`) });
}

/** Escolhe um mês pelo nome ("Agosto de 2026"), abrindo o ano dele e, no celular, a folha. */
export async function chooseCompetence(page: Page, name: string) {
  const year = Number(name.slice(-4));
  const sheet = await usesCompetenceSheet(page);

  if (sheet) {
    await openCompetenceSheet(page);
  }

  const yearButton = (await competenceYear(page, year)).first();
  const opened = sheet ? await yearButton.getAttribute("aria-pressed") : await yearButton.getAttribute("aria-expanded");

  if (opened !== "true") {
    await yearButton.click();
  }

  const scope = sheet ? competenceSheet(page) : competenceNav(page);
  await scope.getByRole("button", { name: new RegExp(`^${name}`) }).click();
}

/** Confere que a competência não oferece o ano: abre a folha no celular e a fecha depois. */
export async function expectNoCompetenceYear(page: Page, year: number) {
  const sheet = await usesCompetenceSheet(page);

  if (sheet) {
    await openCompetenceSheet(page);
  }

  await expect(await competenceYear(page, year)).toHaveCount(0);

  if (sheet) {
    await competenceSheet(page).getByRole("button", { name: "Fechar" }).click();
    await expect(competenceSheet(page)).toHaveCount(0);
  }
}
