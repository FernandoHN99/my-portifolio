import { expect, test, type Page } from "@playwright/test";

import { waitForCompetenceHydration } from "./support/competence";
import { stubQuoteChecks } from "./support/quote-checks";

// A checagem de abertura grava no banco e pode criar competências; os
// cenários usam a resposta fixa para não alterar os dados reais.
test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

const timeline = (page: Page) => page.getByRole("navigation", { name: "Competências" });
const year = (page: Page, value: number) =>
  timeline(page).getByRole("button", { name: String(value), exact: true });
const month = (page: Page, label: string) =>
  timeline(page).getByRole("button", { name: new RegExp(`^${label}`) });

// Os botões de ano e de mês só respondem depois da hidratação do React.
async function openTimeline(page: Page, url: string) {
  await page.goto(url);
  await waitForCompetenceHydration(page);
}

// A faixa é do computador; no celular a competência abre numa folha
// (spec 096), coberta em month-sheet.spec.ts.
const STRIP_ONLY = "A faixa de competências é do computador; no celular vale a folha (month-sheet.spec.ts).";

test("a linha do tempo abre só o ano da competência", async ({ page, isMobile }) => {
  test.skip(isMobile, STRIP_ONLY);
  await openTimeline(page, "/?mes=2026-02");

  await expect(month(page, "Fevereiro de 2026")).toHaveAttribute("aria-current", "date");
  await expect(year(page, 2026)).toHaveAttribute("aria-expanded", "true");
  await expect(year(page, 2025)).toHaveAttribute("aria-expanded", "false");
  await expect(timeline(page).getByRole("button", { name: / de 2025/ })).toHaveCount(0);
  await expect(month(page, "Janeiro de 2026")).toHaveAttribute("aria-label", /^Janeiro de 2026, [+-]/);
});

test("abrir outro ano não troca a competência até escolher um mês", async ({ page, isMobile }) => {
  test.skip(isMobile, STRIP_ONLY);
  await openTimeline(page, "/?mes=2026-02");
  await expect(month(page, "Fevereiro de 2026")).toHaveAttribute("aria-current", "date");

  await year(page, 2025).click();
  await expect(year(page, 2025)).toHaveAttribute("aria-expanded", "true");
  await expect(year(page, 2026)).toHaveAttribute("aria-expanded", "false");
  await expect(month(page, "Dezembro de 2025")).toBeVisible();
  await expect(timeline(page).getByRole("button", { name: / de 2026/ })).toHaveCount(0);
  await expect(year(page, 2026)).toHaveAccessibleDescription(
    "Competência selecionada: Fevereiro de 2026",
  );
  await expect(page).toHaveURL(/mes=2026-02/);

  await month(page, "Dezembro de 2025").click();
  await expect(page).toHaveURL(/mes=2025-12/);
  await expect(month(page, "Dezembro de 2025")).toHaveAttribute("aria-current", "date");
});

test("o teclado atravessa o ano e a competência fica na URL, sem setas na tela", async ({ page, isMobile }) => {
  test.skip(isMobile, STRIP_ONLY);
  await openTimeline(page, "/?mes=2026-01");
  await expect(month(page, "Janeiro de 2026")).toHaveAttribute("aria-current", "date");
  await expect(page.getByRole("button", { name: /Mês anterior|Próximo mês|Mais recente/ })).toHaveCount(0);

  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(/mes=2025-12/);
  await expect(year(page, 2025)).toHaveAttribute("aria-expanded", "true");
  await expect(month(page, "Dezembro de 2025")).toHaveAttribute("aria-current", "date");

  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/mes=2026-01/);
  await expect(month(page, "Janeiro de 2026")).toHaveAttribute("aria-current", "date");

  await page.reload();
  await expect(month(page, "Janeiro de 2026")).toHaveAttribute("aria-current", "date");
});

test("consultar outro ano não o reabre quando a competência volta", async ({ page, isMobile }) => {
  test.skip(isMobile, STRIP_ONLY);
  await openTimeline(page, "/?mes=2026-02");

  await year(page, 2024).click();
  await expect(year(page, 2024)).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/mes=2026-03/);
  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(/mes=2026-02/);
  await expect(year(page, 2026)).toHaveAttribute("aria-expanded", "true");
  await expect(year(page, 2024)).toHaveAttribute("aria-expanded", "false");
  await expect(month(page, "Fevereiro de 2026")).toHaveAttribute("aria-current", "date");
});

test("o cadeado mostra se o mês está aberto ou fechado", async ({ page }) => {
  // Agosto de 2026 veio da planilha e está fechado: abrir pede confirmação.
  await openTimeline(page, "/posicoes?mes=2026-08");
  const lock = page.getByTestId("month-lock");
  await expect(lock).toHaveAttribute("data-state", "closed");
  await expect(lock).toContainText("Fechado");
  await expect(page.getByRole("button", { name: "Adicionar posição" })).toHaveCount(0);
  await expect(page.getByTestId("month-locked")).toContainText("Ago/26 está fechado");

  await lock.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Abrir Ago/26?");
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(lock).toHaveAttribute("data-state", "closed");

  // O mês mais recente, quando em rascunho, está aberto e oferece fechar.
  await openTimeline(page, "/posicoes");
  const latest = page.getByTestId("month-lock");
  test.skip((await latest.getAttribute("data-state")) !== "open", "O mês mais recente está fechado nos dados reais.");
  await expect(latest.getByRole("button", { name: /^Fechar / })).toBeVisible();
  await expect(page.getByRole("button", { name: "Adicionar posição" })).toBeVisible();
});

