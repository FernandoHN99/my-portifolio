import { expect, test, type Page } from "@playwright/test";

import { stubQuoteChecks } from "./support/quote-checks";

// Specs 081 a 083: Gastos familiares e o menu das áreas. O usuário dos testes
// (E2E_USER_EMAIL) decide o que roda: sem a concessão da área, confere que ela
// não aparece nem responde; com ela, confere filtros, resumos e o menu, só
// lendo. Os cenários que gravam rodam só com E2E_FAMILY_WRITES=1, contra um
// servidor num schema de teste (E2E_BASE_URL), nunca sobre os dados reais.

test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

async function hasFamilyAccess(page: Page) {
  const response = await page.request.get("/api/gastos-familiares/backup");
  return response.status() === 200;
}

async function openLedger(page: Page, query = "") {
  await page.goto(`/gastos-familiares${query}`);
  await expect(page.getByTestId("family-ledger")).toHaveAttribute("data-hydrated");
}

function centsOf(text: string) {
  const negative = text.includes("−") || text.includes("-");
  const digits = text.replace(/\D/g, "");
  return (negative ? -1 : 1) * Number(digits || "0");
}

test("sem a concessão, Gastos familiares não aparece no menu nem responde por URL ou API", async ({ page }) => {
  test.skip(await hasFamilyAccess(page), "O usuário dos testes tem a área; este cenário é do amigo sem ela.");

  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
  await expect(page.getByTestId("area-sidebar")).toHaveCount(0);
  await expect(page.getByTestId("area-menu-button")).toHaveCount(0);
  await expect(page.locator('a[href="/gastos-familiares"]')).toHaveCount(0);

  const direct = await page.goto("/gastos-familiares");
  expect(direct?.status()).toBe(404);
  expect((await page.request.get("/api/gastos-familiares/backup")).status()).toBe(404);
  const restore = await page.request.post("/api/gastos-familiares/backup/restore", {
    data: { mode: "check", backup: {} },
  });
  expect(restore.status()).toBe(404);
});

