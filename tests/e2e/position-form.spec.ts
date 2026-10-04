import { expect, test, type Page } from "@playwright/test";

import type { TickerCheckRequest, TickerCheckResponse } from "@/modules/quotes/domain/ticker-check";

import {
  chooseKind,
  formTab,
  issueCount,
  openAddForm,
  openEditableMonth,
  openEditForm,
  pick,
  positionRow,
} from "./support/position-form";
import { stubQuoteChecks } from "./support/quote-checks";

// Formulário único da posição (spec 043): incluir e editar pela mesma
// estrutura, em abas. Os cenários nunca salvam: preenchem, conferem e cancelam.
// A checagem de ticker é substituída por respostas fixas, porque a rota real
// consulta provedores. Só o mês aberto aceita edição; com o mais recente
// fechado nos dados reais, os cenários que editam ficam pulados.
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

async function openPositions(page: Page) {
  test.skip(!(await openEditableMonth(page)), "O mês mais recente e o anterior estão fechados nos dados reais.");
}

test("incluir abre o formulário com as abas Geral, Ativo e Rateio", async ({ page }) => {
  await openPositions(page);
  // Sem modo de edição: a tabela não tem campos abertos (spec 043).
  await expect(page.getByRole("button", { name: "Editar posições" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: /^(Quantidade|Saldo) de / })).toHaveCount(0);

  const dialog = await openAddForm(page);
  await expect(formTab(dialog, "Geral")).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("combobox", { name: "Tipo do ativo" })).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Conta" })).toHaveCount(0);

  // Sem o tipo, Ativo e Rateio ficam com cadeado e não abrem (spec 048).
  for (const name of ["Ativo", "Rateio"] as const) {
    await expect(formTab(dialog, name)).toHaveAttribute("data-locked", "");
    await expect(formTab(dialog, name)).toHaveAttribute("aria-disabled", "true");
  }
  await formTab(dialog, "Ativo").click({ force: true });
  await expect(formTab(dialog, "Geral")).toHaveAttribute("aria-selected", "true");

  // Adicionar com pendências não salva: leva à aba e mostra o que falta.
  await dialog.getByRole("button", { name: "Adicionar" }).click();
  await expect(formTab(dialog, "Geral")).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByTestId("position-form-issue")).toContainText("Geral: Escolha o tipo do ativo.");

  // Com o tipo, as abas se abrem e o rateio já vem com 100%.
  await chooseKind(page, dialog, /Renda fixa/);
  await expect(formTab(dialog, "Ativo")).not.toHaveAttribute("data-locked");
  await expect(formTab(dialog, "Rateio")).toContainText("100%");
  await formTab(dialog, "Ativo").click();
  await expect(formTab(dialog, "Ativo")).toHaveAttribute("aria-selected", "true");

  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toHaveCount(0);
});

test("num mês fechado não há incluir, lápis nem lixeira", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-08");
  await expect(page.getByTestId("month-locked")).toBeVisible();
  await expect(page.getByRole("button", { name: "Adicionar posição" })).toHaveCount(0);
  await expect(positionRow(page, "Bitcoin 01").getByRole("button", { name: "Editar Bitcoin 01" })).toHaveCount(0);
  await expect(positionRow(page, "Bitcoin 01").getByRole("button", { name: "Remover Bitcoin 01" })).toHaveCount(0);
});

