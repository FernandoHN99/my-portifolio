import { expect, test, type Page } from "@playwright/test";

import type { TickerCheckResponse } from "@/modules/quotes/domain/ticker-check";

import { stubQuoteChecks } from "./support/quote-checks";

// Os cenários nunca salvam: abrem o diálogo, preenchem, conferem os estados e
// cancelam ou descartam. A checagem de ticker é substituída por respostas fixas,
// porque a rota real consulta provedores.
test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

const TOKEN = "00000000-0000-4000-8000-000000000026";

type TickerRequest = { monthId: string; kind: string; ticker: string };

async function stubTickerCheck(page: Page, respond: (request: TickerRequest) => TickerCheckResponse) {
  const requests: TickerRequest[] = [];

  await page.route("**/api/quotes/ticker-check", async (route) => {
    const body = route.request().postDataJSON() as TickerRequest;
    requests.push(body);
    await route.fulfill({ json: respond(body) });
  });

  return requests;
}

async function openAddDialog(page: Page) {
  await page.getByRole("button", { name: "Adicionar posição" }).click();
  const dialog = page.getByRole("dialog", { name: "Adicionar posição" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function pick(page: Page, field: ReturnType<Page["getByRole"]>, text: string, option: string | RegExp) {
  await field.click();
  await page.keyboard.type(text);
  await page.getByRole("option", { name: option }).click();
}

test("adicionar posição fica no topo, entra em edição e abre o diálogo", async ({ page }) => {
  await page.goto("/posicoes");
  const add = page.getByRole("button", { name: "Adicionar posição" });
  await expect(add).toBeVisible();
  await expect(page.locator("[data-edit-cell]")).toHaveCount(0);

  const dialog = await openAddDialog(page);
  await expect(page.getByText("Modo de edição")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toHaveCount(0);

  // No modo de edição o botão continua no topo e abre o diálogo direto.
  await expect(page.locator('[data-edit-cell="value"]').first()).toBeVisible();
  await openAddDialog(page);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Sair da edição" }).click();
  await expect(page.locator("[data-edit-cell]")).toHaveCount(0);
});

test("numa competência passada, adicionar pede a confirmação do histórico", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-08");
  await page.getByRole("button", { name: "Adicionar posição" }).click();
  await expect(page.getByRole("dialog")).toContainText("Isso altera o histórico");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.locator("[data-edit-cell]")).toHaveCount(0);

  await page.getByRole("button", { name: "Adicionar posição" }).click();
  await page.getByRole("button", { name: "Editar mesmo assim" }).click();
  const dialog = page.getByRole("dialog", { name: "Adicionar posição" });
  await expect(dialog).toBeVisible();
  await expect(page.getByText(/Editando o histórico/)).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: "Sair da edição" }).click();
  await expect(page.locator("[data-edit-cell]")).toHaveCount(0);
});

test("instituição e conta aceitam valores novos sem duplicar os existentes", async ({ page }) => {
  await page.goto("/posicoes");
  const dialog = await openAddDialog(page);
  const institution = dialog.getByRole("combobox", { name: "Instituição" });
  const account = dialog.getByRole("combobox", { name: "Conta" });
  await expect(account).toBeDisabled();

  // Um nome existente, sem acento ou maiúscula, não oferece criar.
  await institution.click();
  await page.keyboard.type("itau");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option", { name: "Itaú" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Corretora Teste");
  await page.getByRole("option", { name: "Criar “Corretora Teste”" }).click();
  await expect(institution).toHaveValue("Corretora Teste");

  // A instituição nova começa com a conta Principal, também nova.
  await expect(account).toHaveValue("Principal");
  await account.click();
  await expect(page.getByRole("option", { name: /Principal/ })).toContainText("nova");
  await page.keyboard.type("Investimentos");
  await page.getByRole("option", { name: "Criar “Investimentos”" }).click();
  await expect(account).toHaveValue("Investimentos");

  await institution.click();
  await expect(page.getByRole("option", { name: /Corretora Teste/ })).toContainText("nova");
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Sair da edição" }).click();
});