test("o foco segue para o ano que abre mesmo com toques seguidos", async ({ page, isMobile }) => {
  test.skip(isMobile, STRIP_ONLY);
  await openTimeline(page, "/?mes=2026-01");
  await month(page, "Janeiro de 2026").focus();

  await page.keyboard.press("ArrowLeft");
  await expect(month(page, "Dezembro de 2025")).toHaveAttribute("aria-current", "date");
  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(/mes=2025-11/);
  await expect(month(page, "Novembro de 2025")).toHaveAttribute("aria-current", "date");

  // O painel de 2026 já saiu; o foco não pode ter ido com ele.
  await expect(timeline(page).getByRole("button", { name: / de 2026/ })).toHaveCount(0);
  await expect(month(page, "Dezembro de 2025")).toBeFocused();
});

test("a linha do tempo cabe na tela sem deslocar a página", async ({ page, isMobile }) => {
  test.skip(isMobile, STRIP_ONLY);
  await openTimeline(page, "/?mes=2026-09");
  await expect(page.getByTestId("portfolio-total")).toContainText("R$");
  await expect(month(page, "Setembro de 2026")).toHaveAttribute("aria-current", "date");

  const measure = () =>
    timeline(page).evaluate((strip) => {
      const active = strip.querySelector("[aria-current='date']")!.getBoundingClientRect();
      const box = strip.getBoundingClientRect();

      return {
        fits: strip.scrollWidth <= strip.clientWidth,
        activeVisible: active.left >= box.left - 1 && active.right <= box.right + 1,
        pageLeft: window.visualViewport?.pageLeft ?? window.scrollX,
      };
    });

  await expect.poll(async () => (await measure()).activeVisible).toBe(true);
  expect((await measure()).pageLeft).toBe(0);

  expect((await measure()).fits).toBe(true);

  await month(page, "Agosto de 2026").click();
  await expect(page).toHaveURL(/mes=2026-08/);
  await expect.poll(async () => (await measure()).activeVisible).toBe(true);
  expect((await measure()).pageLeft).toBe(0);
});

test("alterações pendentes seguram a troca de mês, mas não a de ano", async ({ page, isMobile }) => {
  test.skip(isMobile, STRIP_ONLY);
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });

  // As posições salvam pelo formulário, na hora (spec 043); a configuração das
  // metas continua com alterações pendentes até salvar.
  await openTimeline(page, "/configuracao?mes=2026-09");
  await page.getByRole("textbox", { name: "Tolerância em pontos percentuais" }).fill("3");
  await expect(page.getByText("1 alteração", { exact: true })).toBeVisible();

  const active = timeline(page).locator("[aria-current='date']");
  const activeLabel = await active.getAttribute("aria-label");

  await timeline(page).locator("[data-expanded] [role='group'] button:not([aria-current])").first().click();
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toContain("alteração não salva");
  await expect(page).toHaveURL(/mes=2026-09/);
  await expect(active).toHaveAttribute("aria-label", activeLabel!);

  await year(page, 2024).click();
  await expect(year(page, 2024)).toHaveAttribute("aria-expanded", "true");
  expect(dialogs).toHaveLength(1);

  await page.getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByText("1 alteração", { exact: true })).toHaveCount(0);
});

test.describe("com movimento reduzido", () => {
  test.use({ reducedMotion: "reduce" });

  test("trocar de ano mostra os meses sem animar a largura", async ({ page, isMobile }) => {
    test.skip(isMobile, STRIP_ONLY);
    await openTimeline(page, "/?mes=2026-02");

    // Mede, a cada quadro, a fração aberta de cada painel de meses. Sem
    // animação de largura, nenhum quadro mostra um painel pela metade.
    const sampling = timeline(page).evaluate(
      (strip) =>
        new Promise<{ panel: string; open: number }[]>((resolve) => {
          const samples: { panel: string; open: number }[] = [];
          const start = performance.now();
          const record = () => {
            for (const panel of strip.querySelectorAll("[role='group']")) {
              const content = panel.firstElementChild!.getBoundingClientRect().width;
              samples.push({
                panel: panel.getAttribute("aria-label")!,
                open: panel.getBoundingClientRect().width / content,
              });
            }

            if (performance.now() - start < 800) {
              requestAnimationFrame(record);
            } else {
              resolve(samples);
            }
          };
          requestAnimationFrame(record);
        }),
    );

    await year(page, 2024).click();
    await expect(year(page, 2024)).toHaveAttribute("aria-expanded", "true");
    await expect(timeline(page).getByRole("button", { name: / de 2024/ }).first()).toBeVisible();
    await expect(timeline(page).getByRole("button", { name: / de 2026/ })).toHaveCount(0);

    const samples = await sampling;
    expect(samples.some((sample) => sample.panel === "Meses de 2024" && sample.open > 0.99)).toBe(
      true,
    );
    expect(samples.filter((sample) => sample.open > 0.01 && sample.open < 0.99)).toEqual([]);
  });
});