test("o tipo vem primeiro e a instituição aceita valor novo", async ({ page }) => {
  await openPositions(page);
  const dialog = await openAddForm(page);
  await chooseKind(page, dialog, /Renda fixa/);

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

  // Renda fixa não tem ticker; o vencimento fica na aba Ativo.
  await formTab(dialog, "Ativo").click();
  await expect(dialog.getByRole("textbox", { name: "Ticker" })).toHaveCount(0);
  await expect(dialog.getByLabel("Vencimento")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
});

test("o ticker de um ativo novo é conferido no provedor do tipo", async ({ page }) => {
  const requests = await stubTickerCheck(page, ({ kind, ticker }) => {
    // Um cripto que a carteira não tem: o Ethereum já existe desde a spec 041.
    if (ticker === "LINK") {
      return found("LINK", "coingecko", 10000, "Chainlink");
    }
    if (ticker === "QQQ") {
      return { status: "unavailable", symbol: "QQQ", provider: "finnhub", code: "NETWORK_ERROR", message: "Não foi possível conectar ao provedor.", token: TOKEN };
    }
    return { status: "not-found", symbol: ticker, provider: kind === "crypto" ? "coingecko" : "yahoo", message: `Não encontrou o ticker ${ticker}.` };
  });
  await openPositions(page);
  const dialog = await openAddForm(page);
  const ticker = dialog.getByRole("textbox", { name: "Ticker" });
  const status = dialog.locator("[data-ticker-status]");

  await chooseKind(page, dialog, /Cripto/);
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "inter", /^Inter$/);
  await dialog.getByRole("textbox", { name: "Nome do ativo" }).fill("Chainlink");
  await dialog.getByRole("textbox", { name: "Quantidade" }).fill("0,5");

  await formTab(dialog, "Ativo").click();
  await ticker.click();
  // A checagem espera a digitação terminar e consulta uma vez só.
  await page.keyboard.type("link");
  await expect(ticker).toHaveValue("LINK");
  await expect(status).toHaveAttribute("data-ticker-status", "found");
  await expect(status).toContainText("LINK encontrado (Chainlink)");
  expect(requests.filter((request) => request.ticker.startsWith("L"))).toEqual([
    expect.objectContaining({ kind: "crypto", ticker: "LINK" }),
  ]);
  await expect(dialog.getByText("Ativo novo: Chainlink, criado ao salvar.")).toBeVisible();
  await expect(dialog.getByText("Altcoins", { exact: true })).toBeVisible();
  if ((await status.textContent())?.includes("Informe a cotação")) {
    await dialog.getByRole("textbox", { name: "Cotação em R$" }).fill("10000");
  }

  // O rateio do tipo vem preenchido: Cripto, Altcoin.
  await formTab(dialog, "Rateio").click();
  await expect(dialog.getByRole("combobox", { name: "Classe da classificação 1", exact: true })).toHaveValue("Cripto");
  await expect(dialog.getByRole("combobox", { name: "Subclasse da classificação 1", exact: true })).toHaveValue("Altcoin");
  await expect(issueCount(dialog)).toHaveAttribute("data-issue-count", "0");
  await formTab(dialog, "Geral").click();
  await expect(dialog.getByTestId("position-form-total")).toHaveText(/R\$\s5\.000,00 a R\$\s10\.000,00/);

  // Não encontrado impede salvar.
  await formTab(dialog, "Ativo").click();
  await ticker.fill("ZZZ");
  await expect(status).toHaveAttribute("data-ticker-status", "not-found");
  await expect(issueCount(dialog)).toHaveAttribute("data-issue-count", "1");

  // Provedor indisponível permite incluir com a cotação digitada.
  await formTab(dialog, "Geral").click();
  await chooseKind(page, dialog, /ETF dos EUA/);
  await formTab(dialog, "Ativo").click();
  await ticker.fill("QQQ");
  await expect(status).toHaveAttribute("data-ticker-status", "unavailable");
  await expect(status).toContainText("Finnhub indisponível");
  await expect(issueCount(dialog)).not.toHaveAttribute("data-issue-count", "0");
  await dialog.getByRole("textbox", { name: "Cotação em R$" }).fill("2550");

  // Na B3 só o ticker completo é conferido; o símbolo guardado leva .SAO.
  await formTab(dialog, "Geral").click();
  await chooseKind(page, dialog, /ETF da B3/);
  await formTab(dialog, "Ativo").click();
  const sent = requests.length;
  await ticker.fill("BOVA");
  await expect(status).toContainText("Digite o ticker completo");
  expect(requests).toHaveLength(sent);
  await ticker.fill("bova11");
  await expect(status).toHaveAttribute("data-ticker-status", "not-found");
  expect(requests.at(-1)).toEqual(expect.objectContaining({ kind: "br-etf", ticker: "BOVA11.SAO" }));

  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toHaveCount(0);
});

