import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";

import { stubQuoteChecks } from "./support/quote-checks";

// Spec 098: Horas extras, a segunda aba de Recebimentos. Só leitura: confere as
// abas, os cards contra a tabela, o formulário único do mês (abas ao abrir uma
// linha, etapas ao declarar, com a folha anexada sem gravar) e a largura no celular. Roda no servidor `recebimentos-teste`
// (E2E_BASE_URL) com o usuário que tem a área e as folhas importadas.

test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

async function hasIncomeAccess(page: Page) {
  return (await page.request.get("/api/recebimentos/backup")).status() === 200;
}

async function openOvertime(page: Page) {
  await page.goto("/recebimentos/horas-extras");
  await expect(page.getByTestId("overtime-workspace")).toHaveAttribute("data-hydrated");
}

test("sem a concessão, as Horas extras não respondem por URL nem pela importação", async ({ page }) => {
  test.skip(await hasIncomeAccess(page), "O usuário dos testes tem a área.");
  expect((await page.goto("/recebimentos/horas-extras"))?.status()).toBe(404);
  const response = await page.request.post("/api/recebimentos/horas-extras/importar", { data: { mode: "check", files: [] } });
  expect(response.status()).toBe(404);
});

test.describe("com a concessão", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await hasIncomeAccess(page)), "O usuário dos testes não tem Recebimentos.");
  });

  test("as abas levam de Recebimentos às Horas extras e de volta", async ({ page }) => {
    await page.goto("/recebimentos");
    await expect(page.getByTestId("income-workspace")).toHaveAttribute("data-hydrated");
    await page.getByTestId("tab-overtime").click();
    await expect(page).toHaveURL(/\/recebimentos\/horas-extras/);
    await expect(page.getByTestId("tab-overtime")).toHaveAttribute("aria-current", "page");
    await page.getByTestId("tab-income").click();
    await expect(page).toHaveURL(/\/recebimentos$/);
  });

  test("os cards batem com o total da tabela, que aparece em toda largura", async ({ page }) => {
    await openOvertime(page);
    test.skip((await page.getByTestId("overtime-row").count()) === 0, "Sem meses de horas extras.");

    const hours = async (testId: string) => Number(await page.getByTestId(testId).getAttribute("data-hours"));
    const total = async (testId: string) => Math.round(Number((await page.getByTestId(testId).innerText()).replace(/\./g, "").replace(",", ".")) * 100);
    expect(await hours("overtime-kpi-worked")).toBe(await total("overtime-total-worked"));
    expect(await hours("overtime-kpi-paid")).toBe(await total("overtime-total-paid"));
    expect((await hours("overtime-kpi-overdue")) + (await hours("overtime-kpi-awaiting"))).toBe(await total("overtime-total-open"));
  });

  test("a linha abre o mês num formulário único, com declaração, anexo e pagamento em abas", async ({ page }) => {
    await openOvertime(page);
    await expect(page.getByTestId("overtime-payment-button")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Holerites" })).toHaveCount(0);
    const opener = page
      .getByRole("button", { name: /^Abrir (Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro) de \d{4}$/ })
      .filter({ visible: true })
      .first();
    test.skip((await opener.count()) === 0, "Sem meses de horas extras.");
    await opener.click();

    const form = page.getByTestId("overtime-entry-form");
    await expect(form.getByRole("tab")).toHaveText(["Declaração", "Anexo", "Pagamento"]);
    await expect(form.getByTestId("overtime-declared-total")).toBeVisible();
    await expect(form.getByText("Para conferir")).toHaveCount(0);
    const declared = form.getByRole("textbox", { name: "Dia útil, até 2 h/dia", exact: true });
    await expect(declared).toBeEditable();
    const original = await declared.inputValue();
    await declared.fill("12,5");
    await expect(declared).toHaveValue("12,5");
    await declared.fill(original);

    await form.getByRole("tab", { name: "Anexo" }).click();
    const days = form.getByTestId("overtime-days");
    if ((await days.count()) > 0) {
      await expect(days).not.toHaveAttribute("open");
      await days.locator("summary").click();
      await expect(days.getByTestId("overtime-day").first()).toBeVisible();
    }

    await form.getByRole("tab", { name: "Pagamento" }).click();
    await expect(form.getByTestId("overtime-payment-summary")).toContainText("Declaradas");
    await expect(form.getByRole("textbox", { name: "Holerite que pagou" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(form).toBeHidden();
  });

  test("pagamentos registrados preenchem as horas e os valores são recalculados no formulário", async ({ page }) => {
    const backup = await (await page.request.get("/api/recebimentos/backup")).json();
    const payments = backup.tables.overtimePayments as { overtimeMonthId: string; paymentMonth: string; hours50: string; hours75: string; hours100: string }[];
    const payment = payments.find((entry) => Number(entry.hours50) + Number(entry.hours75) + Number(entry.hours100) > 0);
    test.skip(!payment, "Sem pagamento registrado.");
    const work = (backup.tables.overtimeMonths as { id: string; month: string }[]).find((entry) => entry.id === payment!.overtimeMonthId)!;
    await openOvertime(page);
    const date = new Date(work.month);
    const monthName = date.toLocaleString("pt-BR", { month: "long", timeZone: "UTC" });
    await page.getByRole("button", { name: `Abrir ${monthName[0].toUpperCase()}${monthName.slice(1)} de ${date.getUTCFullYear()}`, exact: true }).click();
    const form = page.getByTestId("overtime-entry-form");
    await form.getByRole("tab", { name: "Pagamento", exact: true }).click();
    const block = form.locator(`[data-testid="overtime-payment-block"][data-payslip="${payment!.paymentMonth.slice(0, 7)}"]`);
    for (const percent of [50, 75, 100] as const) {
      const expected = Number(payment![`hours${percent}`]);
      const field = block.getByRole("textbox", { name: `Horas pagas a ${percent}%`, exact: true });
      await expect(field).toBeEditable();
      expect(Number((await field.inputValue()).replace(",", "."))).toBe(expected);
    }
    const value = block.getByTestId("overtime-payment-value-50");
    const before = await value.innerText();
    await block.getByRole("textbox", { name: "Horas pagas a 50%", exact: true }).fill(String(Number(payment!.hours50) + 1));
    await expect(value).not.toHaveText(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await form.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(form).toBeHidden();
  });

  test("declarar é em etapas: a folha anexada vira a declaração, e o pagamento é opcional (sem gravar)", async ({ page }) => {
    await openOvertime(page);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Versão Dividida");
    sheet.getRow(7).values = ["Date", "Week Day", "Worked", "Activities", "Project 1", "Hours"];
    sheet.getRow(8).values = [new Date("2031-11-24T00:00:00.000Z"), "segunda-feira", "Yes", "Teste", "Projeto", 10];
    sheet.getRow(9).values = [new Date("2031-11-25T00:00:00.000Z"), "terça-feira", "Yes", "Teste", "Projeto", 8];
    sheet.getRow(10).values = ["Total"];
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await page.getByTestId("overtime-declare-button").click();
    const form = page.getByTestId("overtime-entry-form");
    await expect(form.getByRole("list", { name: "Etapas do formulário" })).toContainText("Anexo (opcional)");
    await expect(form.getByRole("list", { name: "Etapas do formulário" })).toContainText("Pagamento (opcional)");

    const monthField = form.getByRole("textbox", { name: "Mês declarado" });
    await monthField.fill("11/2031");
    await monthField.blur();
    await form.getByRole("button", { name: "Continuar" }).click();

    await form.getByLabel("Folha de horas").setInputFiles({ name: "11-Novembro.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });
    // A primeira leitura compila a rota no servidor de desenvolvimento.
    await expect(form.getByTestId("overtime-attachment-match")).toContainText("2 h", { timeout: 30_000 });
    await form.getByRole("button", { name: "Continuar" }).click();

    await expect(form.getByTestId("overtime-payment-summary")).toContainText("2 h");
    await expect(form.getByRole("button", { name: "Declarar" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(form).toBeHidden();
  });

  test("sem rolagem lateral no celular e no computador", async ({ page }) => {
    await openOvertime(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    if (page.viewportSize()!.width < 640) {
      for (const width of [320, 375, 430]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.getByTestId("overtime-table").getByRole("columnheader")).toHaveText(["Mês", "Declaradas", "Pagas", "Em aberto"]);
        expect(await page.getByTestId("overtime-table-scroll").evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        if (width === 375) {
          await page.getByTestId("overtime-table").screenshot({ path: "artifacts/overtime-table-mobile.png" });
        }
      }
    } else {
      await expect(page.getByTestId("overtime-table").getByRole("columnheader", { name: "Recebido", exact: true })).toBeVisible();
    }
  });
});
