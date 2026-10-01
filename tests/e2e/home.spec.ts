import { expect, test } from "@playwright/test";

test("apresenta a carteira normalizada", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Patrimônio consolidado",
    }),
  ).toBeVisible();
  await expect(page.getByTestId("portfolio-total")).toContainText("R$");
  await expect(page.getByRole("heading", { name: "Evolução do patrimônio" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Classe de ativos" })).toBeVisible();

  await page.getByRole("link", { name: "Configuração da carteira" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Metas da carteira" })).toBeVisible();

  await page.getByRole("link", { name: "Atualização" }).click();
  await expect(
    page.getByRole("heading", {
      name: /Prepare a próxima competência|Atualização de/,
    }),
  ).toBeVisible();

  await page.goto("/configuracao");
  await page.getByRole("link", { name: "Revisão de dados" }).click();
  await expect(page.getByRole("heading", { name: /achados, sem correções silenciosas/ })).toBeVisible();
});

test("o seletor global de mês governa as telas", async ({ page }) => {
  await page.goto("/?mes=2026-02");

  await expect(page.getByText("Fevereiro de 2026", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Alocação" }).click();
  await expect(page).toHaveURL(/\/alocacao\?mes=2026-02/);
  await expect(page.getByText("Fevereiro de 2026", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Posições" }).click();
  await expect(page).toHaveURL(/\/posicoes\?mes=2026-02/);
  await expect(page.getByRole("heading", { level: 1, name: "Carteira do mês" })).toBeVisible();
});

test("um mês inexistente cai para a competência mais recente", async ({ page }) => {
  await page.goto("/?mes=1999-01");

  await expect(page.getByRole("heading", { level: 1, name: "Patrimônio consolidado" })).toBeVisible();
  await expect(page.getByTestId("portfolio-total")).toContainText("R$");
});

test("a visão geral alterna o empilhamento e leva à alocação", async ({ page }) => {
  await page.goto("/?mes=2026-05");

  await expect(page.getByTestId("portfolio-total")).toContainText("R$");

  await page.getByRole("button", { name: "Classe", exact: true }).click();
  await expect(page.getByRole("button", { name: "Classe", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("link", { name: /Fora da meta/ }).click();
  await expect(page).toHaveURL(/\/alocacao\?mes=2026-05/);
  await expect(page.getByRole("heading", { level: 1, name: "Atual contra meta" })).toBeVisible();
});