test("o rateio pede classificações completas que somem 100%", async ({ page }) => {
  await openPositions(page);
  const dialog = await openAddForm(page);
  await chooseKind(page, dialog, /Renda fixa/);
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "inter", /^Inter$/);
  await dialog.getByRole("textbox", { name: "Nome do ativo" }).fill("CDB Teste 2099");
  await dialog.getByRole("textbox", { name: "Saldo (R$)" }).fill("1500,25");

  // Renda fixa começa sem subclasse nem resgate: Adicionar leva ao rateio.
  await dialog.getByRole("button", { name: "Adicionar" }).click();
  await expect(formTab(dialog, "Rateio")).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByTestId("position-form-issue")).toContainText("Rateio: Preencha classe, subclasse");

  await expect(dialog.getByRole("combobox", { name: "Classe da classificação 1", exact: true })).toHaveValue("Renda Fixa");
  await dialog.getByRole("combobox", { name: "Subclasse da classificação 1", exact: true }).click();
  await page.getByRole("option", { name: "IPCA", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Resgate da classificação 1", exact: true }).click();
  await page.getByRole("option", { name: "Longo", exact: true }).click();
  await expect(issueCount(dialog)).toHaveAttribute("data-issue-count", "0");

  // Uma segunda classificação começa com o que falta para 100%.
  await dialog.getByRole("button", { name: "Adicionar classificação" }).click();
  await expect(dialog.getByRole("textbox", { name: "Peso da classificação 2" })).toHaveValue("0");
  await dialog.getByRole("textbox", { name: "Peso da classificação 1" }).fill("60");
  await dialog.getByRole("textbox", { name: "Peso da classificação 2" }).fill("30");
  await expect(dialog.getByText("Soma: 90% · faltam 10%")).toBeVisible();
  await expect(formTab(dialog, "Rateio")).toContainText("90%");
  await dialog.getByRole("button", { name: "Remover classificação 2" }).click();
  await dialog.getByRole("textbox", { name: "Peso da classificação 1" }).fill("100");
  await expect(dialog.getByText("Soma: 100%")).toBeVisible();

  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("row").filter({ hasText: "CDB Teste 2099" })).toHaveCount(0);
});

test("ticker já cotado no mês e símbolo de outro provedor", async ({ page }) => {
  const requests = await stubTickerCheck(page, ({ ticker }) =>
    ticker === "VOO"
      ? { status: "known", symbol: "VOO", priceBrl: 3000 }
      : { status: "conflict", symbol: ticker, message: `${ticker} já é cotado na carteira por outro provedor (CoinGecko). Escolha o tipo correspondente.` },
  );
  await openPositions(page);
  const dialog = await openAddForm(page);
  await chooseKind(page, dialog, /ETF dos EUA/);
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "inter", /^Inter$/);
  await dialog.getByRole("textbox", { name: "Nome do ativo" }).fill("Vanguard Teste");
  await dialog.getByRole("textbox", { name: "Quantidade" }).fill("2");
  await formTab(dialog, "Ativo").click();
  const ticker = dialog.getByRole("textbox", { name: "Ticker" });
  const status = dialog.locator("[data-ticker-status]");

  await ticker.fill("VOO");
  await expect(status).toHaveAttribute("data-ticker-status", "known");
  await expect(status).toContainText("VOO já tem cotação nesta competência");
  await expect(dialog.getByRole("textbox", { name: "Cotação em R$" })).toHaveCount(0);
  await expect(issueCount(dialog)).toHaveAttribute("data-issue-count", "0");
  await formTab(dialog, "Geral").click();
  await expect(dialog.getByTestId("position-form-total")).toHaveText(/R\$\s6\.000,00 a R\$\s3\.000,00/);

  await formTab(dialog, "Ativo").click();
  await ticker.fill("BTC");
  await expect(status).toHaveAttribute("data-ticker-status", "conflict");
  await expect(status).toContainText("outro provedor");
  await expect(issueCount(dialog)).toHaveAttribute("data-issue-count", "1");
  expect(requests.map((request) => request.ticker)).toEqual(["VOO", "BTC"]);

  await dialog.getByRole("button", { name: "Cancelar" }).click();
});

