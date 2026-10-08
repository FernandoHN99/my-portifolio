import { expect, test, type Locator, type Page } from "@playwright/test";

import type { TickerCheckRequest, TickerCheckResponse } from "@/modules/quotes/domain/ticker-check";

import {
  chooseKind, closeForm, continueForm, expectFormStep, formTab, issueCount,
  openAddForm, openEditableMonth, openEditForm, openPositionPage, pick, positionRow,
} from "./support/position-form";
import { stubQuoteChecks } from "./support/quote-checks";
import { waitForCompetenceHydration } from "./support/competence";

// Spec 066: inclusão por etapas obrigatórias; edição mantém as abas de
// atributos. Os cenários preenchem e conferem sem salvar a carteira.
test.beforeEach(async ({ page }) => { await stubQuoteChecks(page); });
const TOKEN = "test-ticker-check-not-used-for-saving";

async function stubTickerCheck(page: Page, respond: (request: TickerCheckRequest, attempt: number) => TickerCheckResponse | "fail") {
  const requests: TickerCheckRequest[] = [];
  await page.route("**/api/quotes/ticker-check", async (route) => {
    const body = route.request().postDataJSON() as TickerCheckRequest;
    requests.push(body);
    const response = respond(body, requests.length);
    await route.fulfill(response === "fail"
      ? { status: 500, json: { message: "Não foi possível conferir o ticker agora." } }
      : { json: response });
  });
  return requests;
}
function found(ticker: string, provider: string, priceBrl: number, name: string | null = null): TickerCheckResponse {
  return { status: "found", symbol: ticker, provider, priceBrl, name, quoteDate: "2026-10-02", token: TOKEN };
}
async function openPositions(page: Page) {
  test.skip(!(await openEditableMonth(page)), "Nenhum mês aberto nos dados disponíveis.");
}
async function toAssetStep(page: Page, dialog: Locator, kind: RegExp) {
  await chooseKind(page, dialog, kind);
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "inter", /^Inter$/);
  await continueForm(dialog, "Ativo");
}