test.describe("com a concessão", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await hasFamilyAccess(page)), "O usuário dos testes não tem Gastos familiares.");
  });

  test("cards e lista representam a pessoa selecionada, sem o quadro de saldos por pessoa", async ({ page }) => {
    await openLedger(page);
    await expect(page).toHaveURL(/competencia=\d{4}-\d{2}.*pessoa=/);
    const backup = await (await page.request.get("/api/gastos-familiares/backup")).json();
    const selected = new URL(page.url()).searchParams;
    const entries = (backup.tables.familyEntries as { competence: string; contactId: string; status: string; direction: string; amount: string }[])
      .filter((entry) => entry.competence.startsWith(selected.get("competencia")!) && entry.contactId === selected.get("pessoa"));
    const expected = entries.filter((entry) => entry.status === "PENDING")
      .reduce((sum, entry) => sum + Math.round(Number(entry.amount) * 100) * (entry.direction === "RECEIVABLE" ? 1 : -1), 0);
    expect(centsOf((await page.getByTestId("family-kpi-pending").textContent()) ?? "")).toBe(expected);
    await expect(page.getByTestId("family-entry-row")).toHaveCount(entries.length);
    await expect(page.getByRole("region", { name: "Saldo por pessoa" })).toHaveCount(0);
    await expect(page.getByTestId("family-footer")).toContainText((await page.getByTestId("family-kpi-pending").textContent())!.trim());

    await page.getByRole("searchbox", { name: "Buscar lançamento" }).fill("zzzz-sem-resultado");
    await expect(page.getByTestId("family-filtered-count")).toHaveText(/^0 de /);
    await expect(page.getByTestId("family-kpi-pending")).toHaveAttribute("data-cents", "0");
    await expect(page.getByTestId("family-kpi-settled")).toHaveAttribute("data-cents", "0");
    await expect(page.getByTestId("family-person-badges").locator('[aria-pressed="true"]')).toHaveCount(1);
    expect(new URL(page.url()).searchParams.get("pessoa")).toBe(selected.get("pessoa"));
  });

  test("mês atual por padrão e badges de pessoa única em ordem alfabética", async ({ page }) => {
    await openLedger(page);
    const now = new Date();
    const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    await expect(page).toHaveURL(new RegExp(`competencia=${current}`));
    const people = page.getByTestId("family-person-badges");
    const badges = people.getByRole("button");
    const names = await badges.allTextContents();
    test.skip(names.length < 2, "Precisa de duas pessoas com lançamentos no mês atual.");
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "pt-BR")));
    await expect(badges.first()).toHaveAttribute("aria-pressed", "true");
    await badges.nth(1).click();
    await expect(badges.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(people.locator('[aria-pressed="true"]')).toHaveCount(1);
    expect(new URL(page.url()).searchParams.get("pessoa")).not.toContain(",");
  });

  test("a competência é a faixa do topo, a mesma da Visão Geral, com meses únicos ou múltiplos", async ({ page }) => {
    await openLedger(page);
    const now = new Date();
    const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    await expect(page).toHaveURL(new RegExp(`competencia=${current}`));

    // A competência é a faixa do topo, a mesma da Visão Geral (spec 096): o ano
    // inteiro, fixa no alto, acima das pessoas.
    const bar = page.getByRole("navigation", { name: "Competências" });
    await expect(bar).toHaveAttribute("data-hydrated");
    const monthButtons = bar.getByRole("button", { name: / de 20\d\d/ });
    await expect(monthButtons).toHaveCount(12);
    await expect(bar.locator('[aria-current="date"]')).toHaveCount(1);
    const barBottom = await page.getByTestId("family-month-bar").evaluate((element) => element.getBoundingClientRect().bottom);
    const filtersTop = await page.getByRole("region", { name: "Filtros" }).evaluate((element) => element.getBoundingClientRect().top);
    expect(filtersTop).toBeGreaterThan(barBottom);
    await expect(page.getByTestId("family-month-bar")).toHaveCSS("position", "sticky");

    const toggle = page.getByRole("button", { name: "Selecionar vários meses" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await monthButtons.nth(1).click();
    await expect(bar.locator('[aria-current="date"]')).toHaveCount(1);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await monthButtons.first().click();
    const marked = bar.getByRole("button", { name: / de 20\d\d/, pressed: true });
    await expect(marked).toHaveCount(2);
    await expect(page.getByTestId("multi-month-count")).toHaveText("2");
    await expect(page).toHaveURL(/competencia=[^&]*%2C|competencia=[^&]*,/);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(bar.locator('[aria-current="date"]')).toHaveCount(1);
    // No modo múltiplo, tirar o último mês retorna ao atual automaticamente.
    await toggle.click();
    await marked.click();
    await expect(page).toHaveURL(new RegExp(`competencia=${current}`));
  });

  test("competência limita pessoas e status no computador e na folha do celular", async ({ page }, testInfo) => {
    const backup = await (await page.request.get("/api/gastos-familiares/backup")).json();
    const entries = backup.tables.familyEntries as { competence: string; contactId: string; status: string }[];
    const contacts = backup.tables.familyContacts as { id: string; name: string }[];
    const months = [...new Set(entries.map((entry) => entry.competence.slice(0, 7)))];
    const month = months.find((value) => {
      const people = new Set(entries.filter((entry) => entry.competence.startsWith(value)).map((entry) => entry.contactId));
      return people.size > 0 && people.size < contacts.length;
    });
    test.skip(!month, "Precisa de competência que não contenha todas as pessoas.");
    const monthEntries = entries.filter((entry) => entry.competence.startsWith(month!));
    const peopleIds = new Set(monthEntries.map((entry) => entry.contactId));
    const names = contacts.filter((contact) => peopleIds.has(contact.id)).map((contact) => contact.name).sort();
    await openLedger(page, `?competencia=${month}`);
    const mobile = testInfo.project.name !== "desktop-chrome";
    const chosenName = names.at(-1)!;
    if (mobile) {
      await page.getByRole("button", { name: /^Filtros/ }).click();
      const sheet = page.getByTestId("family-filter-sheet");
      for (const contact of contacts) {
        await expect(sheet.getByRole("button", { name: contact.name, exact: true })).toHaveCount(peopleIds.has(contact.id) ? 1 : 0);
      }
      await sheet.getByRole("button", { name: chosenName, exact: true }).click();
      const person = contacts.find((contact) => contact.name === chosenName)!;
      const statuses = new Set(monthEntries.filter((entry) => entry.contactId === person.id).map((entry) => entry.status));
      await expect(sheet.getByRole("button", { name: "Pendente", exact: true })).toHaveCount(statuses.has("PENDING") ? 1 : 0);
      await expect(sheet.getByRole("button", { name: "Acertado", exact: true })).toHaveCount(statuses.has("SETTLED") ? 1 : 0);
      await sheet.getByRole("button", { name: "Fechar", exact: true }).click();
    } else {
      await page.getByRole("combobox", { name: /^Pessoa/ }).click();
      await expect(page.getByRole("option")).toHaveCount(names.length);
      expect((await page.getByRole("option").allTextContents()).map((text) => text.trim()).sort()).toEqual(names);
      await page.getByRole("option", { name: chosenName, exact: true }).click();
      await page.keyboard.press("Escape");
      const person = contacts.find((contact) => contact.name === chosenName)!;
      const statuses = new Set(monthEntries.filter((entry) => entry.contactId === person.id).map((entry) => entry.status));
      await page.getByRole("combobox", { name: "Status", exact: true }).click();
      await expect(page.getByRole("option", { name: "Pendente", exact: true })).toHaveCount(statuses.has("PENDING") ? 1 : 0);
      await expect(page.getByRole("option", { name: "Acertado", exact: true })).toHaveCount(statuses.has("SETTLED") ? 1 : 0);
      await page.keyboard.press("Escape");
    }
    await expect(page.getByTestId("family-person-badges").getByRole("button", { name: chosenName, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("family-person-badges").locator('[aria-pressed="true"]')).toHaveCount(1);
    const list = page.getByRole("region", { name: "Lançamentos", exact: true });
    await expect(list.getByRole("checkbox")).toHaveCount(0);
    await expect(list.getByRole("columnheader")).toHaveCount(0);
    await expect(list.getByRole("listitem").first()).toBeVisible();
    await expect(page.getByTestId("area-location")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pessoas", exact: true })).toHaveCount(0);
  });

  test("os filtros da área não mudam o mês da carteira", async ({ page }) => {
    await openLedger(page, "?competencia=2026-09");
    const investments = page.getByTestId("area-link-investments");
    const href = await investments.first().getAttribute("href");
    expect(href).not.toContain("mes=");
    expect(href).not.toContain("competencia");
  });

  test("menu das áreas: barra lateral no computador e hambúrguer no celular, sem rolagem lateral", async ({ page }, testInfo) => {
    await openLedger(page);
    const mobile = testInfo.project.name !== "desktop-chrome";

    if (!mobile) {
      await expect(page.getByTestId("area-sidebar")).toBeVisible();
      await expect(page.getByTestId("area-menu-button")).toBeHidden();
      await expect(page.getByTestId("area-link-family-expenses").first()).toHaveAttribute("aria-current", "page");
      return;
    }

    await expect(page.getByTestId("area-sidebar")).toBeHidden();
    const button = page.getByTestId("area-menu-button");
    await button.click();
    const menu = page.getByTestId("area-menu");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();

    for (const width of [320, 375, 430]) {
      await page.setViewportSize({ width, height: 860 });
      await openLedger(page);
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(scrollWidth, `${width} px`).toBeLessThanOrEqual(innerWidth);
    }

    await button.click();
    await menu.getByRole("link", { name: "Investimentos" }).click();
    // A primeira abertura de uma página no servidor de desenvolvimento compila a rota.
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
    await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
  });
});

test.describe("gravações (só em schema de teste)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(process.env.E2E_FAMILY_WRITES !== "1", "Grava: rode com E2E_FAMILY_WRITES=1 num servidor em schema de teste.");
    test.skip(testInfo.project.name !== "desktop-chrome", "Um navegador basta para as gravações.");
    test.skip(!(await hasFamilyAccess(page)), "O usuário dos testes não tem Gastos familiares.");
  });

  test("parcelado gera os meses, o acerto em lote lista os escolhidos, e desfazer e excluir voltam ao início", async ({ page }) => {
    const description = `E2E parcela ${Date.now()}`;
    await openLedger(page);
    await page.getByRole("button", { name: "Novo lançamento" }).click();
    const form = page.getByTestId("family-entry-form");
    await form.getByRole("textbox", { name: "Descrição" }).fill(description);
    await form.getByRole("radio", { name: /^Parcelado/ }).click();
    await form.getByRole("textbox", { name: "Valor de cada mês" }).fill("12,34");
    await form.getByRole("textbox", { name: "Quantidade de parcelas" }).fill("3");
    await expect(form.getByTestId("family-entry-preview")).toContainText("3 × R$ 12,34");
    await form.getByRole("button", { name: "Gerar 3 parcelas" }).click();
    await expect(page.getByRole("status").filter({ hasText: "3 lançamentos incluídos" })).toBeVisible();

    const backup = await (await page.request.get("/api/gastos-familiares/backup")).json();
    const created = (backup.tables.familyEntries as { description: string; competence: string; contactId: string }[])
      .filter((entry) => entry.description === description);
    expect(created).toHaveLength(3);
    const query = new URLSearchParams({
      competencia: created.map((entry) => entry.competence.slice(0, 7)).join(","),
      pessoa: created[0].contactId,
      q: description,
    });
    await openLedger(page, `?${query}`);
    await expect(page.getByTestId("family-entry-row")).toHaveCount(3);
    await expect(page.getByRole("button", { name: `${description} (1/3)`, exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Acertar pendentes", exact: true }).click();
    const dialog = page.getByTestId("family-settle-dialog");
    await expect(dialog.getByTestId("family-settle-entry").filter({ hasText: description })).toHaveCount(3);
    await expect(dialog.getByTestId("family-settle-total")).toContainText("+R$ 37,02");
    await dialog.getByRole("button", { name: "Acertar 3" }).click();
    await expect(page.locator('[data-testid=family-entry-row][data-status="SETTLED"]')).toHaveCount(3);

    await page.getByRole("button", { name: `Reverter acerto de ${description} (1/3)`, exact: true }).click();
    await expect(page.locator('[data-testid=family-entry-row][data-status="PENDING"]')).toHaveCount(1);
    await page.getByRole("status").filter({ hasText: "Lançamento voltou a pendente." }).getByRole("button", { name: "Desfazer" }).click();
    await expect(page.locator('[data-testid=family-entry-row][data-status="SETTLED"]')).toHaveCount(3);
    for (let index = 1; index <= 3; index++) {
      await page.getByRole("button", { name: `Reverter acerto de ${description} (${index}/3)`, exact: true }).click();
      await expect(page.locator('[data-testid=family-entry-row][data-status="PENDING"]')).toHaveCount(index);
    }

    await page.getByRole("button", { name: `${description} (2/3)`, exact: true }).click();
    await form.getByRole("radio", { name: /Série inteira/ }).click();
    await form.getByRole("button", { name: "Excluir pendentes" }).click();
    await expect(page.getByTestId("family-entry-row")).toHaveCount(0);


  });
});
