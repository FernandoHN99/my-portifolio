import { expect, test, type Page } from "@playwright/test";

import { stubQuoteChecks } from "./support/quote-checks";

// A página da posição só lê dados. A checagem de abertura grava no banco e
// pode criar competências, então é substituída por uma resposta fixa; a edição
// é sempre descartada. Os cenários fixam a competência na URL para valer com
// setembro de 2026 como a mais recente ou com meses posteriores.
test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

const POSITION_PATH = /\/posicoes\/[0-9a-f-]{36}\/[0-9a-f-]{36}/;

const row = (page: Page, asset: string) => page.getByTestId("position-row").filter({ hasText: asset });

// O NumberFlow desenha os dígitos num shadow DOM; o card guarda o valor
// formatado em data-value.
const flowValue = (page: Page, testId: string) => async () =>
  ((await page.getByTestId(testId).getAttribute("data-value")) ?? "").replace(/\s/g, " ");

async function openPosition(page: Page, asset: string, query = "mes=2026-09", institution?: string) {
  await page.goto(`/posicoes?${query}`);
  // Espera a hidratação: um clique antes dela segue o link sem a transição. A
  // primeira abertura compila a rota no servidor de desenvolvimento.
  await expect(page.getByRole("navigation", { name: "Competências" })).toHaveAttribute("data-hydrated");
  const rows = institution ? row(page, asset).filter({ hasText: institution }) : row(page, asset);
  await rows.getByRole("link", { name: asset, exact: true }).click();
  await expect(page).toHaveURL(POSITION_PATH, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1, name: asset })).toBeVisible();
}

const openBitcoin01 = (page: Page, query?: string) => openPosition(page, "Bitcoin 01", query);

