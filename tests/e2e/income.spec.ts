import { expect, test, type Page } from "@playwright/test";

import { decimalToCents } from "@/lib/money";
import { payslipIncomeCents, taxableIncomeCents } from "@/modules/income/domain/income";

import { stubQuoteChecks } from "./support/quote-checks";

// Spec 088: Recebimentos. O usuário dos testes decide o que roda: sem a
// concessão, a área não aparece nem responde; com ela (servidor
// `recebimentos-teste`, E2E_BASE_URL), confere resumo, gráfico, tabela e o
// celular, só lendo.

test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

async function hasIncomeAccess(page: Page) {
  return (await page.request.get("/api/recebimentos/backup")).status() === 200;
}

async function openIncome(page: Page, query = "") {
  await page.goto(`/recebimentos${query}`);
  await expect(page.getByTestId("income-workspace")).toHaveAttribute("data-hydrated");
}

type MonthRow = {
  month: string;
  netIncome: string | null;
  mealVoucher: string | null;
  cardSpend: string | null;
  pixSpend: string | null;
  mealVoucherSpend: string | null;
};

const cents = (value: string | null) => (value === null ? 0 : Math.round(Number(value) * 100));

test("sem a concessão, Recebimentos não aparece no menu nem responde por URL ou API", async ({ page }) => {
  test.skip(await hasIncomeAccess(page), "O usuário dos testes tem a área; este cenário é do amigo sem ela.");

  await page.goto("/");
  await expect(page.locator('a[href="/recebimentos"]')).toHaveCount(0);
  expect((await page.goto("/recebimentos"))?.status()).toBe(404);
  expect((await page.request.get("/api/recebimentos/backup")).status()).toBe(404);
  const restore = await page.request.post("/api/recebimentos/backup/restore", { data: { mode: "check", backup: {} } });
  expect(restore.status()).toBe(404);
});

