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

  // Valor aplicado e rendimento (spec 073): o saldo inicial de Jun/23 mais as
  // compras, e o valor da posição menos esse aplicado.
  await expect.poll(flowValue(page, "position-applied")).toBe("R$ 73.926");
  await expect(page.getByTestId("position-gain")).toContainText("+R$ 56.530,46");

  // A Carteira Cripto virou a Ledger: o Bitcoin 01 tem uma conta só, desde a
  // entrada em Jun/23. Com as movimentações convertidas do histórico (specs
  // 071 e 073), a decomposição usa as registradas (spec 058): o saldo inicial
  // de Jun/23 e as compras pela cotação do mês.
  await expect(page.getByRole("button", { name: "Todas as contas" })).toHaveCount(0);
  const values = page.getByTestId("attribution-values");
  await expect(values).toContainText("Saldo de partida · Jun/23R$ 26.321,77");
  await expect(values).toContainText("Aportes menos retiradas+R$ 47.604,65");
  await expect(values).toContainText("Efeito de preço+R$ 56.530,46");
  await expect(values).toContainText("Valor em Set/26R$ 130.456,88");
  // O saldo inicial vale como aplicação no preço médio (spec 073). Sem o
  // quadro de destaques, o preço médio fica no card do valor aplicado, e a
  // origem do custo no título (spec 075).
  const average = page.getByTestId("position-applied").locator("..").getByTestId("position-average-price");
  await expect(average).toContainText("Preço médio R$ 246.050");
  await expect(average).toHaveAttribute("title", "Preço médio com saldo inicial");
  await expect(page.getByRole("heading", { name: "Destaques" })).toHaveCount(0);

  // Melhor e pior mês dentro do card da variação no mês, sem quadro próprio.
  await page.getByTestId("position-highlights").click();
  await expect(page.getByTestId("position-best-month")).toBeVisible();
  await expect(page.getByTestId("position-worst-month")).toBeVisible();
  await page.keyboard.press("Escape");

  // Sem textos explicativos nos quadros (spec 075).
  await expect(page.getByText("Clique em um mês para abrir")).toHaveCount(0);
  await expect(page.getByText("Aportes e retiradas usam os valores das transações")).toHaveCount(0);

  // Mês a mês e movimentações começam recolhidos; a seta abre.
  const monthsToggle = page.getByRole("button", { name: /^Mês a mês/ });
  await expect(monthsToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("position-months")).toBeHidden();
  await monthsToggle.click();
  await expect(page.getByTestId("position-months")).toBeVisible();
  const movementsToggle = page.getByRole("button", { name: /^Movimentações/ });
  await expect(movementsToggle).toHaveAttribute("aria-expanded", "false");
  await movementsToggle.click();
  await expect(page.getByTestId("position-transactions")).toBeVisible();

  // Variação mensal do saldo com períodos, ao lado de onde veio a variação.
  const periods = page.getByRole("group", { name: "Período da variação mensal" });
  await expect(periods.getByRole("button", { name: "12M" })).toHaveAttribute("aria-pressed", "true");
  await periods.getByRole("button", { name: "6M" }).click();
  await expect(periods.getByRole("button", { name: "6M" })).toHaveAttribute("aria-pressed", "true");
  for (const label of ["YTD", "Tudo"]) {
    await expect(periods.getByRole("button", { name: label })).toBeVisible();
  }

  // A volta para a tabela não leva o parâmetro próprio da página.
  await expect(page.getByRole("link", { name: "Voltar para Posições" })).toHaveAttribute("href", "/posicoes?mes=2026-09");
});