test("o nome do ativo abre a posição e a volta mantém mês e filtros", async ({ page }) => {
  await openBitcoin01(page, "mes=2026-09&classe=Cripto&ordem=share.desc");

  await expect(page).toHaveURL(/\?mes=2026-09&classe=Cripto&ordem=share\.desc$/);
  await expect(
    page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Posições" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("navigation", { name: "Competências" }).getByRole("button", { name: /^Setembro de 2026/ }),
  ).toHaveAttribute("aria-current", "date");

  await page.getByRole("link", { name: "Voltar para Posições" }).click();
  await expect(page).toHaveURL(/\/posicoes\?mes=2026-09&classe=Cripto&ordem=share\.desc$/);
  await expect(page.getByRole("heading", { level: 1, name: "Carteira do mês" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cripto", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("a página de um ativo cotado decompõe a variação em preço e aportes", async ({ page }) => {
  await openBitcoin01(page);

  // Valores do histórico preparado (spec 041): fechamento de 30/09/2026.
  await expect(page.getByText("Ledger", { exact: true }).first()).toBeVisible();
  await expect.poll(flowValue(page, "position-value")).toBe("R$ 130.457");
  await expect(page.getByText("0,30045274 BTC × R$ 434.201,00")).toBeVisible();
  await expect.poll(flowValue(page, "position-month-change")).toBe("+6,24%");
  await expect.poll(flowValue(page, "position-share")).toBe("49,3%");
  await expect(page.getByRole("heading", { name: "Cotação de BTC" })).toBeVisible();
  await expect(page.getByTestId("asset-price-chart")).toBeVisible();
  await expect(page.getByTestId("position-evolution-chart")).toBeVisible();
  // Rateio de 100% numa classificação: um selo discreto, e a cotação ocupa a
  // largura toda (spec 045).
  await expect(page.getByTestId("position-single-allocation")).toContainText("Cripto · BTC");
  await expect(page.getByTestId("position-allocation")).toHaveCount(0);
  await expect(page.getByTestId("position-maturity")).toHaveCount(0);

  // A Carteira Cripto virou a Ledger: o Bitcoin 01 tem uma conta só, desde a
  // entrada em Jun/23.
  await expect(page.getByRole("button", { name: "Todas as contas" })).toHaveCount(0);
  const values = page.getByTestId("attribution-values");
  await expect(values).toContainText("Entrada em Jun/23R$ 26.321,77");
  await expect(values).toContainText("Ganho de preço+R$ 56.530,45");
  await expect(values).toContainText("Aportes e resgates+R$ 47.604,66");
  await expect(values).toContainText("Valor em Set/26R$ 130.456,88");
  await expect(page.getByTestId("position-average-price")).toContainText("R$ 246.050,09");

  // A volta para a tabela não leva o parâmetro próprio da página.
  await expect(page.getByRole("link", { name: "Voltar para Posições" })).toHaveAttribute("href", "/posicoes?mes=2026-09");
});

test("todas as contas soma o ativo de cada instituição", async ({ page }) => {
  // O USDC esteve na Binance de Fev/24 a Set/25 e está na AAVE desde Jul/25.
  await openPosition(page, "USDC", "mes=2025-09", "AAVE");
  await expect(page.getByText("USDC também esteve em Binance (Fev/24 a Set/25).", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Todas as contas" }).click();
  await expect(page).toHaveURL(/contas=todas/);
  await expect.poll(flowValue(page, "position-value")).toBe("R$ 9.390");
  await expect.poll(flowValue(page, "position-growth")).toBe("+6,73%");

  const values = page.getByTestId("attribution-values");
  await expect(values).toContainText("Entrada em Fev/24R$ 18.042,29");
  await expect(values).toContainText("Ganho de preço+R$ 2.485,09");
  await expect(values).toContainText("Aportes e resgates-R$ 11.137,50");
  await expect(values).toContainText("Valor em Set/25R$ 9.389,88");
});

test("meses sem a posição aparecem como lacunas", async ({ page }) => {
  // O Bitcoin 02 saiu da Binance em Mar/24 e voltou em Abr/24.
  await openPosition(page, "Bitcoin 02");
  const months = page.getByTestId("position-months");
  const absent = months.locator("tr[data-gap='absent']");
  await expect(absent).toHaveCount(1);
  await expect(absent).toContainText("Mar/24");
  await expect(absent).toContainText("Fora desta conta");
  await expect(absent).toContainText("saída -R$ 5.354,10");
  await expect(months.getByRole("row", { name: /^Abr\/24/ })).toContainText("Volta");
  await expect(months.getByRole("row", { name: /^Set\/26/ })).toHaveAttribute("aria-current", "date");
  // O histórico preparado não tem meses sem competência (spec 041).
  await expect(months.locator("tr[data-gap='missing']")).toHaveCount(0);

  // O USDC da Binance aparece fora da conta, na AAVE, depois de Set/25; somando
  // as contas, as lacunas somem.
  await openPosition(page, "USDC", "mes=2025-09", "Binance");
  await expect(months.locator("tr[data-gap='absent']")).toContainText(/^Out\/25 a .*Fora desta conta · em AAVE/);
  await page.getByRole("button", { name: "Todas as contas" }).click();
  await expect(months.locator("tr[data-gap='absent']")).toHaveCount(0);
});

test("a linha inteira abre a posição de um saldo sem cotação", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-09");
  await expect(page.getByRole("navigation", { name: "Competências" })).toHaveAttribute("data-hydrated");
  await row(page, "Porquinho").getByText("R$ 2.427,12").filter({ visible: true }).first().click();
  await expect(page).toHaveURL(POSITION_PATH, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Porquinho" })).toBeVisible();

  await expect(page.getByText("SALDO", { exact: true })).toBeVisible();
  await expect.poll(flowValue(page, "position-value")).toBe("R$ 2.427");
  await expect.poll(flowValue(page, "position-month-change")).toBe("-52,1%");
  await expect(page.getByRole("heading", { name: "Variação mensal do saldo" })).toBeVisible();
  await expect(page.getByTestId("balance-change-chart")).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Cotação de/ })).toHaveCount(0);
  await expect(page.getByTestId("position-average-price")).toHaveCount(0);
  await expect(page.getByTestId("attribution-values")).toContainText("Variação do saldo-R$ 4.046,93");
  await expect(page.getByText(/rendimentos, aportes e\s+resgates aparecem juntos/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Todas as contas" })).toHaveCount(0);

  // Vencimento e liquidez aparecem nos destaques; a edição passa pelo
  // formulário da posição (spec 043), sem lápis espalhados.
  await expect(page.getByTestId("position-maturity")).toContainText("Não informado");
  await expect(page.getByTestId("position-liquidity")).toContainText("Liquidez");
  await expect(page.getByRole("button", { name: "Renomear ativo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Editar posição" })).toBeVisible();
});

test("os botões da linha não abrem a posição", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-09");
  await expect(page.getByRole("navigation", { name: "Competências" })).toHaveAttribute("data-hydrated");
  // O Bitcoin 01 pode estar em mais de uma conta; o cenário usa o da Ledger.
  const ledger = row(page, "Bitcoin 01").filter({ hasText: "Ledger" });

  await ledger.getByRole("button", { name: "Expandir Bitcoin 01" }).click();
  await expect(page.getByTestId("position-details")).toBeVisible();
  await expect(page).toHaveURL(/\/posicoes\?mes=2026-09$/);
});

test("o seletor global troca a competência da posição e mostra a ausência", async ({ page }) => {
  await openBitcoin01(page);
  const path = new URL(page.url()).pathname;

  const timeline = page.getByRole("navigation", { name: "Competências" });
  await expect(timeline).toHaveAttribute("data-hydrated");
  await timeline.getByRole("button", { name: /^Agosto de 2026/ }).click();
  await expect(page).toHaveURL(new RegExp(`${path}\\?mes=2026-08$`));
  await expect.poll(flowValue(page, "position-value")).toBe("R$ 122.798");

  // O Bitcoin 02 não estava na Binance em Mar/24.
  await openPosition(page, "Bitcoin 02");
  await page.goto(`${new URL(page.url()).pathname}?mes=2024-03`);
  await expect(page.getByTestId("position-absent")).toHaveText(
    "Sem a posição em Mar/24 nesta conta. Última competência com ela: Fev/24.",
  );
  await expect(page.getByTestId("position-value")).toHaveAttribute("data-value", "—");
  await expect(page.getByText("Sem a posição em Mar/24", { exact: true }).first()).toBeVisible();
});

test("uma posição inexistente mostra o aviso e a volta", async ({ page }) => {
  await page.goto(
    "/posicoes/00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000000?mes=2026-09",
  );
  await expect(page.getByRole("heading", { level: 1, name: "Posição não encontrada" })).toBeVisible();
  await page.getByRole("link", { name: "Voltar para Posições" }).click();
  await expect(page).toHaveURL(/\/posicoes\?mes=2026-09$/);
});