test.describe("com a concessão", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await hasIncomeAccess(page)), "O usuário dos testes não tem Recebimentos.");
  });

  test("cards e meses do ano batem com os dados do backup", async ({ page }) => {
    const backup = await (await page.request.get("/api/recebimentos/backup")).json();
    const months = (backup.tables.incomeMonths as MonthRow[]).map((row) => ({ ...row, month: row.month.slice(0, 7) }));
    const year = new Date().getFullYear();
    const ofYear = months.filter((row) => row.month.startsWith(`${year}-`));
    test.skip(ofYear.length === 0, "Sem meses no ano atual.");

    await openIncome(page);
    const income = ofYear.reduce((sum, row) => sum + cents(row.netIncome) + cents(row.mealVoucher), 0);
    const spend = ofYear.reduce((sum, row) => sum + cents(row.cardSpend) + cents(row.pixSpend) + cents(row.mealVoucherSpend), 0);
    await expect(page.getByTestId("income-kpi-income")).toHaveAttribute("data-cents", String(income));
    await expect(page.getByTestId("income-kpi-spend")).toHaveAttribute("data-cents", String(spend));
    await expect(page.getByTestId("income-kpi-balance")).toHaveAttribute("data-cents", String(income - spend));
    await expect(page.getByTestId("income-year-badges").getByRole("button", { name: String(year) })).toHaveAttribute("aria-pressed", "true");

    const desktop = await page.getByTestId("income-table").isVisible();
    await expect(page.getByTestId(desktop ? "income-row" : "income-card")).toHaveCount(ofYear.length);
    if (ofYear.some((row) => [row.netIncome, row.mealVoucher, row.cardSpend, row.pixSpend, row.mealVoucherSpend].some((value) => value !== null))) {
      await expect(page.getByTestId("income-chart")).toBeVisible();
    }
  });

  test("o link de um mês abre o formulário dele, com os holerites", async ({ page }) => {
    const backup = await (await page.request.get("/api/recebimentos/backup")).json();
    const withPayslip = (backup.tables.incomePayslips as { incomeMonthId: string }[])[0];
    test.skip(!withPayslip, "Sem holerites.");
    const month = (backup.tables.incomeMonths as (MonthRow & { id: string })[]).find((row) => row.id === withPayslip.incomeMonthId)!.month.slice(0, 7);
    const count = (backup.tables.incomePayslips as { incomeMonthId: string }[]).filter((row) => row.incomeMonthId === withPayslip.incomeMonthId).length;

    await openIncome(page, `?mes=${month}`);
    const form = page.getByTestId("income-month-form");
    await expect(form).toBeVisible();
    await expect(form.getByTestId("income-payslip")).toHaveCount(count);
    await expect(page).not.toHaveURL(/mes=/);
    await form.getByRole("button", { name: "Cancelar" }).click();
    await expect(form).toBeHidden();
  });

  test("o card Salário bruto mostra o bruto tributável do ano (spec 095)", async ({ page }) => {
    const backup = await (await page.request.get("/api/recebimentos/backup")).json();
    const year = String(new Date().getFullYear());
    const yearOf = new Map((backup.tables.incomeMonths as (MonthRow & { id: string })[]).map((row) => [row.id, row.month.slice(0, 4)]));
    const payslips = (backup.tables.incomePayslips as Record<string, unknown>[])
      .filter((row) => yearOf.get(row.incomeMonthId as string) === year)
      .map((row) => ({
        kind: row.kind as "SALARY",
        grossCents: decimalToCents(row.grossSalary as string),
        prorated: row.prorated as boolean,
        taxable: row.taxable as boolean,
        startsOn: (row.startsOn as string).slice(0, 10),
        endsOn: (row.endsOn as string).slice(0, 10),
      }));
    test.skip(payslips.length === 0, "Sem holerites no ano atual.");

    await openIncome(page);
    const gross = payslips.reduce((sum, payslip) => sum + payslipIncomeCents(payslip), 0);
    const taxable = payslips.reduce((sum, payslip) => sum + taxableIncomeCents(payslip), 0);
    await expect(page.getByTestId("income-kpi-gross")).toHaveAttribute("data-cents", String(gross));
    await expect(page.getByTestId("income-kpi-taxable")).toHaveAttribute("data-cents", String(taxable));
    expect(taxable).toBeLessThanOrEqual(gross);
  });

  test("cada holerite tem a marcação Tributável, e o bruto tributável da prévia acompanha", async ({ page }) => {
    const backup = await (await page.request.get("/api/recebimentos/backup")).json();
    const withPayslip = (backup.tables.incomePayslips as { incomeMonthId: string }[])[0];
    test.skip(!withPayslip, "Sem holerites.");
    const month = (backup.tables.incomeMonths as (MonthRow & { id: string })[]).find((row) => row.id === withPayslip.incomeMonthId)!.month.slice(0, 7);

    await openIncome(page, `?mes=${month}`);
    const form = page.getByTestId("income-month-form");
    const preview = form.getByTestId("income-month-preview");
    const box = form.getByRole("checkbox", { name: "Holerite 1: tributável" });
    await expect(preview).toContainText("Bruto tributável");

    // Trocar a marcação muda só o bruto tributável da prévia; nada é salvo.
    const before = await preview.innerText();
    await box.click();
    await expect(async () => expect(await preview.innerText()).not.toBe(before)).toPass();
    await box.click();
    await expect(async () => expect(await preview.innerText()).toBe(before)).toPass();

    await form.getByRole("button", { name: "Cancelar" }).click();
    await expect(form).toBeHidden();
  });

  test("tabela larga: o bruto fica nas Entradas, e os totais batem com os cartões", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chrome", "A tabela só aparece a partir de 1420 px.");
    await page.setViewportSize({ width: 1440, height: 900 });
    await openIncome(page);
    const table = page.getByTestId("income-table");
    test.skip(!(await table.isVisible()), "Sem meses no ano atual.");

    const headers = (await table.locator("thead tr").nth(1).locator("th").allTextContents()).map((text) => text.replace(/ref\.$/, "").trim());
    expect(headers).toEqual(["Bruto", "Líquido + extras", "VA/VR", "Total", "Cartão", "PIX", "VA/VR", "Total", "Balanço"]);
    await expect(table.locator("thead tr").first().locator("th").nth(1)).toHaveText("Entradas");
    // O bruto é referência: o total de entradas não o soma.
    for (const [total, card] of [["income-total-income", "income-kpi-income"], ["income-total-spend", "income-kpi-spend"], ["income-total-balance", "income-kpi-balance"]]) {
      expect(await page.getByTestId(total).getAttribute("data-cents")).toBe(await page.getByTestId(card).getAttribute("data-cents"));
    }
    await expect(table.locator("tfoot tr")).toHaveCount(2);
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  });

  test("sem rolagem lateral no celular e no computador", async ({ page }, testInfo) => {
    const widths = testInfo.project.name === "desktop-chrome" ? [1024, 1280, 1420, 1440] : [320, 375, 430];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 860 });
      await openIncome(page);
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
      expect(scrollWidth, `${width} px`).toBeLessThanOrEqual(innerWidth);
    }
  });
});