test("o ticker de um ativo novo é conferido no provedor do tipo", async ({ page }) => {
  const requests = await stubTickerCheck(page, ({ kind, ticker }) => {
    if (ticker === "ETH") {
      return { status: "found", symbol: "ETH", provider: "coingecko", priceBrl: 10000, name: "Ethereum", quoteDate: "2026-10-02", token: TOKEN };
    }
    if (ticker === "QQQ") {
      return { status: "unavailable", symbol: "QQQ", provider: "finnhub", code: "NETWORK_ERROR", message: "Não foi possível conectar ao provedor.", token: TOKEN };
    }
    return { status: "not-found", symbol: ticker, provider: kind === "crypto" ? "coingecko" : "alpha-vantage", message: `Não encontrou o ticker ${ticker}.` };
  });
  await page.goto("/posicoes");
  const dialog = await openAddDialog(page);
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "inter", /^Inter$/);
  await pick(page, dialog.getByRole("combobox", { name: "Ativo" }), "Ethereum", "Criar “Ethereum”");
  await expect(dialog.getByRole("region", { name: "Novo ativo" })).toBeVisible();

  const add = dialog.getByRole("button", { name: "Adicionar" });
  const kind = dialog.getByRole("combobox", { name: "Tipo do ativo" });
  const ticker = dialog.getByRole("textbox", { name: "Ticker" });
  const status = dialog.locator("[data-ticker-status]");

  await kind.click();
  await page.getByRole("option", { name: /Cripto/ }).click();
  await ticker.click();
  // A checagem espera a digitação terminar e consulta uma vez só.
  await page.keyboard.type("eth", { delay: 60 });
  await expect(ticker).toHaveValue("ETH");
  await expect(status).toHaveAttribute("data-ticker-status", "found");
  await expect(status).toContainText("ETH encontrado (Ethereum)");
  expect(requests.filter((request) => request.ticker.startsWith("E"))).toEqual([
    expect.objectContaining({ kind: "crypto", ticker: "ETH" }),
  ]);
  await expect(dialog.getByRole("combobox", { name: "Classe", exact: true })).toHaveValue("Cripto");
  await expect(dialog.getByRole("combobox", { name: "Subclasse" })).toHaveValue("Altcoin");
  await dialog.getByRole("textbox", { name: "Quantidade" }).fill("0,5");
  await expect(dialog.getByText(/R\$\s5\.000,00 a R\$\s10\.000,00/)).toBeVisible();
  await expect(add).toBeEnabled();

  // Não encontrado bloqueia a inclusão.
  await ticker.fill("ZZZ");
  await expect(status).toHaveAttribute("data-ticker-status", "not-found");
  await expect(add).toBeDisabled();

  // Provedor indisponível permite incluir com a cotação digitada.
  await kind.click();
  await page.getByRole("option", { name: /ETF dos EUA/ }).click();
  await expect(dialog.getByRole("combobox", { name: "Subclasse" })).toHaveValue("Ações EUA");
  await ticker.fill("QQQ");
  await expect(status).toHaveAttribute("data-ticker-status", "unavailable");
  await expect(status).toContainText("Finnhub indisponível");
  await expect(add).toBeDisabled();
  await dialog.getByRole("textbox", { name: "Cotação em R$" }).fill("2550");
  await expect(add).toBeEnabled();

  // Na B3 o sufixo do Alpha Vantage é acrescentado.
  await kind.click();
  await page.getByRole("option", { name: /ETF da B3/ }).click();
  await ticker.fill("bova11");
  await expect(status).toHaveAttribute("data-ticker-status", "not-found");
  expect(requests.at(-1)).toEqual(expect.objectContaining({ kind: "br-etf", ticker: "BOVA11.SAO" }));

  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Sair da edição" }).click();
});

test("renda fixa pede subclasse e duração e mostra o vencimento", async ({ page }) => {
  await page.goto("/posicoes");
  const dialog = await openAddDialog(page);
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "inter", /^Inter$/);
  await pick(page, dialog.getByRole("combobox", { name: "Ativo" }), "CDB Teste 2099", "Criar “CDB Teste 2099”");
  await dialog.getByRole("combobox", { name: "Tipo do ativo" }).click();
  await page.getByRole("option", { name: /Renda fixa/ }).click();

  await expect(dialog.getByRole("textbox", { name: "Ticker" })).toHaveCount(0);
  await expect(dialog.getByRole("combobox", { name: "Classe", exact: true })).toHaveValue("Renda Fixa");
  await dialog.getByLabel("Vencimento").fill("2099-12-31");
  await dialog.getByRole("textbox", { name: "Saldo (R$)" }).fill("1500,25");
  const add = dialog.getByRole("button", { name: "Adicionar" });
  await expect(add).toBeDisabled();

  await dialog.getByRole("combobox", { name: "Subclasse" }).click();
  await page.getByRole("option", { name: "IPCA", exact: true }).click();
  await expect(add).toBeDisabled();
  await dialog.getByRole("combobox", { name: "Duração" }).click();
  await page.getByRole("option", { name: "Longo", exact: true }).click();
  await expect(add).toBeEnabled();
  await add.click();
  await expect(dialog).toHaveCount(0);

  // A posição pendente já mostra o ativo novo com o vencimento e o rateio.
  const row = page.getByRole("row").filter({ hasText: "CDB Teste 2099" });
  await expect(row).toContainText("nova");
  await expect(row).toContainText("vence em Dez/99");
  await expect(page.getByText("1 alteração pendente")).toBeVisible();

  await page.getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByRole("row").filter({ hasText: "CDB Teste 2099" })).toHaveCount(0);
  await expect(page.locator("[data-edit-cell]")).toHaveCount(0);
});
