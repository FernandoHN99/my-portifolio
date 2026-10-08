import { expect, test, type Page } from "@playwright/test";

import {
  competenceNav,
  competenceSheet,
  competenceTrigger,
  openCompetenceSheet,
  waitForCompetenceHydration,
} from "./support/competence";
import { stubQuoteChecks } from "./support/quote-checks";

// Spec 096: no celular a faixa de anos e meses dá lugar a um botão com o mês
// escolhido, que abre a competência numa folha de baixo para cima. No
// computador a faixa continua (month-timeline.spec.ts). Só leitura.
test.beforeEach(async ({ page, isMobile }) => {
  test.skip(!isMobile, "A folha de competência é do celular; no computador vale a faixa.");
  await stubQuoteChecks(page);
});

const months = (page: Page) => competenceSheet(page).getByTestId("month-sheet-months").getByRole("button");
const years = (page: Page) => competenceSheet(page).getByTestId("month-sheet-years").getByRole("button");

async function openOverview(page: Page, month: string) {
  await page.goto(`/?mes=${month}`);
  await waitForCompetenceHydration(page);
}

test("o botão mostra a competência no lugar da faixa e a folha abre no ano dela", async ({ page }) => {
  await openOverview(page, "2026-02");

  await expect(competenceNav(page)).toBeHidden();
  const trigger = competenceTrigger(page);
  await expect(trigger).toHaveAccessibleName("Competência: Fevereiro de 2026");
  await expect(trigger).toContainText("Fev/26");
  expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(40);

  await openCompetenceSheet(page);
  await expect(competenceSheet(page).getByRole("group", { name: "Meses de 2026" })).toBeVisible();
  await expect(years(page).first()).toHaveText("2026");
  await expect(years(page).first()).toHaveAttribute("aria-pressed", "true");
  await expect(months(page)).toHaveCount(12);
  await expect(months(page).filter({ hasText: "Fev" })).toHaveAttribute("aria-current", "date");
  await expect(months(page).filter({ hasText: "Jan" })).toHaveAccessibleName(/^Janeiro de 2026, [+-]/);

  // Alvos de toque de pelo menos 44 px.
  for (const target of [years(page).first(), months(page).first()]) {
    expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

test("trocar de ano só consulta; escolher o mês muda a competência e fecha a folha", async ({ page }) => {
  await openOverview(page, "2026-02");
  await openCompetenceSheet(page);

  await competenceSheet(page).getByRole("button", { name: "2025", exact: true }).click();
  await expect(competenceSheet(page).getByRole("group", { name: "Meses de 2025" })).toBeVisible();
  await expect(page).toHaveURL(/mes=2026-02/);
  await expect(competenceSheet(page).getByRole("button", { name: "2026, competência selecionada" })).toBeVisible();
  await expect(competenceSheet(page).locator("[aria-current='date']")).toHaveCount(0);

  await competenceSheet(page).getByRole("button", { name: /^Dezembro de 2025/ }).click();
  await expect(page).toHaveURL(/mes=2025-12/);
  await expect(competenceSheet(page)).toHaveCount(0);
  await expect(competenceTrigger(page)).toHaveAccessibleName("Competência: Dezembro de 2025");
  await expect(competenceTrigger(page)).toContainText("Dez/25");

  // Reaberta, a folha volta ao ano da competência.
  await openCompetenceSheet(page);
  await expect(competenceSheet(page).getByRole("group", { name: "Meses de 2025" })).toBeVisible();
});

test("mês sem registro fica apagado e a folha fecha sem trocar a competência", async ({ page }) => {
  await openOverview(page, "2026-02");
  await openCompetenceSheet(page);

  // O histórico começa no meio de 2023 (spec 041).
  await competenceSheet(page).getByRole("button", { name: "2023", exact: true }).click();
  await expect(competenceSheet(page).getByRole("button", { name: "Janeiro de 2023" })).toBeDisabled();
  await expect(months(page)).toHaveCount(12);

  await competenceSheet(page).getByRole("button", { name: "Fechar" }).click();
  await expect(competenceSheet(page)).toHaveCount(0);
  await expect(page).toHaveURL(/mes=2026-02/);

  // O mês atual, escolhido de novo, só fecha a folha.
  await openCompetenceSheet(page);
  await months(page).filter({ hasText: "Fev" }).click();
  await expect(competenceSheet(page)).toHaveCount(0);
  await expect(page).toHaveURL(/mes=2026-02/);
});

test("alterações pendentes seguram a troca de mês, mas não a de ano", async ({ page }) => {
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });

  await openOverview(page, "2026-09");
  await page.goto("/configuracao?mes=2026-09");
  await waitForCompetenceHydration(page);
  await page.getByRole("textbox", { name: "Tolerância em pontos percentuais" }).fill("3");
  await expect(page.getByText("1 alteração", { exact: true })).toBeVisible();

  await openCompetenceSheet(page);
  await competenceSheet(page).getByRole("button", { name: "2025", exact: true }).click();
  expect(dialogs).toHaveLength(0);

  await competenceSheet(page).getByRole("button", { name: /^Dezembro de 2025/ }).click();
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toContain("alteração não salva");
  await expect(page).toHaveURL(/mes=2026-09/);
  await expect(competenceTrigger(page)).toHaveAccessibleName("Competência: Setembro de 2026");

  await page.getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByText("1 alteração", { exact: true })).toHaveCount(0);
});

test("o botão e a situação do mês cabem na tela sem rolagem lateral", async ({ page }) => {
  await openOverview(page, "2026-09");

  const fits = () =>
    page.evaluate(() => {
      const band = document.querySelector("[data-testid='month-trigger']")!.parentElement!.getBoundingClientRect();
      const lock = document.querySelector("[data-testid='month-lock']")!.getBoundingClientRect();
      const trigger = document.querySelector("[data-testid='month-trigger']")!.getBoundingClientRect();

      return {
        page: document.documentElement.scrollWidth <= window.innerWidth,
        inside: trigger.left >= band.left && lock.right <= band.right + 1,
        apart: trigger.right <= lock.left,
      };
    });

  const ok = { page: true, inside: true, apart: true };
  await expect.poll(fits).toEqual(ok);

  // Também na menor largura de telefone; o WebKit leva um instante para refazer o layout.
  await page.setViewportSize({ width: 320, height: 700 });
  await expect.poll(fits).toEqual(ok);
});
