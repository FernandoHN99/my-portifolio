import { expect, test, type Page } from "@playwright/test";

import type { TickerCheckRequest, TickerCheckResponse } from "@/modules/quotes/domain/ticker-check";

import { stubQuoteChecks } from "./support/quote-checks";

// Os cenários nunca salvam: abrem o diálogo, preenchem, conferem os estados e
// cancelam ou descartam. A checagem de ticker é substituída por respostas fixas,
// porque a rota real consulta provedores.
test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

const TOKEN = "00000000-0000-4000-8000-000000000026";

async function stubTickerCheck(
  page: Page,
  respond: (request: TickerCheckRequest, attempt: number) => TickerCheckResponse | "fail",
) {
  const requests: TickerCheckRequest[] = [];

  await page.route("**/api/quotes/ticker-check", async (route) => {
    const body = route.request().postDataJSON() as TickerCheckRequest;
    requests.push(body);
    const response = respond(body, requests.length);

    if (response === "fail") {
      await route.fulfill({ status: 500, json: { message: "Não foi possível conferir o ticker agora." } });
      return;
    }

    await route.fulfill({ json: response });
  });

  return requests;
}

function found(ticker: string, provider: string, priceBrl: number, name: string | null = null): TickerCheckResponse {
  return { status: "found", symbol: ticker, provider, priceBrl, name, quoteDate: "2026-10-02", token: TOKEN };
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

// Nome do ativo em texto livre (spec 040).
async function nameAsset(dialog: ReturnType<Page["getByRole"]>, name: string) {
  await dialog.getByRole("textbox", { name: "Nome do ativo" }).fill(name);
}

async function chooseKind(page: Page, dialog: ReturnType<Page["getByRole"]>, kind: RegExp) {
  await dialog.getByRole("combobox", { name: "Tipo do ativo" }).click();
  await page.getByRole("option", { name: kind }).click();
}

// Encontrado numa competência que não é a do mês corrente pede a cotação do
// mês. A competência mais recente pode ser ou não a do mês corrente.
async function fillMonthQuoteIfAsked(dialog: ReturnType<Page["getByRole"]>, valueBrl: string) {
  const status = dialog.locator("[data-ticker-status]");

  if ((await status.textContent())?.includes("Informe a cotação")) {
    await dialog.getByRole("textbox", { name: "Cotação em R$" }).fill(valueBrl);
  }
}

async function leaveEditMode(page: Page) {
  await page.getByRole("button", { name: "Sair da edição" }).click();
  await expect(page.locator("[data-edit-cell]")).toHaveCount(0);
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

test("num mês fechado não há adicionar posição", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-08");
  await expect(page.getByTestId("month-locked")).toBeVisible();
  await expect(page.getByRole("button", { name: "Adicionar posição" })).toHaveCount(0);
});

test("o tipo vem primeiro e a instituição aceita valor novo, sem conta", async ({ page }) => {
  await page.goto("/posicoes");
  const dialog = await openAddDialog(page);

  // Antes do tipo, só o tipo aparece (spec 040).
  await expect(dialog.getByRole("combobox", { name: "Instituição" })).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "Nome do ativo" })).toHaveCount(0);
  await chooseKind(page, dialog, /Renda fixa/);
  await expect(dialog.getByRole("textbox", { name: "Ticker" })).toHaveCount(0);
  await expect(dialog.getByRole("combobox", { name: "Conta" })).toHaveCount(0);

  // Um nome existente, sem acento ou maiúscula, não oferece criar.
  const institution = dialog.getByRole("combobox", { name: "Instituição" });
  await institution.click();
  await page.keyboard.type("itau");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option", { name: "Itaú" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Corretora Teste");
  await page.getByRole("option", { name: "Criar “Corretora Teste”" }).click();
  await expect(institution).toHaveValue("Corretora Teste");

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
      return found("ETH", "coingecko", 10000, "Ethereum");
    }
    if (ticker === "QQQ") {
      return { status: "unavailable", symbol: "QQQ", provider: "finnhub", code: "NETWORK_ERROR", message: "Não foi possível conectar ao provedor.", token: TOKEN };
    }
    return { status: "not-found", symbol: ticker, provider: kind === "crypto" ? "coingecko" : "yahoo", message: `Não encontrou o ticker ${ticker}.` };
  });
  await page.goto("/posicoes");
  const dialog = await openAddDialog(page);
  const add = dialog.getByRole("button", { name: "Adicionar" });
  const kind = dialog.getByRole("combobox", { name: "Tipo do ativo" });
  const ticker = dialog.getByRole("textbox", { name: "Ticker" });
  const status = dialog.locator("[data-ticker-status]");

  await kind.click();
  await page.getByRole("option", { name: /Cripto/ }).click();
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "inter", /^Inter$/);
  await nameAsset(dialog, "Ethereum");
  await ticker.click();
  // A checagem espera a digitação terminar e consulta uma vez só: as teclas
  // seguidas chegam bem antes do meio segundo de espera.
  await page.keyboard.type("eth");
  await expect(ticker).toHaveValue("ETH");
  await expect(status).toHaveAttribute("data-ticker-status", "found");
  await expect(status).toContainText("ETH encontrado (Ethereum)");
  expect(requests.filter((request) => request.ticker.startsWith("E"))).toEqual([
    expect.objectContaining({ kind: "crypto", ticker: "ETH" }),
  ]);
  await expect(dialog.getByRole("region", { name: "Novo ativo" })).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Classe", exact: true })).toHaveValue("Cripto");
  await expect(dialog.getByRole("combobox", { name: "Subclasse" })).toHaveValue("Altcoin");
  await fillMonthQuoteIfAsked(dialog, "10000");
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

  // Na B3 o símbolo guardado leva o sufixo .SAO.
  await kind.click();
  await page.getByRole("option", { name: /ETF da B3/ }).click();
  // Só o ticker completo da B3 é conferido, sem consultar o provedor a cada
  // tecla.
  const sent = requests.length;
  await ticker.fill("BOVA");
  await expect(status).toContainText("Digite o ticker completo");
  await expect(add).toBeDisabled();
  expect(requests).toHaveLength(sent);
  await ticker.fill("bova11");
  await expect(status).toHaveAttribute("data-ticker-status", "not-found");
  expect(requests.at(-1)).toEqual(expect.objectContaining({ kind: "br-etf", ticker: "BOVA11.SAO" }));

  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Sair da edição" }).click();
});