test("numa competência passada, o ticker encontrado pede a cotação do mês", async ({ page }) => {
  await stubTickerCheck(page, () => found("LINK", "coingecko", 10000, "Chainlink"));
  // Precisa de um mês passado aberto (spec 034); abrir grava no banco, então o
  // cenário só roda quando os dados reais já têm um.
  await page.goto("/posicoes?mes=2026-08");
  await expect(page.getByTestId("month-lock")).toBeVisible();
  test.skip((await page.getByRole("button", { name: "Adicionar posição" }).count()) === 0, "Ago/26 está fechado.");
  const dialog = await openAddForm(page);
  await chooseKind(page, dialog, /Cripto/);
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "inter", /^Inter$/);
  await dialog.getByRole("textbox", { name: "Nome do ativo" }).fill("Chainlink");
  await dialog.getByRole("textbox", { name: "Quantidade" }).fill("2");
  await formTab(dialog, "Ativo").click();
  await dialog.getByRole("textbox", { name: "Ticker" }).fill("LINK");

  const status = dialog.locator("[data-ticker-status]");
  await expect(status).toHaveAttribute("data-ticker-status", "found");
  await expect(status).toContainText("hoje. Informe a cotação de");
  await expect(issueCount(dialog)).toHaveAttribute("data-issue-count", "1");
  await dialog.getByRole("textbox", { name: "Cotação em R$" }).fill("9500,50");
  await expect(issueCount(dialog)).toHaveAttribute("data-issue-count", "0");
  await formTab(dialog, "Geral").click();
  await expect(dialog.getByTestId("position-form-total")).toHaveText(/R\$\s19\.001,00 a R\$\s9\.500,50/);

  await dialog.getByRole("button", { name: "Cancelar" }).click();
});

test("uma falha da checagem oferece tentar de novo", async ({ page }) => {
  const requests = await stubTickerCheck(page, (_request, attempt) =>
    attempt === 1 ? "fail" : found("QQQ", "finnhub", 2550),
  );
  await openPositions(page);
  const dialog = await openAddForm(page);
  await chooseKind(page, dialog, /ETF dos EUA/);
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "inter", /^Inter$/);
  await dialog.getByRole("textbox", { name: "Nome do ativo" }).fill("Invesco Teste");
  await formTab(dialog, "Ativo").click();
  await dialog.getByRole("textbox", { name: "Ticker" }).fill("QQQ");

  const status = dialog.locator("[data-ticker-status]");
  await expect(status).toHaveAttribute("data-ticker-status", "error");
  await expect(status).toContainText("Não foi possível conferir o ticker agora.");
  await status.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(status).toHaveAttribute("data-ticker-status", "found");
  await expect(status).toContainText("QQQ encontrado no Finnhub");
  expect(requests).toHaveLength(2);

  await dialog.getByRole("button", { name: "Cancelar" }).click();
});

test("um ativo existente é reaproveitado com o rateio dele", async ({ page }) => {
  await openPositions(page);
  const dialog = await openAddForm(page);
  await chooseKind(page, dialog, /Caixa em dólar/);
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "itau", /^Itaú$/);
  await dialog.getByRole("textbox", { name: "Nome do ativo" }).fill("Time Deposit");

  // Sem vencimento é o Time Deposit que já existe: a inclusão usa esse ativo
  // e o rateio da posição mais recente dele (spec 040).
  const existing = dialog.locator("[data-asset-existing]");
  await expect(existing).toContainText("Time Deposit já existe");
  await formTab(dialog, "Ativo").click();
  await expect(dialog.getByRole("textbox", { name: "Ticker" })).toHaveCount(0);
  await expect(dialog.getByText("Liquidez do ativo")).toBeVisible();
  await formTab(dialog, "Rateio").click();
  await expect(dialog.getByRole("combobox", { name: "Classe da classificação 1", exact: true })).toHaveValue("Caixa");
  await expect(dialog.getByRole("combobox", { name: "Resgate da classificação 1", exact: true })).toHaveValue("Curto");

  // Com vencimento, é um ativo novo.
  await formTab(dialog, "Ativo").click();
  await dialog.getByLabel("Vencimento").fill("2027-01-15");
  await expect(existing).toHaveCount(0);
  await expect(dialog.getByText("Ativo novo: Time Deposit, criado ao salvar.")).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Liquidez" })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
});

