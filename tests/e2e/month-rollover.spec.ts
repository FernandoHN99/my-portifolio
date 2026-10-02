import { expect, test } from "@playwright/test";

import type { QuoteRefreshOutcome } from "@/modules/quotes/domain/quote-refresh";

import { stubQuoteChecks } from "./support/quote-checks";

// A virada real cria competências no banco; aqui a checagem de abertura devolve
// um resultado fixo e só a apresentação é conferida.

const FRESH: QuoteRefreshOutcome = { state: "fresh", lastStartedAt: "2026-10-02T12:00:00.000Z" };

test("abrir o app avisa a competência do mês criada", async ({ page }) => {
  await stubQuoteChecks(page, {
    openCheck: {
      rollover: {
        state: "created",
        months: [
          {
            month: "2026-10",
            sourceMonth: "2026-09",
            isCurrent: true,
            positions: 21,
            quotesFromHistory: [],
            carriedQuotes: ["BTC", "USD"],
          },
        ],
      },
      refresh: FRESH,
      summary: null,
    },
  });
  await page.goto("/");

  const toast = page.getByTestId("app-toast");
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText("Competência de outubro de 2026 criada");
  await expect(toast).toContainText("Posições e rateios copiados de Set/26.");
  await expect(toast).not.toContainText("Repete a cotação");
});

test("meses passados sem cotação diária são apontados", async ({ page }) => {
  await stubQuoteChecks(page, {
    openCheck: {
      rollover: {
        state: "created",
        months: [
          {
            month: "2026-11",
            sourceMonth: "2026-10",
            isCurrent: false,
            positions: 21,
            quotesFromHistory: [],
            carriedQuotes: ["BTC", "VOO"],
          },
          {
            month: "2026-12",
            sourceMonth: "2026-11",
            isCurrent: true,
            positions: 21,
            quotesFromHistory: [],
            carriedQuotes: ["BTC", "VOO"],
          },
        ],
      },
      refresh: FRESH,
      summary: null,
    },
  });
  await page.goto("/posicoes?mes=2026-09");

  const toast = page.getByTestId("app-toast");
  await expect(toast).toContainText("2 competências criadas: Nov/26 e Dez/26");
  await expect(toast).toContainText("Cada mês copiou as posições e os rateios do anterior, a partir de Out/26.");
  await expect(toast).toContainText("Nov/26");
  await expect(toast).toContainText("Repete a cotação de Out/26 em BTC, VOO.");
  await expect(toast).not.toContainText("Repete a cotação de Nov/26");

  await toast.locator('button[aria-label="Fechar aviso"]').click();
  await expect(toast).toHaveCount(0);
});

test("uma falha na virada de mês é avisada sem quebrar a página", async ({ page }) => {
  await stubQuoteChecks(page, {
    openCheck: {
      rollover: { state: "unavailable", message: "Não foi possível criar a competência do mês." },
      refresh: FRESH,
      summary: null,
    },
  });
  await page.goto("/");

  await expect(page.getByTestId("app-toast")).toContainText("Não foi possível criar a competência do mês");
  await expect(page.getByRole("heading", { level: 1, name: "Patrimônio consolidado" })).toBeVisible();
});
