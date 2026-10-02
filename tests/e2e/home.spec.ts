import { expect, test } from "@playwright/test";

import { enterEditMode } from "./support/edit-mode";
import { stubQuoteChecks } from "./support/quote-checks";

// A checagem de abertura grava no banco; aqui ela é substituída por uma
// resposta fixa para que os cenários não alterem os dados nem mudem de mês.
test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

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

test("os filtros de posições combinam e somam o recorte", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-09");

  await expect(page.getByText("21 de 21 posições")).toBeVisible();

  await page.getByRole("combobox", { name: "Instituição", exact: true }).click();
  await page.getByRole("option", { name: "Inter" }).click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/inst=Inter/);
  await expect(page.getByText(/^\d+ de 21 posições$/)).not.toHaveText("21 de 21 posições");

  await page.goto("/posicoes?mes=2026-09&classe=Renda%20Vari%C3%A1vel&agrupar=classe");
  await expect(page.getByText("Parcela nas classes selecionadas")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("combobox", { name: /Classe\s*1/ })).toBeVisible();
});

test("o lápis coloca as posições em edição até salvar ou descartar", async ({ page }) => {
  await page.goto("/posicoes");
  await expect(page.locator("[data-edit-cell]")).toHaveCount(0);

  await enterEditMode(page);
  await expect(page.getByText("Modo de edição")).toBeVisible();
  const inputs = page.getByRole("textbox", { name: /^(Quantidade|Saldo) de / });
  expect(await inputs.count()).toBeGreaterThan(1);
  await expect(inputs.first()).toBeVisible();

  await inputs.first().fill("1");
  await expect(page.getByText("1 alteração pendente")).toBeVisible();
  await inputs.nth(1).fill("abc");
  await expect(page.getByText("1 valor inválido")).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByText(/alteraç(ão|ões) pendente/)).toHaveCount(0);
  await expect(page.locator("[data-edit-cell]")).toHaveCount(0);
});

test("competência passada exige confirmação para editar", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-08");

  await expect(page.getByText(/travada para edição/)).toBeVisible();
  await expect(page.locator("[data-edit-cell]")).toHaveCount(0);

  await page.getByRole("button", { name: "Editar posições" }).click();
  await expect(page.getByRole("dialog")).toContainText("Isso altera o histórico");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.locator("[data-edit-cell]")).toHaveCount(0);

  await page.getByRole("button", { name: "Editar posições" }).click();
  await page.getByRole("button", { name: "Editar mesmo assim" }).click();
  await expect(page.getByText(/Editando o histórico/)).toBeVisible();
  await expect(page.locator('[data-edit-cell="value"]').first()).toBeVisible();
  await page.getByRole("button", { name: "Sair da edição" }).click();
  await expect(page.locator("[data-edit-cell]")).toHaveCount(0);
});

test("a configuração simula metas antes de salvar", async ({ page }) => {
  await page.goto("/configuracao?mes=2026-09");

  await expect(page.getByRole("heading", { level: 1, name: "Metas da carteira" })).toBeVisible();
  const preview = page.getByRole("complementary", { name: "Prévia do rebalanceamento" });
  await expect(preview).toContainText("Set/26");

  const caixa = page.getByRole("textbox", { name: "Percentual de Caixa" });
  const original = await caixa.inputValue();
  await caixa.fill(String(Number(original.replace(",", ".")) + 5).replace(".", ","));

  await expect(page.getByText("1 grupo não soma 100%")).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar metas" })).toBeDisabled();

  await page.getByRole("button", { name: "Descartar" }).click();
  await expect(caixa).toHaveValue(original);
});

test("a tolerância muda a prévia antes de salvar", async ({ page }) => {
  await page.goto("/configuracao?mes=2026-09");

  const tolerance = page.getByRole("textbox", { name: "Tolerância em pontos percentuais" });
  await expect(tolerance).toHaveValue("2");
  const offTarget = page
    .getByRole("complementary", { name: "Prévia do rebalanceamento" })
    .getByText("Fora da meta")
    .locator("xpath=following-sibling::p[1]");
  const before = Number((await offTarget.innerText()).trim());

  await tolerance.fill("20");
  await expect(page.getByText("1 alteração")).toBeVisible();
  await expect(offTarget).not.toHaveText(String(before));
  await expect(page.getByRole("button", { name: "Salvar metas" })).toBeEnabled();

  await tolerance.fill("25");
  await expect(page.getByText("Use uma tolerância entre 0 e 20")).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar metas" })).toBeDisabled();

  await page.getByRole("button", { name: "Descartar" }).click();
  await expect(tolerance).toHaveValue("2");
  await expect(offTarget).toHaveText(String(before));
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
