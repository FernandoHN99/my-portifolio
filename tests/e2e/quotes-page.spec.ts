import { expect, test, type Page } from "@playwright/test";

import { stubQuoteChecks, stubRun, stubSummary } from "./support/quote-checks";

// A checagem de abertura grava no banco; aqui ela é substituída por uma
// resposta fixa, e os cenários de edição sempre descartam.
test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

// A edição à mão só existe para cotação não encontrada ou com falha (spec
// 028). Os dados reais costumam não ter nenhuma; os cenários de edição rodam
// só quando a competência aberta tem uma.
async function skipWithoutEditableQuote(page: Page) {
  const editable = await page.getByRole("button", { name: "Editar cotações" }).count();
  test.skip(editable === 0, "Nenhuma cotação editável nos dados reais desta competência.");
}

// Como o lápis de Posições: a competência aberta pode ser um mês passado, que
// pede a confirmação de histórico antes de entrar em edição.
async function enterQuoteEditMode(page: Page) {
  await page.getByRole("button", { name: "Editar cotações" }).click();
  const confirm = page.getByRole("button", { name: "Editar mesmo assim" });
  const field = page.locator('[data-quote-cell="value"]').first();
  await expect(field.or(confirm)).toBeVisible();

  if (await confirm.isVisible()) {
    await confirm.click();
  }

  await expect(field).toBeVisible();
}

test("o botão Cotações de Posições abre as cotações do mês", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-09");
  await expect(page.getByRole("heading", { level: 1, name: "Carteira do mês" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Cotações do mês/ })).toHaveCount(0);

  await page.getByRole("link", { name: "Cotações", exact: true }).click();
  await expect(page).toHaveURL(/\/posicoes\/cotacoes\?mes=2026-09$/);
  await expect(page.getByRole("heading", { level: 1, name: "Cotações do mês" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Posições" }),
  ).toHaveAttribute("aria-current", "page");

  await expect(page.getByRole("heading", { name: "Cotações de Set/26" })).toBeVisible();
  const btc = page.getByTestId("quote-row").filter({ hasText: "BTC" });
  await expect(btc).toContainText("Bitcoin 01");
  await expect(btc).toContainText("R$");
  await expect(page.getByRole("region", { name: "Última atualização" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Histórico de execuções" })).toBeVisible();
  await expect(page.getByTestId("run-history-count")).toContainText("nos últimos 36 meses");
  await expect(page.locator("[data-quote-cell]")).toHaveCount(0);

  // Setembro vem inteiro da planilha e dos provedores: nada para editar à mão.
  await expect(page.getByRole("button", { name: "Editar cotações" })).toHaveCount(0);
  await expect(page.getByTestId("quotes-locked")).toContainText("A edição à mão fica disponível só para");

  await page.getByRole("link", { name: "Voltar para Posições" }).click();
  await expect(page).toHaveURL(/\/posicoes\?mes=2026-09$/);
  await expect(page.getByRole("heading", { level: 1, name: "Carteira do mês" })).toBeVisible();
});

test("voltar para Posições com edição pendente pede confirmação", async ({ page }) => {
  await page.goto("/posicoes/cotacoes");
  await skipWithoutEditableQuote(page);
  await enterQuoteEditMode(page);
  const field = page.locator('[data-quote-cell="value"]').first();
  await field.fill("400000,5");
  await expect(page.getByText("1 alteração pendente")).toBeVisible();

  const back = page.getByRole("link", { name: "Voltar para Posições" });
  const messages: string[] = [];
  page.once("dialog", (dialog) => {
    messages.push(dialog.message());
    void dialog.dismiss();
  });
  await back.click();
  await expect.poll(() => messages).toEqual(["Há 1 alteração não salva. Sair e descartá-las?"]);
  await expect(page).toHaveURL(/\/posicoes\/cotacoes$/);
  await expect(field).toHaveValue("400000,5");

  // Aceitar descarta a edição sem gravar e volta para a tabela.
  page.once("dialog", (dialog) => void dialog.accept());
  await back.click();
  await expect(page).toHaveURL(/\/posicoes$/);
  await expect(page.getByRole("heading", { level: 1, name: "Carteira do mês" })).toBeVisible();
});

test("editar cotações mostra a prévia e bloqueia valor inválido", async ({ page }) => {
  await page.goto("/posicoes/cotacoes");
  await skipWithoutEditableQuote(page);
  await enterQuoteEditMode(page);
  await expect(page.getByText("Modo de edição")).toBeVisible();

  const inputs = page.getByRole("textbox", { name: /^Cotação de / });
  await inputs.first().fill("abc");
  await expect(page.getByText("1 valor inválido")).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "Descartar" }).click();
  await expect(page.locator("[data-quote-cell]")).toHaveCount(0);
  await expect(page.getByText(/alteraç(ão|ões) pendente/)).toHaveCount(0);
});

test("atualizar pela página gira junto com o topo e avisa cada ativo", async ({ page }) => {
  const manual = stubRun({
    id: "00000000-0000-4000-8000-000000000003",
    trigger: "MANUAL",
    status: "COMPLETED_WITH_ISSUES",
    succeeded: 9,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    failures: [
      {
        symbol: "BTC",
        assets: ["Bitcoin 01", "Bitcoin 02"],
        provider: "coingecko",
        errorCode: "NETWORK_ERROR",
        errorMessage: "Não foi possível conectar ao provedor.",
      },
    ],
  });
  await page.unrouteAll();
  await stubQuoteChecks(page, {
    refresh: { refresh: { state: "done", run: manual }, summary: stubSummary(manual, manual.finishedAt) },
    refreshDelayMs: 1200,
  });
  // A atualização só aparece no mês corrente, aberto sem mês na URL.
  const hydrated = page.waitForRequest("**/api/quotes/open-check");
  await page.goto("/posicoes/cotacoes");
  await hydrated;

  const card = page.getByRole("region", { name: "Última atualização" });
  const button = card.getByRole("button");
  const header = page.getByTestId("quote-refresh").getByRole("button");
  await button.click();
  await expect(button).toHaveAttribute("aria-busy", "true");
  await expect(header).toHaveAttribute("aria-busy", "true");
  await expect(card).toContainText("Atualizando cotações…");

  const toast = page.getByTestId("app-toast");
  await expect(toast).toContainText("Cotação de BTC não atualizada");
  await expect(toast).toContainText("Bitcoin 01, Bitcoin 02");
  await expect(toast).toContainText("CoinGecko: Não foi possível conectar ao provedor.");
  await expect(button).not.toHaveAttribute("aria-busy");
  await expect(header).not.toHaveAttribute("aria-busy");
  await expect(card).toContainText("Atualizado agora");
  await expect(card).toContainText("Nessa atualização: 1 cotação com falha (BTC).");
});

test("as páginas removidas não existem mais", async ({ page }) => {
  for (const path of ["/atualizacao", "/importacao"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }

  await page.goto("/configuracao");
  await expect(page.getByRole("heading", { level: 1, name: "Metas da carteira" })).toBeVisible();
  await expect(page.getByText("Dados da carteira")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Revisão de dados|Atualização/ })).toHaveCount(0);
});