test("renda fixa pede subclasse e resgate e mostra o vencimento", async ({ page }) => {
  await page.goto("/posicoes");
  const dialog = await openAddDialog(page);
  await chooseKind(page, dialog, /Renda fixa/);
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "inter", /^Inter$/);
  await nameAsset(dialog, "CDB Teste 2099");

  await expect(dialog.getByRole("textbox", { name: "Ticker" })).toHaveCount(0);
  await expect(dialog.getByRole("combobox", { name: "Classe", exact: true })).toHaveValue("Renda Fixa");
  await dialog.getByLabel("Vencimento").fill("2099-12-31");
  await dialog.getByRole("textbox", { name: "Saldo (R$)" }).fill("1500,25");
  const add = dialog.getByRole("button", { name: "Adicionar" });
  await expect(add).toBeDisabled();

  await dialog.getByRole("combobox", { name: "Subclasse" }).click();
  await page.getByRole("option", { name: "IPCA", exact: true }).click();
  await expect(add).toBeDisabled();
  await dialog.getByRole("combobox", { name: "Resgate" }).click();
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

test("ticker já cotado no mês e símbolo de outro provedor", async ({ page }) => {
  const requests = await stubTickerCheck(page, ({ ticker }) =>
    ticker === "VOO"
      ? { status: "known", symbol: "VOO", priceBrl: 3000 }
      : { status: "conflict", symbol: ticker, message: `${ticker} já é cotado na carteira por outro provedor (CoinGecko). Escolha o tipo correspondente.` },
  );
  await page.goto("/posicoes");
  const dialog = await openAddDialog(page);
  await chooseKind(page, dialog, /ETF dos EUA/);
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "inter", /^Inter$/);
  await nameAsset(dialog, "Vanguard Teste");
  const ticker = dialog.getByRole("textbox", { name: "Ticker" });
  const status = dialog.locator("[data-ticker-status]");
  const add = dialog.getByRole("button", { name: "Adicionar" });

  await ticker.fill("VOO");
  await expect(status).toHaveAttribute("data-ticker-status", "known");
  await expect(status).toContainText("VOO já tem cotação nesta competência");
  await expect(dialog.getByRole("textbox", { name: "Cotação em R$" })).toHaveCount(0);
  await dialog.getByRole("textbox", { name: "Quantidade" }).fill("2");
  await expect(dialog.getByText(/R\$\s6\.000,00 a R\$\s3\.000,00/)).toBeVisible();
  await expect(add).toBeEnabled();

  await ticker.fill("BTC");
  await expect(status).toHaveAttribute("data-ticker-status", "conflict");
  await expect(status).toContainText("outro provedor");
  await expect(add).toBeDisabled();
  expect(requests.map((request) => request.ticker)).toEqual(["VOO", "BTC"]);

  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await leaveEditMode(page);
});

