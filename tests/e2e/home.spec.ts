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

  await page.getByRole("link", { name: "Posições" }).click();
  await expect(page).toHaveURL(/\/posicoes\?mes=2026-02/);
  await expect(page.getByRole("heading", { level: 1, name: "Carteira do mês" })).toBeVisible();
});

test("um mês inexistente cai para a competência mais recente", async ({ page }) => {
  await page.goto("/?mes=1999-01");

  await expect(page.getByRole("heading", { level: 1, name: "Patrimônio consolidado" })).toBeVisible();
  await expect(page.getByTestId("portfolio-total")).toContainText("R$");
});

test("a visão geral alterna o empilhamento do gráfico", async ({ page }) => {
  await page.goto("/?mes=2026-05");

  await expect(page.getByTestId("portfolio-total")).toContainText("R$");

  const chart = page.locator("#evolucao");
  await chart.getByRole("button", { name: "Classe", exact: true }).click();
  await expect(chart.getByRole("button", { name: "Classe", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("o rebalanceamento troca de recorte", async ({ page }) => {
  await page.goto("/?mes=2026-09");

  const panel = page.locator("#rebalanceamento");
  await expect(page.getByRole("heading", { name: "Comprar e vender" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Estratégia", exact: true })).toBeVisible();

  await panel.getByRole("button", { name: "Renda Fixa", exact: true }).click();
  await expect(page).toHaveURL(/corte=renda-fixa/);
  await expect(panel.getByRole("button", { name: "Estratégia", exact: true })).toHaveCount(0);

  await panel.getByRole("button", { name: "Geral", exact: true }).click();
  await panel.getByRole("button", { name: "Moeda", exact: true }).click();
  await expect(page).toHaveURL(/sub=moeda/);
});