test("inclusão não permite pular etapas e só oferece salvar depois de conferir", async ({ page }) => {
  await openPositions(page);
  const dialog = await openAddForm(page);
  await expectFormStep(dialog, "Posição");
  await expect(dialog.getByRole("tab")).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "Nome do ativo" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Adicionar posição", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await expectFormStep(dialog, "Posição");
  await expect(dialog.getByTestId("position-form-issue")).toContainText("Escolha o tipo");
  await toAssetStep(page, dialog, /Renda fixa/);
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await expectFormStep(dialog, "Ativo");
  await expect(dialog.getByTestId("position-form-issue")).toContainText("nome do ativo");
  await dialog.getByRole("textbox", { name: "Nome do ativo" }).fill("CDB Teste 2099");
  await dialog.getByRole("textbox", { name: "Saldo (R$)" }).fill("1500,25");
  await continueForm(dialog, "Rateio");
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await expectFormStep(dialog, "Rateio");
  await expect(dialog.getByTestId("position-form-issue")).toContainText("Escolha classe, subclasse e resgate da lista");
  await dialog.getByRole("combobox", { name: "Subclasse da classificação 1", exact: true }).click();
  await page.getByRole("option", { name: "IPCA", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Resgate da classificação 1", exact: true }).click();
  await page.getByRole("option", { name: "Longo", exact: true }).click();
  await continueForm(dialog, "Conferir");
  await expect(dialog.getByRole("heading", { name: "Confira sua nova posição" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Adicionar posição", exact: true })).toBeVisible();
  await expect(dialog).toContainText("R$ 1.500,25");
  if (test.info().project.name === "mobile-safari") {
    await page.screenshot({ path: "artifacts/dialog-e2e/position-review-iphone.png" });
  }
  await dialog.getByRole("button", { name: "Voltar", exact: true }).click();
  await expectFormStep(dialog, "Rateio");
  await closeForm(dialog);
  await expect(page.getByRole("row").filter({ hasText: "CDB Teste 2099" })).toHaveCount(0);
});

test("num mês fechado não há incluir, lápis nem lixeira", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-08");
  await expect(page.getByTestId("month-locked")).toBeVisible();
  await expect(page.getByRole("button", { name: "Adicionar posição" })).toHaveCount(0);
  await expect(positionRow(page, "Bitcoin 01").getByRole("button", { name: /^(Movimentar|Liquidar|Editar|Remover) / })).toHaveCount(0);
  // Na página da posição, o mês fechado desliga a edição e esconde o remover.
  await openPositionPage(page, "Bitcoin 01");
  await expect(page.getByRole("button", { name: "Editar posição" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Remover", exact: true })).toHaveCount(0);
});

test("instituição aceita valor novo e renda fixa manual não mostra cálculo CDI", async ({ page }) => {
  await openPositions(page);
  const dialog = await openAddForm(page);
  await chooseKind(page, dialog, /Renda fixa/);
  const institution = dialog.getByRole("combobox", { name: "Instituição" });
  await institution.click();
  await page.keyboard.type("itau");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option", { name: "Itaú" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Corretora Teste");
  await page.getByRole("option", { name: "Criar “Corretora Teste”" }).click();
  await expect(institution).toHaveValue("Corretora Teste");
  await continueForm(dialog, "Ativo");
  await expect(dialog.getByRole("textbox", { name: "Ticker" })).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "Vencimento", exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Percentual do CDI" })).toHaveCount(0);
  await expect(dialog.getByLabel("Dia da aplicação")).toHaveCount(0);
  await closeForm(dialog);
});

test("ticker encontrado calcula valor atual; não encontrado bloqueia continuar", async ({ page }) => {
  const requests = await stubTickerCheck(page, ({ ticker }) => ticker === "LINK"
    ? found("LINK", "coingecko", 10000, "Chainlink")
    : { status: "not-found", symbol: ticker, provider: "coingecko", message: `Não encontrou o ticker ${ticker}.` });
  await openPositions(page);
  const dialog = await openAddForm(page);
  await toAssetStep(page, dialog, /Cripto/);
  const ticker = dialog.getByRole("textbox", { name: "Ticker" });
  const status = dialog.locator("[data-ticker-status]");
  await dialog.getByRole("textbox", { name: "Nome do ativo" }).fill("Chainlink");
  await dialog.getByRole("textbox", { name: "Quantidade" }).fill("0,5");
  await ticker.click();
  await page.keyboard.type("link");
  await expect(ticker).toHaveValue("LINK");
  await expect(status).toHaveAttribute("data-ticker-status", "found");
  await expect(status).toContainText("LINK encontrado (Chainlink)");
  expect(requests.filter((request) => request.ticker.startsWith("L"))).toEqual([expect.objectContaining({ kind: "crypto", ticker: "LINK" })]);
  if ((await status.textContent())?.includes("Informe a cotação")) await dialog.getByRole("textbox", { name: "Cotação em R$" }).fill("10000");
  await expect(dialog.getByTestId("position-form-total")).toContainText("R$ 5.000,00");
  await continueForm(dialog, "Rateio");
  await expect(dialog.getByRole("combobox", { name: "Classe da classificação 1", exact: true })).toHaveValue("Cripto");
  await expect(dialog.getByRole("combobox", { name: "Subclasse da classificação 1", exact: true })).toHaveValue("Altcoin");
  await expect(issueCount(dialog)).toHaveAttribute("data-issue-count", "0");
  await continueForm(dialog, "Conferir");
  await expect(dialog).toContainText("R$ 5.000,00");
  await dialog.getByRole("button", { name: "Voltar", exact: true }).click();
  await dialog.getByRole("button", { name: "Voltar", exact: true }).click();
  await ticker.fill("ZZZ");
  await expect(status).toHaveAttribute("data-ticker-status", "not-found");
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await expectFormStep(dialog, "Ativo");
  await expect(dialog.getByTestId("position-form-issue")).toContainText("Confira o ticker");
  await closeForm(dialog);
});

test("provedor indisponível permite continuar somente com cotação manual", async ({ page }) => {
  await stubTickerCheck(page, () => ({ status: "unavailable", symbol: "QQQ", provider: "finnhub", code: "NETWORK_ERROR", message: "Não foi possível conectar ao provedor.", token: TOKEN }));
  await openPositions(page);
  const dialog = await openAddForm(page);
  await toAssetStep(page, dialog, /ETF dos EUA/);
  await dialog.getByRole("textbox", { name: "Nome do ativo" }).fill("Invesco Teste");
  await dialog.getByRole("textbox", { name: "Quantidade" }).fill("2");
  await dialog.getByRole("textbox", { name: "Ticker" }).fill("QQQ");
  const status = dialog.locator("[data-ticker-status]");
  await expect(status).toHaveAttribute("data-ticker-status", "unavailable");
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await expectFormStep(dialog, "Ativo");
  await expect(dialog.getByTestId("position-form-issue")).toContainText("cotação em R$");
  await dialog.getByRole("textbox", { name: "Cotação em R$" }).fill("2550");
  await continueForm(dialog, "Rateio");
  await expect(issueCount(dialog)).toHaveAttribute("data-issue-count", "0");
  await closeForm(dialog);
});

test("na B3 apenas ticker completo é consultado e o símbolo leva SAO", async ({ page }) => {
  const requests = await stubTickerCheck(page, ({ ticker }) => ({ status: "not-found", symbol: ticker, provider: "yahoo", message: `Não encontrou ${ticker}.` }));
  await openPositions(page);
  const dialog = await openAddForm(page);
  await toAssetStep(page, dialog, /ETF da B3/);
  const ticker = dialog.getByRole("textbox", { name: "Ticker" });
  const status = dialog.locator("[data-ticker-status]");
  await ticker.fill("BOVA");
  await expect(status).toContainText("Digite o ticker completo");
  expect(requests).toHaveLength(0);
  await ticker.fill("bova11");
  await expect(status).toHaveAttribute("data-ticker-status", "not-found");
  expect(requests.at(-1)).toEqual(expect.objectContaining({ kind: "br-etf", ticker: "BOVA11.SAO" }));
  await closeForm(dialog);
});

test("rateio precisa somar 100% antes da conferência", async ({ page }) => {
  await openPositions(page);
  const dialog = await openAddForm(page);
  await toAssetStep(page, dialog, /Renda fixa/);
  await dialog.getByRole("textbox", { name: "Nome do ativo" }).fill("CDB Teste 2099");
  await dialog.getByRole("textbox", { name: "Saldo (R$)" }).fill("1500,25");
  await continueForm(dialog, "Rateio");
  await dialog.getByRole("combobox", { name: "Subclasse da classificação 1", exact: true }).click();
  await page.getByRole("option", { name: "IPCA", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Resgate da classificação 1", exact: true }).click();
  await page.getByRole("option", { name: "Longo", exact: true }).click();
  await dialog.getByRole("button", { name: "Adicionar classificação" }).click();
  await expect(dialog.getByRole("textbox", { name: "Peso da classificação 2" })).toHaveValue("0");
  await dialog.getByRole("textbox", { name: "Peso da classificação 1" }).fill("60");
  await dialog.getByRole("textbox", { name: "Peso da classificação 2" }).fill("30");
  await expect(dialog.getByText("Soma: 90% · faltam 10%")).toBeVisible();
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await expectFormStep(dialog, "Rateio");
  await dialog.getByRole("button", { name: "Remover classificação 2" }).click();
  await dialog.getByRole("textbox", { name: "Peso da classificação 1" }).fill("100");
  await continueForm(dialog, "Conferir");
  await closeForm(dialog);
});

test("ticker já cotado calcula valor; símbolo de outro provedor bloqueia", async ({ page }) => {
  const requests = await stubTickerCheck(page, ({ ticker }) => ticker === "VOO"
    ? { status: "known", symbol: "VOO", priceBrl: 3000 }
    : { status: "conflict", symbol: ticker, message: `${ticker} já é cotado na carteira por outro provedor (CoinGecko). Escolha o tipo correspondente.` });
  await openPositions(page);
  const dialog = await openAddForm(page);
  await toAssetStep(page, dialog, /ETF dos EUA/);
  await dialog.getByRole("textbox", { name: "Nome do ativo" }).fill("Vanguard Teste");
  await dialog.getByRole("textbox", { name: "Quantidade" }).fill("2");
  const ticker = dialog.getByRole("textbox", { name: "Ticker" });
  const status = dialog.locator("[data-ticker-status]");
  await ticker.fill("VOO");
  await expect(status).toHaveAttribute("data-ticker-status", "known");
  await expect(status).toContainText("VOO já tem cotação nesta competência");
  await expect(dialog.getByRole("textbox", { name: "Cotação em R$" })).toHaveCount(0);
  await expect(dialog.getByTestId("position-form-total")).toContainText("R$ 6.000,00");
  await ticker.fill("BTC");
  await expect(status).toHaveAttribute("data-ticker-status", "conflict");
  await expect(status).toContainText("outro provedor");
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await expectFormStep(dialog, "Ativo");
  await expect(dialog.getByTestId("position-form-issue")).toContainText("Confira o ticker");
  expect(requests.map((request) => request.ticker)).toEqual(["VOO", "BTC"]);
  await closeForm(dialog);
});

test("uma falha da conferência oferece tentar de novo sem perder os campos", async ({ page }) => {
  const requests = await stubTickerCheck(page, (_request, attempt) => attempt === 1 ? "fail" : found("QQQ", "finnhub", 2550));
  await openPositions(page);
  const dialog = await openAddForm(page);
  await toAssetStep(page, dialog, /ETF dos EUA/);
  await dialog.getByRole("textbox", { name: "Nome do ativo" }).fill("Invesco Teste");
  await dialog.getByRole("textbox", { name: "Quantidade" }).fill("2");
  await dialog.getByRole("textbox", { name: "Ticker" }).fill("QQQ");
  const status = dialog.locator("[data-ticker-status]");
  await expect(status).toHaveAttribute("data-ticker-status", "error");
  await status.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(status).toHaveAttribute("data-ticker-status", "found");
  await expect(dialog.getByRole("textbox", { name: "Nome do ativo" })).toHaveValue("Invesco Teste");
  await expect(dialog.getByRole("textbox", { name: "Quantidade" })).toHaveValue("2");
  expect(requests).toHaveLength(2);
  await closeForm(dialog);
});

test("ativo existente é reaproveitado; outro vencimento cria identidade nova", async ({ page }) => {
  await openPositions(page);
  const dialog = await openAddForm(page);
  await chooseKind(page, dialog, /Caixa em dólar/);
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "itau", /^Itaú$/);
  await continueForm(dialog, "Ativo");
  await dialog.getByRole("textbox", { name: "Nome do ativo" }).fill("Time Deposit");
  await dialog.getByRole("textbox", { name: "Saldo (US$)" }).fill("1");
  const existing = dialog.locator("[data-asset-existing]");
  await expect(existing).toContainText("Time Deposit já existe");
  await expect(dialog.getByRole("textbox", { name: "Ticker" })).toHaveCount(0);
  await expect(dialog.getByText("Liquidez do ativo")).toBeVisible();
  // A posição existente nesta conta impede avançar: alterar vencimento gera novo ativo.
  await dialog.getByRole("textbox", { name: "Vencimento", exact: true }).fill("15/01/2027");
  await expect(existing).toHaveCount(0);
  await expect(dialog.getByRole("combobox", { name: "Liquidez" })).toBeVisible();
  await closeForm(dialog);
});

test("renda fixa de nome existente é reaproveitada somente na instituição dela", async ({ page }) => {
  await openPositions(page);
  const dialog = await openAddForm(page);
  await toAssetStep(page, dialog, /Renda fixa/);
  await dialog.getByRole("textbox", { name: "Nome do ativo" }).fill("LCI BRB - Set/26");
  await dialog.getByRole("textbox", { name: "Saldo (R$)" }).fill("100");
  const existing = dialog.locator("[data-asset-existing]");
  await expect(existing).toContainText("LCI BRB - Set/26 já existe");
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await expectFormStep(dialog, "Ativo");
  await expect(dialog.getByTestId("position-form-issue")).toContainText("Este ativo já tem posição nesta instituição.");
  await dialog.getByRole("button", { name: "Voltar", exact: true }).click();
  await pick(page, dialog.getByRole("combobox", { name: "Instituição" }), "itau", /^Itaú$/);
  await continueForm(dialog, "Ativo");
  await expect(existing).toHaveCount(0);
  await closeForm(dialog);
});

test("um símbolo cripto com várias moedas permite escolher a moeda correta", async ({ page }) => {
  const coins = [{ id: "uniswap", name: "Uniswap" }, { id: "unicorn-token", name: "Unicorn Token" }];
  const requests = await stubTickerCheck(page, ({ ticker, coinId }) => {
    const coin = coins.find((candidate) => candidate.id === coinId) ?? coins[0];
    return { ...found(ticker, "coingecko", coin.id === "uniswap" ? 40 : 0.5, coin.name), coinId: coin.id, coins };
  });
  await openPositions(page);
  const dialog = await openAddForm(page);
  await toAssetStep(page, dialog, /Cripto/);
  await dialog.getByRole("textbox", { name: "Nome do ativo" }).fill("Uni");
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
  await closeForm(dialog);
});
test("o lápis da linha abre o mesmo formulário com a posição preenchida", async ({ page }) => {
  await openPositions(page);
  const dialog = await openEditForm(page, "Bitcoin 01", "Ledger");

  // A instituição fica só para leitura; tipo do ativo (lista fixa, spec 068),
  // nome e estratégia podem mudar. A quantidade só muda por movimentações
  // (spec 057): aparece sem campo.
  await expect(dialog.getByRole("combobox", { name: "Tipo do ativo" })).toHaveValue("Cripto");
  await expect(dialog.getByRole("textbox", { name: "Nome do ativo" })).toHaveValue("Bitcoin 01");
  await expect(dialog.getByRole("textbox", { name: "Quantidade" })).toHaveCount(0);
  await expect(dialog.getByTestId("position-form-value-hint")).toContainText("use Movimentar");
  await expect(dialog.getByRole("combobox", { name: "Estratégia" })).toHaveValue("Core-Satellite");
  await expect(dialog.getByText("Tipo e nome são do ativo e valem para todos os meses.")).toBeVisible();

  await formTab(dialog, "Ativo").click();
  await expect(dialog.getByRole("textbox", { name: "Ticker" })).toHaveCount(0);
  await expect(dialog.getByText("BTC", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Vencimento", exact: true })).toHaveCount(0);
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

test("remover, na página da posição, pede confirmação", async ({ page }) => {
  await openPositions(page);
  // As ações saíram da linha da tabela (spec 080).
  await expect(positionRow(page, "Porquinho").getByRole("button", { name: /^(Movimentar|Liquidar|Editar|Remover) / })).toHaveCount(0);
  await openPositionPage(page, "Porquinho");
  await page.getByRole("button", { name: "Remover", exact: true }).click();

  const confirm = page.getByRole("dialog", { name: "Remover Porquinho?" });
  await expect(confirm).toContainText("Apaga o registro");
  await expect(confirm.getByRole("button", { name: "Liquidar" })).toBeVisible();
  await confirm.getByRole("button", { name: "Cancelar" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Porquinho" })).toBeVisible();
});

test("a página da posição edita pelo mesmo formulário", async ({ page }) => {
  await openPositions(page);
  await waitForCompetenceHydration(page);
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
  await expect(dialog.getByRole("textbox", { name: "Vencimento", exact: true })).toBeVisible();
  // A opção de conta corrente saiu do formulário (spec 075).
  await expect(dialog.getByRole("checkbox", { name: /Conta corrente/ })).toHaveCount(0);

  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toHaveCount(0);
});

test("num mês fechado, a página da posição não edita", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-08");
  await waitForCompetenceHydration(page);
  await positionRow(page, "Porquinho").getByRole("link", { name: "Porquinho" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Porquinho" })).toBeVisible();
  const edit = page.getByRole("button", { name: "Editar posição" });
  await expect(edit).toBeDisabled();
  await expect(edit).toHaveAttribute("title", /Ago\/26 está fechado/);
});