test("numa competência passada, o ticker encontrado pede a cotação do mês", async ({ page }) => {
  await stubTickerCheck(page, () => found("ETH", "coingecko", 10000, "Ethereum"));
  // Precisa de um mês passado aberto (spec 034); abrir grava no banco, então o
  // cenário só roda quando os dados reais já têm um.
  await page.goto("/posicoes?mes=2026-08");
  await expect(page.getByTestId("month-lock")).toBeVisible();
  test.skip((await page.getByRole("button", { name: "Adicionar posição" }).count()) === 0, "Ago/26 está fechado.");
  const dialog = await openAddDialog(page);
  await chooseKind(page, dialog, /Cripto/);
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "inter", /^Inter$/);
  await nameAsset(dialog, "Ethereum");
  await dialog.getByRole("textbox", { name: "Ticker" }).fill("ETH");

  const status = dialog.locator("[data-ticker-status]");
  await expect(status).toHaveAttribute("data-ticker-status", "found");
  await expect(status).toContainText("hoje. Informe a cotação de");
  await dialog.getByRole("textbox", { name: "Quantidade" }).fill("2");
  const add = dialog.getByRole("button", { name: "Adicionar" });
  await expect(add).toBeDisabled();
  await dialog.getByRole("textbox", { name: "Cotação em R$" }).fill("9500,50");
  await expect(dialog.getByText(/R\$\s19\.001,00 a R\$\s9\.500,50/)).toBeVisible();
  await expect(add).toBeEnabled();

  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await leaveEditMode(page);
});

test("uma falha da checagem oferece tentar de novo", async ({ page }) => {
  const requests = await stubTickerCheck(page, (_request, attempt) =>
    attempt === 1 ? "fail" : found("QQQ", "finnhub", 2550),
  );
  await page.goto("/posicoes");
  const dialog = await openAddDialog(page);
  await chooseKind(page, dialog, /ETF dos EUA/);
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "inter", /^Inter$/);
  await nameAsset(dialog, "Invesco Teste");
  await dialog.getByRole("textbox", { name: "Ticker" }).fill("QQQ");

  const status = dialog.locator("[data-ticker-status]");
  await expect(status).toHaveAttribute("data-ticker-status", "error");
  await expect(status).toContainText("Não foi possível conferir o ticker agora.");
  await expect(dialog.getByRole("button", { name: "Adicionar" })).toBeDisabled();
  await status.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(status).toHaveAttribute("data-ticker-status", "found");
  await expect(status).toContainText("QQQ encontrado no Finnhub");
  expect(requests).toHaveLength(2);

  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await leaveEditMode(page);
});