test("todas as contas soma o ativo de cada instituição", async ({ page }) => {
  // O USDC esteve na Binance de Fev/24 a Set/25 e está na AAVE desde Jul/25.
  await openPosition(page, "USDC", "mes=2025-09", "AAVE");
  // Na Binance até a liquidação, em Out/25 (spec 076).
  await expect(page.getByText("Também em Binance (Fev/24 a Out/25)", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Todas as contas" }).click();
  await expect(page).toHaveURL(/contas=todas/);
  await expect.poll(flowValue(page, "position-value")).toBe("R$ 9.390");
  // O rendimento soma o que as retiradas da Binance realizaram, com o dólar mais
  // caro que na compra (spec 076).
  await expect(page.getByTestId("position-gain")).toContainText("+R$ 2.953,92");

  // As duas contas somam as movimentações registradas: cada uma começa com o
  // próprio saldo inicial, e os juros das stablecoins são rendimentos.
  const values = page.getByTestId("attribution-values");
  await expect(values).toContainText("Saldo de partida · Fev/24R$ 18.042,29");
  await expect(values).toContainText("Aportes menos retiradas-R$ 17.272,07");
  await expect(values).toContainText("Rendimentos incorporados+R$ 468,85");
  await expect(values).toContainText("Saldo inicial registrado+R$ 5.665,74");
  await expect(values).toContainText("Valor em Set/25R$ 9.389,88");
});

test("a posição liquidada fica no mês da saída e volta depois", async ({ page }) => {
  // O Bitcoin 02 saiu da Binance em Mar/24, numa retirada total (spec 076), e
  // voltou em Abr/24.
  await openPosition(page, "Bitcoin 02");
  await page.getByRole("button", { name: /^Mês a mês/ }).click();
  const months = page.getByTestId("position-months");
  await expect(months.locator("tr[data-gap='absent']")).toHaveCount(0);
  await expect(months.getByRole("row", { name: /^Mar\/24/ })).toContainText("Liquidada");
  await expect(months.getByRole("row", { name: /^Abr\/24/ })).toContainText("Volta");
  await expect(months.getByRole("row", { name: /^Set\/26/ })).toHaveAttribute("aria-current", "date");
  // O histórico preparado não tem meses sem competência (spec 041).
  await expect(months.locator("tr[data-gap='missing']")).toHaveCount(0);

  // O USDC da Binance foi liquidado em Out/25 e depois fica fora da conta, na
  // AAVE; somando as contas, as lacunas somem.
  await openPosition(page, "USDC", "mes=2025-09", "Binance");
  await page.getByRole("button", { name: /^Mês a mês/ }).click();
  await expect(months.getByRole("row", { name: /^Out\/25/ })).toContainText("Liquidada");
  await expect(months.locator("tr[data-gap='absent']")).toContainText(/^Nov\/25 a .*Fora desta conta · em AAVE/);
  await page.getByRole("button", { name: "Todas as contas" }).click();
  await expect(page).toHaveURL(/contas=todas/);
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
  // O Porquinho, um CDB, tem saldo inicial, aportes, retiradas e o rendimento
  // estimado pelo CDI de cada mês (spec 073).
  await expect(page.getByTestId("attribution-values")).toContainText("Saldo de partida · Jul/25R$ 6.474,05");
  await expect(page.getByTestId("attribution-values")).toContainText("Aportes menos retiradas-R$ 5.070,73");
  await expect(page.getByTestId("attribution-values")).toContainText("Rendimentos incorporados+R$ 1.023,80");
  await expect(page.getByTestId("attribution-values")).toContainText("Valor em Set/26R$ 2.427,12");
  await expect(page.getByRole("button", { name: "Todas as contas" })).toHaveCount(0);

  // Liquidez e vencimento ficam no cabeçalho, junto da classificação (spec
  // 073): sem vencimento, não há selo. A edição passa pelo formulário da
  // posição (spec 043), sem lápis espalhados.
  await expect(page.getByTestId("position-maturity")).toHaveCount(0);
  await expect(page.getByTestId("position-chips").getByTestId("position-liquidity")).toContainText("Liquidez");
  await expect(page.getByTestId("position-presence")).toHaveCount(0);
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

test("o seletor global troca a competência e só mostra os meses com a posição", async ({ page }) => {
  await openBitcoin01(page);
  const path = new URL(page.url()).pathname;

  const timeline = page.getByRole("navigation", { name: "Competências" });
  await expect(timeline).toHaveAttribute("data-hydrated");
  await timeline.getByRole("button", { name: /^Agosto de 2026/ }).click();
  await expect(page).toHaveURL(new RegExp(`${path}\\?mes=2026-08$`));
  await expect.poll(flowValue(page, "position-value")).toBe("R$ 122.798");

  // O Bitcoin 02 foi liquidado em Mar/24 (spec 076): o mês mostra a saída,
  // com valor zero.
  await openPosition(page, "Bitcoin 02");
  await page.goto(`${new URL(page.url()).pathname}?mes=2024-03`);
  await expect(page.getByTestId("position-liquidated")).toHaveText("Liquidada em 01/03/2024");
  await expect.poll(flowValue(page, "position-value")).toBe("R$ 0");

  // O USDC da Binance só existiu de Fev/24 a Out/25: a faixa não oferece 2026,
  // e um mês sem a posição leva ao último mês com ela.
  await openPosition(page, "USDC", "mes=2025-09", "Binance");
  const usdc = new URL(page.url()).pathname;
  await expect(timeline).toHaveAttribute("data-hydrated");
  await expect(timeline.getByRole("button", { name: "2026" })).toHaveCount(0);
  await page.goto(`${usdc}?mes=2026-09`);
  await expect(page).toHaveURL(new RegExp(`${usdc}\\?mes=2025-10$`));
  await expect(page.getByTestId("position-liquidated")).toBeVisible();
});

test("a liquidação aparece na tabela do mês da saída e não no seguinte", async ({ page }) => {
  // A LCI BRB saiu em Out/26 (spec 076).
  await page.goto("/posicoes?mes=2026-10");
  const liquidated = row(page, "LCI BRB - Set/26");
  await expect(liquidated.getByTestId("position-liquidated")).toHaveText("Liquidada");
  await expect(page.getByTestId("positions-count")).toContainText("1 liquidada");

  await page.goto("/posicoes?mes=2026-09");
  await expect(row(page, "LCI BRB - Set/26").getByTestId("position-liquidated")).toHaveCount(0);
  await expect(page.getByTestId("positions-count")).not.toContainText("liquidada");
});

test("uma posição inexistente mostra o aviso e a volta", async ({ page }) => {
  await page.goto(
    "/posicoes/00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000000?mes=2026-09",
  );
  await expect(page.getByRole("heading", { level: 1, name: "Posição não encontrada" })).toBeVisible();
  await page.getByRole("link", { name: "Voltar para Posições" }).click();
  await expect(page).toHaveURL(/\/posicoes\?mes=2026-09$/);
});
