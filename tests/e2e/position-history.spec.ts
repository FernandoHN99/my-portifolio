import { expect, test, type Page } from "@playwright/test";

import { enterEditMode } from "./support/edit-mode";
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

async function openBitcoin01(page: Page, query = "mes=2026-09") {
  await page.goto(`/posicoes?${query}`);
  // Espera a hidratação: um clique antes dela segue o link sem a transição. A
  // primeira abertura compila a rota no servidor de desenvolvimento.
  await expect(page.getByRole("navigation", { name: "Competências" })).toHaveAttribute("data-hydrated");
  await row(page, "Bitcoin 01").getByRole("link", { name: "Bitcoin 01" }).click();
  await expect(page).toHaveURL(POSITION_PATH, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Bitcoin 01" })).toBeVisible();
}

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

  await expect(page.getByText("Ledger · Principal")).toBeVisible();
  await expect.poll(flowValue(page, "position-value")).toBe("R$ 118.693");
  await expect(page.getByText("0,30045274 BTC × R$ 395.046,00")).toBeVisible();
  await expect.poll(flowValue(page, "position-month-change")).toBe("+19,9%");
  await expect.poll(flowValue(page, "position-share")).toBe("47,1%");
  await expect(page.getByRole("heading", { name: "Cotação de BTC" })).toBeVisible();
  await expect(page.getByTestId("asset-price-chart")).toBeVisible();
  await expect(page.getByTestId("position-evolution-chart")).toBeVisible();
  await expect(page.getByTestId("position-allocation")).toContainText("Cripto");
  await expect(page.getByTestId("position-maturity")).toHaveCount(0);

  // Todas as contas soma o Bitcoin 01 da Ledger e da Carteira Cripto: a
  // transferência deixa de aparecer como resgate e aporte.
  await page.getByRole("button", { name: "Todas as contas" }).click();
  await expect(page).toHaveURL(/contas=todas/);
  await expect.poll(flowValue(page, "position-growth")).toBe("+52,93%");

  const values = page.getByTestId("attribution-values");
  await expect(values).toContainText("Entrada em Fev/24R$ 46.288,76");
  await expect(values).toContainText("Ganho de preço+R$ 24.252,52");
  await expect(values).toContainText("Aportes e resgates+R$ 48.151,37");
  await expect(values).toContainText("Valor em Set/26R$ 118.692,65");
  await expect(page.getByTestId("position-average-price")).toContainText("R$ 314.326,08");

  // A volta para a tabela não leva o parâmetro próprio da página.
  await expect(page.getByRole("link", { name: "Voltar para Posições" })).toHaveAttribute("href", "/posicoes?mes=2026-09");
});

test("meses sem competência e sem a posição aparecem como lacunas", async ({ page }) => {
  await openBitcoin01(page);
  const months = page.getByTestId("position-months");

  // Nesta conta, a posição esteve na Carteira Cripto de Mar/24 a Jul/25.
  await expect(months.locator("tr[data-gap='absent']").first()).toContainText(
    "Fora desta conta · em Carteira Cripto · Principal",
  );
  await expect(months.locator("tr[data-gap='absent']").last()).toContainText("saída -R$ 46.288,76");
  await expect(months.getByRole("row", { name: /^Ago\/25/ })).toContainText("Volta · de Carteira Cripto · Principal");
  await expect(months.getByRole("row", { name: /^Set\/26/ })).toHaveAttribute("aria-current", "date");

  // Somando as contas, Jul/24 e Fev/25 a Jun/25 continuam como lacunas, e a
  // variação seguinte compara com a última competência existente.
  await page.getByRole("button", { name: "Todas as contas" }).click();
  await expect(months.locator("tr[data-gap='absent']")).toHaveCount(0);
  await expect(months.locator("tr[data-gap='missing']").filter({ hasText: "Jul/24" })).toContainText(
    "Sem competência no histórico",
  );
  await expect(months.locator("tr[data-gap='missing']").filter({ hasText: "Fev/25 a Jun/25" })).toContainText(
    "5 meses sem competência no histórico",
  );
  await expect(months.getByRole("row", { name: /^Jul\/25/ })).toContainText("desde Jan/25");
  await expect(months.getByRole("row", { name: /^Ago\/24/ })).toContainText("desde Jun/24");
});

test("a linha inteira abre a posição de um saldo sem cotação", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-09");
  await row(page, "Porquinho").getByText("R$ 2.427,12").filter({ visible: true }).first().click();
  await expect(page).toHaveURL(POSITION_PATH);
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

  // Saldos sem cotação têm vencimento editável; o teste abre e cancela, sem
  // gravar nos dados reais.
  const maturity = page.getByTestId("position-maturity");
  await expect(maturity).toContainText("Não informado");
  await maturity.getByRole("button", { name: "Informar vencimento" }).click();
  await expect(maturity.getByRole("textbox", { name: "Vencimento", exact: true })).toBeVisible();
  await expect(maturity.getByRole("button", { name: "Salvar vencimento" })).toBeDisabled();
  await maturity.getByRole("button", { name: "Cancelar edição do vencimento" }).click();
  await expect(maturity).toContainText("Não informado");
});

test("no modo de edição a linha não abre a posição", async ({ page }) => {
  // Só o mês aberto, o mais recente, aceita edição (spec 034).
  await page.goto("/posicoes");
  // O Bitcoin 01 pode estar em mais de uma conta; o cenário usa o da Ledger.
  const ledger = row(page, "Bitcoin 01").filter({ hasText: "Ledger" });
  await expect(ledger.getByRole("link", { name: "Bitcoin 01" })).toBeVisible();

  await enterEditMode(page);
  await expect(ledger.getByRole("link")).toHaveCount(0);
  await ledger.getByText("Ledger", { exact: true }).filter({ visible: true }).first().click();
  await ledger.getByText("Bitcoin 01", { exact: true }).click();
  await expect(page).toHaveURL(/\/posicoes$/);

  await page.getByRole("button", { name: "Sair da edição" }).click();
  await expect(ledger.getByRole("link", { name: "Bitcoin 01" })).toBeVisible();
});

test("o seletor global troca a competência da posição e mostra a ausência", async ({ page }) => {
  await openBitcoin01(page);
  const path = new URL(page.url()).pathname;

  const timeline = page.getByRole("navigation", { name: "Competências" });
  await expect(timeline).toHaveAttribute("data-hydrated");
  await timeline.getByRole("button", { name: /^Agosto de 2026/ }).click();
  await expect(page).toHaveURL(new RegExp(`${path}\\?mes=2026-08$`));
  await expect.poll(flowValue(page, "position-value")).toBe("R$ 98.993");

  await page.goto(`${path}?mes=2025-01`);
  await expect(page.getByTestId("position-absent")).toHaveText(
    "Sem a posição em Jan/25 nesta conta. Última competência com ela: Fev/24.",
  );
  await expect(page.getByTestId("position-value")).toHaveAttribute("data-value", "—");
  await expect(page.getByText("Sem a posição em Jan/25", { exact: true }).first()).toBeVisible();
});

test("uma posição inexistente mostra o aviso e a volta", async ({ page }) => {
  await page.goto(
    "/posicoes/00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000000?mes=2026-09",
  );
  await expect(page.getByRole("heading", { level: 1, name: "Posição não encontrada" })).toBeVisible();
  await page.getByRole("link", { name: "Voltar para Posições" }).click();
  await expect(page).toHaveURL(/\/posicoes\?mes=2026-09$/);
});
