import { expect, test, type Page } from "@playwright/test";

import { waitForHydration } from "./support/position-form";
import { stubQuoteChecks } from "./support/quote-checks";

// Spec 074: a Configuração não rola na horizontal em telas estreitas. A revisão
// do iPhone (spec 062) só conferiu 430 px; o iPhone de 390 px passava 32 px da
// borda. Nenhum cenário grava: o de edição altera o rascunho e descarta.
test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chrome" && testInfo.project.name !== "mobile-safari",
    "Largura conferida no desktop e no iPhone.",
  );
  await stubQuoteChecks(page);
});

const WIDTHS = [320, 360, 375, 390, 414, 430];
const HEIGHT = 900;

type Overflow = { scrollWidth: number; innerWidth: number; offenders: string[] };

// Além da largura, lista quem passa da borda e não está dentro de uma área de
// rolagem própria (tabelas), para o erro apontar o elemento e não só o número.
async function measureOverflow(page: Page): Promise<Overflow> {
  return page.evaluate(() => {
    const limit = window.innerWidth;
    const offenders: string[] = [];

    const insideScroller = (element: Element) => {
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const { overflowX } = getComputedStyle(parent);
        if (overflowX === "auto" || overflowX === "scroll" || overflowX === "hidden") {
          return true;
        }
      }
      return false;
    };

    for (const element of document.body.querySelectorAll("*")) {
      const { right, width } = element.getBoundingClientRect();
      if (width > 0 && right > limit + 0.5 && !insideScroller(element)) {
        const classes = element.getAttribute("class")?.slice(0, 80) ?? "";
        offenders.push(`<${element.tagName.toLowerCase()} class="${classes}"> termina em ${Math.round(right)} px`);
      }
    }

    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: limit,
      offenders: offenders.slice(0, 8),
    };
  });
}

async function expectNoHorizontalScroll(page: Page, width: number) {
  const overflow = await measureOverflow(page);
  expect(
    overflow.scrollWidth,
    `${width} px: scrollWidth ${overflow.scrollWidth} > innerWidth ${overflow.innerWidth}\n${overflow.offenders.join("\n")}`,
  ).toBeLessThanOrEqual(overflow.innerWidth);
}

// A matriz de renda fixa e a tabela da prévia têm rolagem própria como rede de
// segurança, mas nas larguras de celular devem caber sem usá-la.
async function expectTablesFit(page: Page, width: number) {
  for (const scroller of [
    page.locator('section[aria-label^="Renda fixa"] div.overflow-x-auto'),
    page.locator("aside div.overflow-x-auto"),
  ]) {
    const { clientWidth, scrollWidth } = await scroller.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(scrollWidth, `${width} px: tabela com rolagem própria (${scrollWidth} > ${clientWidth})`).toBeLessThanOrEqual(
      clientWidth,
    );
  }
}

async function openSettings(page: Page, width: number) {
  await page.setViewportSize({ width, height: HEIGHT });
  await page.goto("/configuracao?mes=2026-09");
  await expect(page.getByRole("heading", { level: 1, name: "Metas da carteira" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Percentual de Caixa" })).toBeVisible();
  await waitForHydration(page);
}

test("a Configuração não rola na horizontal entre 320 e 430 px", async ({ page }) => {
  for (const width of WIDTHS) {
    await openSettings(page, width);
    await expectNoHorizontalScroll(page, width);
    await expectTablesFit(page, width);
  }
});

test("as metas em edição, com a soma fora de 100%, também cabem na largura", async ({ page }) => {
  for (const width of [320, 390]) {
    await openSettings(page, width);

    // Percentuais novos deixam os grupos sem somar 100%, mostram a faixa de alterações e, na prévia, o
    // valor antigo riscado ao lado do novo.
    await page.getByRole("textbox", { name: "Percentual de Caixa" }).fill("40");
    await page.getByRole("textbox", { name: "Percentual de Cripto" }).fill("10");
    await expect(page.getByRole("button", { name: "Descartar" })).toBeVisible();

    // No celular, a prévia de comprar e vender sai (spec 080).
    await expect(page.getByRole("complementary", { name: "Prévia do rebalanceamento" })).toBeHidden();
    await expectNoHorizontalScroll(page, width);
    await expectTablesFit(page, width);

    await page.getByRole("button", { name: "Descartar" }).click();
    await expect(page.getByRole("button", { name: "Descartar" })).toHaveCount(0);
  }
});