test("renda fixa de nome existente é reaproveitada só na instituição dela", async ({ page }) => {
  await openPositions(page);
  const dialog = await openAddForm(page);
  await chooseKind(page, dialog, /Renda fixa/);
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "inter", /^Inter$/);
  await dialog.getByRole("textbox", { name: "Nome do ativo" }).fill("LCI BRB - Set/26");

  // A LCI BRB - Set/26 do Inter já existe e já tem posição no mês.
  await dialog.getByRole("textbox", { name: "Saldo (R$)" }).fill("100");
  const existing = dialog.locator("[data-asset-existing]");
  await expect(existing).toContainText("LCI BRB - Set/26 já existe");
  await dialog.getByRole("button", { name: "Adicionar" }).click();
  await expect(dialog.getByTestId("position-form-issue")).toContainText("Este ativo já tem posição nesta instituição.");

  // Sem ticker, o ativo é da instituição: no Itaú, o mesmo nome é um ativo novo.
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "itau", /^Itaú$/);
  await expect(existing).toHaveCount(0);
  await expect(dialog.getByText("Ativo novo: LCI BRB - Set/26, criado ao salvar.")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
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
  await openPositions(page);
  const dialog = await openAddForm(page);
  await chooseKind(page, dialog, /Cripto/);
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "inter", /^Inter$/);
  await dialog.getByRole("textbox", { name: "Nome do ativo" }).fill("Uni");
  await formTab(dialog, "Ativo").click();
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
});