test("saldo em dólar reaproveita o ativo existente ou o novo de outra posição", async ({ page }) => {
  await page.goto("/posicoes");
  let dialog = await openAddDialog(page);
  await chooseKind(page, dialog, /Saldo em dólar/);
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "inter", /^Inter$/);
  await nameAsset(dialog, "Time Deposit");

  await expect(dialog.getByRole("textbox", { name: "Ticker" })).toHaveCount(0);
  // Sem vencimento é o Time Deposit importado: a inclusão usa o ativo existente
  // em vez de recusar (spec 040).
  const existing = dialog.locator("[data-asset-existing]");
  await expect(existing).toContainText("Time Deposit já existe");
  await expect(dialog.getByRole("region", { name: "Novo ativo" })).toHaveCount(0);

  // Com vencimento é um ativo novo.
  await dialog.getByLabel("Vencimento").fill("2027-01-15");
  await expect(existing).toHaveCount(0);
  await expect(dialog.getByRole("combobox", { name: "Classe", exact: true })).toHaveValue("Caixa");
  await dialog.getByRole("textbox", { name: "Saldo (US$)" }).fill("1000");
  const add = dialog.getByRole("button", { name: "Adicionar" });
  await expect(add).toBeEnabled();
  await add.click();
  await expect(dialog).toHaveCount(0);

  // Em outra instituição, o mesmo nome e vencimento é o ativo novo pendente.
  dialog = await openAddDialog(page);
  await chooseKind(page, dialog, /Saldo em dólar/);
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "itau", /^Itaú$/);
  await nameAsset(dialog, "Time Deposit");
  await dialog.getByLabel("Vencimento").fill("2027-01-15");
  await expect(dialog.locator("[data-asset-existing]")).toContainText("ativo novo de outra posição");
  await dialog.getByRole("textbox", { name: "Saldo (US$)" }).fill("500");
  await expect(dialog.getByRole("button", { name: "Adicionar" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Adicionar" }).click();

  const rows = page.getByRole("row").filter({ hasText: "Time Deposit" }).filter({ hasText: "vence em Jan/27" });
  await expect(rows).toHaveCount(2);
  await expect(page.getByText("2 alterações pendentes")).toBeVisible();
  await page.getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByRole("row").filter({ hasText: "vence em Jan/27" })).toHaveCount(0);
  await expect(page.locator("[data-edit-cell]")).toHaveCount(0);
});

test("renda fixa de nome existente é reaproveitada só na instituição dela", async ({ page }) => {
  await page.goto("/posicoes");
  const dialog = await openAddDialog(page);
  await chooseKind(page, dialog, /Renda fixa/);
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "inter", /^Inter$/);
  await nameAsset(dialog, "LCI BRB");

  // A LCI BRB do Inter já existe: a inclusão usa esse ativo.
  const existing = dialog.locator("[data-asset-existing]");
  await expect(existing).toContainText("LCI BRB já existe");

  // Sem ticker, o ativo é da instituição: no Itaú, o mesmo nome é um ativo novo.
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "itau", /^Itaú$/);
  await expect(existing).toHaveCount(0);
  await expect(dialog.getByRole("region", { name: "Novo ativo" })).toBeVisible();

  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await leaveEditMode(page);
});

test("um cripto com várias moedas no mesmo símbolo pede a escolha da moeda", async ({ page }) => {
  const coins = [
    { id: "uniswap", name: "Uniswap" },
    { id: "unicorn-token", name: "Unicorn Token" },
  ];
  const requests = await stubTickerCheck(page, ({ ticker, coinId }) => {
    const coin = coins.find((candidate) => candidate.id === coinId) ?? coins[0];
    return { ...found(ticker, "coingecko", coin.id === "uniswap" ? 40 : 0.5, coin.name), coinId: coin.id, coins };
  });
  await page.goto("/posicoes");
  const dialog = await openAddDialog(page);
  await chooseKind(page, dialog, /Cripto/);
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "inter", /^Inter$/);
  await nameAsset(dialog, "Uni");
  await dialog.getByRole("textbox", { name: "Ticker" }).fill("UNI");

  const status = dialog.locator("[data-ticker-status]");
  await expect(status).toContainText("UNI encontrado (Uniswap)");
  const coin = dialog.getByRole("combobox", { name: "Moeda na CoinGecko" });
  await expect(coin).toHaveValue("Uniswap");

  await coin.click();
  await page.getByRole("option", { name: /Unicorn Token/ }).click();
  await expect(status).toContainText("UNI encontrado (Unicorn Token)");
  expect(requests.at(-1)).toEqual(expect.objectContaining({ ticker: "UNI", coinId: "unicorn-token" }));
  await expect(coin).toHaveValue("Unicorn Token");

  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await leaveEditMode(page);
});
