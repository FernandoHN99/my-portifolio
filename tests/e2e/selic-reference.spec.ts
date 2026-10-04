import { expect, test } from "@playwright/test";

import { waitForHydration } from "./support/position-form";
import { stubQuoteChecks } from "./support/quote-checks";

// Specs 064 e 067: a meta Selic da competência fica no card do dólar da Visão
// geral e ao lado do total nas Cotações, só leitura. Nenhuma atualização real
// de cotações ou gravação na carteira é disparada pelos testes.
test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

test("a Selic do mês fica no card do dólar e nas cotações, sem consulta do navegador ao BC", async ({ page }) => {
  const providerRequests: string[] = [];
  await page.route(/https:\/\/[^/]*bcb\.gov\.br\//, async (route) => {
    providerRequests.push(route.request().url());
    await route.abort();
  });

  await page.goto("/?mes=2026-09");
  await waitForHydration(page);
  const overview = page.getByTestId("selic-month");
  await expect(overview).toBeVisible();
  await expect(overview).toContainText("Selic no mês");
  await expect(overview).toContainText(/\d+,\d{2}% a\.a\./);
  await expect(overview).toContainText("Meta Selic do Copom em 30/09/2026");
  await expect(overview).not.toContainText("R$");
  // No mesmo card do dólar e do bitcoin, sem um componente próprio.
  await expect(page.getByTestId("selic-reference")).toHaveCount(0);
  const card = page.locator(".metric-card").filter({ has: overview });
  await expect(card).toContainText("Dólar no mês");

  await page.goto("/posicoes/cotacoes?mes=2026-09");
  await waitForHydration(page);
  const quotes = page.getByTestId("selic-month");
  await expect(quotes).toContainText(/Selic no mês \d+,\d{2}% a\.a\./);
  await expect(quotes).not.toContainText("CDI");
  expect(providerRequests).toEqual([]);
});

test("a Selic muda com a competência", async ({ page }) => {
  await page.goto("/?mes=2024-12");
  await waitForHydration(page);
  const december = await page.getByTestId("selic-month").textContent();
  await expect(page.getByTestId("selic-month")).toContainText("em 31/12/2024");
  await page.goto("/?mes=2026-09");
  await waitForHydration(page);
  await expect(page.getByTestId("selic-month")).toContainText("em 30/09/2026");
  // O histórico real da meta mudou entre as duas datas (12,25% e 13,75%).
  expect(await page.getByTestId("selic-month").textContent()).not.toBe(december);
});

test("botão de desenvolvimento executa somente ao clicar e informa o resultado", async ({ page }) => {
  let syncCalls = 0;
  await page.route("**/api/quotes/dev-sync", async (route) => {
    syncCalls++;
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers()["content-type"]).toContain("application/json");
    await route.fulfill({ json: { ok: true, state: "idle", lines: ["Cotações em dia: nenhum símbolo devido.", "Selic: conferência diária em dia."] } });
  });

  for (const path of ["/?mes=2026-09", "/posicoes/cotacoes?mes=2026-09"]) {
    await page.goto(path);
    await waitForHydration(page);
    const button = page.getByRole("button", { name: "Atualizar cotações (dev)", exact: true });
    await expect(button).toBeVisible();
  }
  expect(syncCalls).toBe(0);
  await page.getByRole("button", { name: "Atualizar cotações (dev)", exact: true }).click();
  await expect.poll(() => syncCalls).toBe(1);
  const toast = page.getByTestId("app-toast").filter({ hasText: "Atualização local concluída" });
  await expect(toast).toBeVisible();
  await expect(toast).toContainText("Cotações em dia: nenhum símbolo devido.");
  await expect(toast).toContainText("Selic: conferência diária em dia.");
  await expect(page.getByRole("button", { name: "Atualizar cotações (dev)", exact: true })).toBeEnabled();
});
