import { expect, test, type Page } from "@playwright/test";

import { stubQuoteChecks } from "./support/quote-checks";

// Spec 089: Previdência, só leitura. Sem a concessão, 404 e nenhum link; com
// ela, o limite de 12%, o aportado e o que falta fecham entre si, e os meses
// trabalhados levam a Recebimentos.

test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

async function hasPensionAccess(page: Page) {
  return (await page.request.get("/previdencia")).status() === 200;
}

async function openPension(page: Page, query = "") {
  await page.goto(`/previdencia${query}`);
  await expect(page.getByTestId("pension-view")).toHaveAttribute("data-hydrated");
}

const centsOf = async (page: Page, testId: string) => Number(await page.getByTestId(testId).getAttribute("data-cents"));

test("sem a concessão, Previdência não aparece no menu nem responde por URL", async ({ page }) => {
  test.skip(await hasPensionAccess(page), "O usuário dos testes tem a área; este cenário é do amigo sem ela.");

  await page.goto("/");
  await expect(page.locator('a[href="/previdencia"]')).toHaveCount(0);
  expect((await page.goto("/previdencia"))?.status()).toBe(404);
});

test.describe("com a concessão", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await hasPensionAccess(page)), "O usuário dos testes não tem Previdência.");
  });

  test("em cada ano, limite, aportado e o que falta fecham entre si", async ({ page }) => {
    await openPension(page);
    const years = await page.getByTestId("pension-year-badges").getByRole("button").allTextContents();

    for (const year of years) {
      await openPension(page, `?ano=${year.trim()}`);
      const taxable = await centsOf(page, "pension-kpi-taxable");
      const limit = await centsOf(page, "pension-kpi-limit");
      const contributed = await centsOf(page, "pension-kpi-contributed");
      const remaining = await centsOf(page, "pension-kpi-remaining");
      expect(limit, year).toBe(Math.round((taxable * 12) / 100));
      // Sem holerites não há limite, e o cartão não inventa o que falta.
      expect(remaining, year).toBe(limit > 0 ? Math.abs(limit - contributed) : 0);

      if (limit > 0) {
        // A barra do uso do limite diz o mesmo que os cartões.
        const percent = Math.round((contributed / limit) * 100);
        await expect(page.getByTestId("pension-usage"), year).toHaveAttribute("data-percent", String(percent));
        await expect(page.getByRole("meter", { name: "Aportado em relação ao limite" }), year).toHaveAttribute(
          "aria-valuenow",
          String(Math.min(percent, 100)),
        );
        await expect(page.getByTestId("pension-kpi-remaining").locator("xpath=ancestor::article[1]"), year).toContainText(
          contributed > limit ? "Acima do limite" : contributed === limit ? "Limite atingido" : "Falta aportar",
        );
      } else {
        await expect(page.getByTestId("pension-limit"), year).toContainText("Nenhum holerite");
      }

      const total = page.getByTestId("pension-total-contributed");
      if ((await total.count()) > 0) {
        expect(await centsOf(page, "pension-total-contributed")).toBe(contributed);
      }
    }
  });

  test("um mês trabalhado abre o mês em Recebimentos", async ({ page }) => {
    await openPension(page);
    const years = await page.getByTestId("pension-year-badges").getByRole("button").allTextContents();
    let link = null;

    for (const year of years) {
      await openPension(page, `?ano=${year.trim()}`);
      const candidate = page.locator('[data-testid="pension-periods"] a[href^="/recebimentos?mes="]:visible').first();
      if ((await candidate.count()) > 0) {
        link = candidate;
        break;
      }
    }

    test.skip(!link, "Sem holerites em Recebimentos.");
    const href = await link!.getAttribute("href");
    await link!.click();
    await expect(page.getByTestId("income-month-form")).toBeVisible({ timeout: 20_000 });
    expect(href).toMatch(/mes=\d{4}-\d{2}$/);
  });

  test("sem rolagem lateral no celular e no computador", async ({ page }, testInfo) => {
    const widths = testInfo.project.name === "desktop-chrome" ? [1024, 1280] : [320, 375, 430];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 860 });
      await openPension(page);
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
      expect(scrollWidth, `${width} px`).toBeLessThanOrEqual(innerWidth);
    }
  });
});
