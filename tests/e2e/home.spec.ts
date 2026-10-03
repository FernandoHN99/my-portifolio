import { expect, test } from "@playwright/test";

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

  await expect(
    page.getByRole("navigation", { name: "Competências" }).getByRole("button", { name: /^Fevereiro de 2026/ }),
  ).toHaveAttribute("aria-current", "date");

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

test("a tabela mostra classe, subclasse e resgate e a seta expande a linha", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/posicoes?mes=2026-09");

  // Cotação, moeda e liquidez saíram das colunas e ficaram nos filtros (spec 044).
  const headers = page.getByRole("columnheader");
  await expect(headers.filter({ hasText: /^Classes$/ })).toHaveCount(1);
  for (const removed of [/Cotação/, /^Moeda$/, /^Liquidez$/]) {
    await expect(headers.filter({ hasText: removed })).toHaveCount(0);
  }
  await expect(page.getByRole("combobox", { name: "Moeda", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Liquidez", exact: true })).toBeVisible();

  const row = (asset: string) => page.getByTestId("position-row").filter({ hasText: asset }).first();
  await expect(row("LCD BNDES LIQUIDEZ").getByTestId("position-classes")).toHaveText("Caixa · Pós-fixado · Curto");
  await expect(row("Bitcoin 01").getByTestId("position-classes")).toHaveText("Cripto · BTC");

  // A previdência tem seis classificações: a linha mostra a maior e "…+5".
  const pension = row("Previdência - Grão FIM");
  await expect(pension.getByTestId("position-classes")).toContainText("…+5");
  await pension.getByRole("button", { name: "Expandir Previdência - Grão FIM" }).click();
  const details = page.getByTestId("position-details");
  await expect(details).toBeVisible();
  await expect(details.getByTestId("position-details-allocations").getByRole("listitem")).toHaveCount(6);
  await expect(details).toContainText("Saldo, sem cotação");
  await expect(details).toContainText("BRL");
  await pension.getByRole("button", { name: "Recolher Previdência - Grão FIM" }).click();
  await expect(details).toHaveCount(0);
});

test("um mês fechado não oferece edição", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-08");

  await expect(page.getByTestId("month-locked")).toContainText("Ago/26 está fechado");
  await expect(page.getByRole("button", { name: "Adicionar posição" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Editar / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Remover / })).toHaveCount(0);
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
  // Com a faixa mais larga, menos linhas da prévia pedem comprar ou vender.
  const actions = page
    .getByRole("complementary", { name: "Prévia do rebalanceamento" })
    .getByText(/^(Comprar|Vender)$/);
  const before = await actions.count();

  await tolerance.fill("20");
  await expect(page.getByText("1 alteração")).toBeVisible();
  await expect.poll(() => actions.count()).toBeLessThan(before);
  await expect(page.getByRole("button", { name: "Salvar metas" })).toBeEnabled();

  await tolerance.fill("25");
  await expect(page.getByText("Use uma tolerância entre 0 e 20")).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar metas" })).toBeDisabled();

  await page.getByRole("button", { name: "Descartar" }).click();
  await expect(tolerance).toHaveValue("2");
  await expect.poll(() => actions.count()).toBe(before);
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
