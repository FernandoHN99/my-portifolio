import { expect, test, type Page } from "@playwright/test";

const timeline = (page: Page) => page.getByRole("navigation", { name: "Competências" });
const year = (page: Page, value: number) =>
  timeline(page).getByRole("button", { name: String(value), exact: true });
const month = (page: Page, label: string) =>
  timeline(page).getByRole("button", { name: new RegExp(`^${label}`) });

// Os botões de ano e as setas só respondem depois da hidratação do React.
async function openTimeline(page: Page, url: string) {
  await page.goto(url);
  await page.waitForFunction(() => {
    const strip = document.querySelector("nav[aria-label='Competências']");
    return Boolean(strip && Object.keys(strip).some((key) => key.startsWith("__reactFiber")));
  });
}

test("a linha do tempo abre só o ano da competência", async ({ page }) => {
  await openTimeline(page, "/?mes=2026-02");

  await expect(month(page, "Fevereiro de 2026")).toHaveAttribute("aria-current", "date");
  await expect(year(page, 2026)).toHaveAttribute("aria-expanded", "true");
  await expect(year(page, 2025)).toHaveAttribute("aria-expanded", "false");
  await expect(timeline(page).getByRole("button", { name: / de 2025/ })).toHaveCount(0);
  await expect(month(page, "Janeiro de 2026")).toHaveAttribute("aria-label", /^Janeiro de 2026, [+-]/);
});

test("abrir outro ano não troca a competência até escolher um mês", async ({ page }) => {
  await openTimeline(page, "/?mes=2026-02");
  await expect(page.getByText("Fevereiro de 2026", { exact: true })).toBeVisible();

  await year(page, 2025).click();
  await expect(year(page, 2025)).toHaveAttribute("aria-expanded", "true");
  await expect(year(page, 2026)).toHaveAttribute("aria-expanded", "false");
  await expect(month(page, "Dezembro de 2025")).toBeVisible();
  await expect(timeline(page).getByRole("button", { name: / de 2026/ })).toHaveCount(0);
  await expect(page).toHaveURL(/mes=2026-02/);
  await expect(page.getByText("Fevereiro de 2026", { exact: true })).toBeVisible();

  await month(page, "Dezembro de 2025").click();
  await expect(page).toHaveURL(/mes=2025-12/);
  await expect(month(page, "Dezembro de 2025")).toHaveAttribute("aria-current", "date");
  await expect(page.getByText("Dezembro de 2025", { exact: true })).toBeVisible();
});

test("as setas atravessam o ano e a competência fica na URL", async ({ page }) => {
  await openTimeline(page, "/?mes=2026-01");
  await expect(month(page, "Janeiro de 2026")).toHaveAttribute("aria-current", "date");

  await page.getByRole("button", { name: "Mês anterior" }).click();
  await expect(page).toHaveURL(/mes=2025-12/);
  await expect(year(page, 2025)).toHaveAttribute("aria-expanded", "true");
  await expect(month(page, "Dezembro de 2025")).toHaveAttribute("aria-current", "date");
  await expect(page.getByText("Dezembro de 2025", { exact: true })).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/mes=2026-01/);
  await expect(month(page, "Janeiro de 2026")).toHaveAttribute("aria-current", "date");

  await page.reload();
  await expect(month(page, "Janeiro de 2026")).toHaveAttribute("aria-current", "date");
});

test("a linha do tempo cabe na tela sem deslocar a página", async ({ page, isMobile }) => {
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

  if (!isMobile) {
    expect((await measure()).fits).toBe(true);
  }

  await month(page, "Agosto de 2026").click();
  await expect(page).toHaveURL(/mes=2026-08/);
  await expect.poll(async () => (await measure()).activeVisible).toBe(true);
  expect((await measure()).pageLeft).toBe(0);
});

test("alterações pendentes seguram a troca de mês, mas não a de ano", async ({ page }) => {
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });

  await openTimeline(page, "/posicoes");
  await page.getByRole("button", { name: "Editar posições" }).click();
  await page
    .getByRole("textbox", { name: /^(Quantidade|Saldo) de / })
    .first()
    .fill("1");
  await expect(page.getByText("1 alteração pendente")).toBeVisible();

  const active = timeline(page).locator("[aria-current='date']");
  const activeLabel = await active.getAttribute("aria-label");

  await page.getByRole("button", { name: "Mês anterior" }).click();
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toContain("alteração não salva");
  await expect(page).not.toHaveURL(/mes=/);
  await expect(active).toHaveAttribute("aria-label", activeLabel!);

  await year(page, 2024).click();
  await expect(year(page, 2024)).toHaveAttribute("aria-expanded", "true");
  expect(dialogs).toHaveLength(1);
  await expect(page.getByText("1 alteração pendente")).toBeVisible();

  await page.getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByText(/alteraç(ão|ões) pendente/)).toHaveCount(0);
});

test.describe("com movimento reduzido", () => {
  test.use({ reducedMotion: "reduce" });

  test("trocar de ano mostra os meses sem animar a largura", async ({ page }) => {
    await openTimeline(page, "/?mes=2026-02");

    await year(page, 2024).click();
    await expect(year(page, 2024)).toHaveAttribute("aria-expanded", "true");
    await expect(timeline(page).getByRole("button", { name: / de 2024/ }).first()).toBeVisible();
    await expect(timeline(page).getByRole("button", { name: / de 2026/ })).toHaveCount(0);
  });
});