test("o lápis da linha abre o mesmo formulário com a posição preenchida", async ({ page }) => {
  await openPositions(page);
  const dialog = await openEditForm(page, "Bitcoin 01", "Ledger");

  // Tipo e instituição ficam só para leitura; nome e estratégia podem mudar. A
  // quantidade só muda por movimentações (spec 057): aparece sem campo.
  await expect(dialog.getByRole("combobox", { name: "Tipo do ativo" })).toHaveCount(0);
  await expect(dialog.getByText("Cripto", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Nome do ativo" })).toHaveValue("Bitcoin 01");
  await expect(dialog.getByRole("textbox", { name: "Quantidade" })).toHaveCount(0);
  await expect(dialog.getByTestId("position-form-value-hint")).toContainText("use Movimentar");
  await expect(dialog.getByRole("combobox", { name: "Estratégia" })).toHaveValue("Core-Satellite");
  await expect(dialog.getByText("O nome é do ativo e vale para todos os meses.")).toBeVisible();

  await formTab(dialog, "Ativo").click();
  await expect(dialog.getByRole("textbox", { name: "Ticker" })).toHaveCount(0);
  await expect(dialog.getByText("BTC", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByLabel("Vencimento")).toHaveCount(0);
  await expect(dialog.getByRole("combobox", { name: "Liquidez" })).toBeVisible();

  await formTab(dialog, "Rateio").click();
  await expect(dialog.getByRole("combobox", { name: "Classe da classificação 1", exact: true })).toHaveValue("Cripto");
  await expect(dialog.getByRole("combobox", { name: "Subclasse da classificação 1", exact: true })).toHaveValue("BTC");
  await expect(issueCount(dialog)).toHaveAttribute("data-issue-count", "0");

  // Um peso que não fecha 100% impede salvar.
  await dialog.getByRole("textbox", { name: "Peso da classificação 1" }).fill("90");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(dialog.getByTestId("position-form-issue")).toContainText("Rateio: O rateio soma 90%");

  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toHaveCount(0);
});

test("a lixeira pede confirmação antes de remover", async ({ page }) => {
  await openPositions(page);
  const row = positionRow(page, "Porquinho");
  await row.hover();
  await row.getByRole("button", { name: "Remover Porquinho" }).click();

  const confirm = page.getByRole("dialog", { name: "Remover Porquinho?" });
  await expect(confirm).toContainText("dá para desfazer");
  await confirm.getByRole("button", { name: "Cancelar" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(positionRow(page, "Porquinho")).toBeVisible();
});

test("a página da posição edita pelo mesmo formulário", async ({ page }) => {
  await openPositions(page);
  await expect(page.getByRole("navigation", { name: "Competências" })).toHaveAttribute("data-hydrated");
  await positionRow(page, "Porquinho").getByRole("link", { name: "Porquinho" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Porquinho" })).toBeVisible();

  // Os lápis espalhados saíram (spec 043): tudo passa pelo formulário.
  await expect(page.getByRole("button", { name: "Renomear ativo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /liquidez$/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Editar posição" }).click();
  const dialog = page.getByRole("dialog", { name: "Editar Porquinho" });
  await expect(dialog).toBeVisible();
  // O saldo aparece sem campo: muda só por movimentações (spec 057).
  await expect(dialog.getByRole("textbox", { name: "Saldo (R$)" })).toHaveCount(0);
  await expect(dialog.getByText("Saldo (R$)")).toBeVisible();
  await formTab(dialog, "Ativo").click();
  await expect(dialog.getByLabel("Vencimento")).toBeVisible();
  // Um saldo em reais pode ser marcado como conta corrente (spec 059).
  await expect(dialog.getByRole("checkbox", { name: /Conta corrente/ })).toBeVisible();

  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toHaveCount(0);
});

test("num mês fechado, a página da posição não edita", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-08");
  await expect(page.getByRole("navigation", { name: "Competências" })).toHaveAttribute("data-hydrated");
  await positionRow(page, "Porquinho").getByRole("link", { name: "Porquinho" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Porquinho" })).toBeVisible();
  const edit = page.getByRole("button", { name: "Editar posição" });
  await expect(edit).toBeDisabled();
  await expect(edit).toHaveAttribute("title", /Ago\/26 está fechado/);
});

// Tesouro Direto (spec 061): o título é escolhido por tipo e vencimento no
// catálogo oficial, sem ticker digitado; o vencimento vem do título. Catálogo e
// conferência simulados, sem salvar.
test("o Tesouro Direto é escolhido pelo título e vencimento oficiais", async ({ page }) => {
  const bonds = [
    { symbol: "TD:TESOURO-IPCA:2032-08-15", providerId: "Tesouro IPCA+|2032-08-15", name: "Tesouro IPCA+ 2032", type: "Tesouro IPCA+", maturityDate: "2032-08-15", quoteDate: "2026-10-02", valueBrl: 2912.33 },
    { symbol: "TD:TESOURO-IPCA:2035-05-15", providerId: "Tesouro IPCA+|2035-05-15", name: "Tesouro IPCA+ 2035", type: "Tesouro IPCA+", maturityDate: "2035-05-15", quoteDate: "2026-10-02", valueBrl: 2311.05 },
  ];
  await page.route("**/api/quotes/treasury-catalog", (route) => route.fulfill({ json: { bonds, valuation: "market" } }));
  const requests = await stubTickerCheck(page, ({ ticker }) => found(ticker, "tesouro", 2912.33, "Tesouro IPCA+ 2032"));
  await openPositions(page);
  const dialog = await openAddForm(page);

  await chooseKind(page, dialog, /Tesouro Direto/);
  await formTab(dialog, "Ativo").click();
  await expect(dialog.getByRole("textbox", { name: "Ticker" })).toHaveCount(0);
  await dialog.getByRole("combobox", { name: "Título do Tesouro" }).click();
  await page.getByRole("option", { name: /Tesouro IPCA\+ 2032/ }).click();

  await expect(dialog.getByText("Preço de mercado de 02/10/2026")).toBeVisible();
  await expect(dialog.getByText("Vencimento do título")).toBeVisible();
  await expect(dialog.getByText("15/08/2032")).toBeVisible();
  await expect.poll(() => requests.at(-1)?.ticker).toBe("TD:TESOURO-IPCA:2032-08-15");
  await formTab(dialog, "Geral").click();
  await expect(dialog.getByRole("textbox", { name: "Nome do ativo" })).toHaveValue("Tesouro IPCA+ 2032");
  await dialog.getByRole("button", { name: "Cancelar" }).click();
});
