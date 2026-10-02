import { expect, test, type Page } from "@playwright/test";

import { stubQuoteChecks } from "./support/quote-checks";

// A checagem de abertura grava no banco e pode criar competências; os
// cenários usam a resposta fixa para não alterar os dados reais.
test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

// Cenários da spec 027. Nenhum grava: cada um altera o rascunho e descarta.

async function openSettings(page: Page) {
  await page.goto("/configuracao?mes=2026-09");
  await expect(page.getByRole("heading", { level: 1, name: "Metas da carteira" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Percentual de Caixa" })).toBeVisible();
}

// Gesto de toque real, pelo protocolo do Chrome: `page.mouse` não passa pela rolagem por toque nem pelo
// `touch-action`, e `page.touchscreen` só sabe tocar.
async function touchGesture(page: Page, from: { x: number; y: number }, moves: { x: number; y: number }[]) {
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (const point of moves) {
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await client.detach();
}

function path(from: { x: number; y: number }, dx: number, dy: number, steps: number) {
  return Array.from({ length: steps }, (_, index) => ({
    x: from.x + (dx * (index + 1)) / steps,
    y: from.y + (dy * (index + 1)) / steps,
  }));
}

async function discardIfPending(page: Page) {
  const discard = page.getByRole("button", { name: "Descartar" });
  if (await discard.isVisible()) {
    await discard.click();
  }
  await expect(discard).toHaveCount(0);
}

test("o deslizante de meta anda de 1 em 1 ponto", async ({ page }) => {
  await openSettings(page);

  const caixa = page.getByRole("textbox", { name: "Percentual de Caixa" });
  const original = await caixa.inputValue();
  const slider = page.getByRole("slider", { name: "Meta de Caixa" });
  await slider.scrollIntoViewIfNeeded();
  const thumb = await slider.boundingBox();
  if (!thumb) {
    throw new Error("Deslizante de Caixa sem posição na tela.");
  }

  const y = thumb.y + thumb.height / 2;
  const startX = thumb.x + thumb.width / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  const seen = new Set<string>();
  for (let step = 1; step <= 16; step += 1) {
    await page.mouse.move(startX + step * 3, y);
    seen.add(await caixa.inputValue());
  }
  await page.mouse.up();

  seen.delete(original);
  expect(seen.size).toBeGreaterThan(1);
  for (const value of seen) {
    expect(value, `valor ${value} ao arrastar`).toMatch(/^\d+$/);
  }

  const dragged = Number(await caixa.inputValue());
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(caixa).toHaveValue(String(dragged + 1));

  await discardIfPending(page);
  await expect(caixa).toHaveValue(original);
});

test("o valor quebrado digitado fica no deslizante até ele ser movido", async ({ page }) => {
  await openSettings(page);

  const caixa = page.getByRole("textbox", { name: "Percentual de Caixa" });
  const slider = page.getByRole("slider", { name: "Meta de Caixa" });

  await caixa.fill("15,5");
  await expect(slider).toHaveAttribute("aria-valuenow", "15.5");
  await expect(slider).toHaveAttribute("aria-valuetext", "15,5%");
  await expect(caixa).toHaveValue("15,5");

  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(caixa).toHaveValue("16");
  await page.keyboard.press("ArrowRight");
  await expect(caixa).toHaveValue("17");

  await caixa.fill("15,5");
  await slider.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(caixa).toHaveValue("15");

  // O passo largo segue a mesma regra: do valor quebrado, até o inteiro mais distante dentro de 10 pontos.
  for (const [key, expected] of [
    ["Shift+ArrowRight", "25"],
    ["PageUp", "25"],
    ["Shift+ArrowLeft", "6"],
    ["PageDown", "6"],
  ] as const) {
    await caixa.fill("15,5");
    await slider.focus();
    await page.keyboard.press(key);
    await expect(caixa, key).toHaveValue(expected);
  }

  // O `input type="range"` oculto guarda 16 para 15,5; um ajuste por ele, como o de leitores de tela,
  // também parte do valor exibido e vai a 16, não a 17.
  await caixa.fill("15,5");
  await slider.evaluate((input: HTMLInputElement) => {
    input.stepUp();
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(caixa).toHaveValue("16");

  const tolerance = page.getByRole("textbox", { name: "Tolerância em pontos percentuais" });
  const toleranceSlider = page.getByRole("slider", { name: "Faixa de tolerância" });
  await tolerance.fill("2,25");
  await expect(toleranceSlider).toHaveAttribute("aria-valuenow", "2.25");
  await expect(tolerance).toHaveValue("2,25");
  await toleranceSlider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(tolerance).toHaveValue("3");
  await page.keyboard.press("ArrowRight");
  await expect(tolerance).toHaveValue("4");

  await discardIfPending(page);
});

test("editar uma meta não troca a aba da prévia", async ({ page }) => {
  await openSettings(page);

  const preview = page.getByRole("complementary", { name: "Prévia do rebalanceamento" });
  const moeda = preview.getByRole("button", { name: "Moeda", exact: true });
  await moeda.scrollIntoViewIfNeeded();
  await moeda.click();
  await expect(moeda).toHaveAttribute("aria-pressed", "true");

  const caixa = page.getByRole("textbox", { name: "Percentual de Caixa" });
  await caixa.fill("20");
  await expect(page.getByText("1 grupo não soma 100%")).toBeVisible();
  await expect(moeda).toHaveAttribute("aria-pressed", "true");

  const estrategia = page.getByRole("slider", { name: "Meta de Core", exact: true });
  await estrategia.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(moeda).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("slider", { name: "Faixa de tolerância" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(moeda).toHaveAttribute("aria-pressed", "true");
  await expect(preview.getByRole("button", { name: "Classe", exact: true })).toHaveAttribute("aria-pressed", "false");

  await discardIfPending(page);
  await expect(moeda).toHaveAttribute("aria-pressed", "true");
});

test("restaurar o padrão do Excel volta as metas e a tolerância", async ({ page }) => {
  await openSettings(page);

  const restore = page.getByRole("button", { name: "Restaurar padrão do Excel" });
  const tolerance = page.getByRole("textbox", { name: "Tolerância em pontos percentuais" });
  await tolerance.fill("5");
  await page.getByRole("textbox", { name: "Percentual de Caixa" }).fill("12,5");
  await expect(restore).toBeEnabled();

  await restore.click();

  await expect(tolerance).toHaveValue("2");
  await expect(page.getByRole("slider", { name: "Faixa de tolerância" })).toHaveAttribute("aria-valuenow", "2");
  const moeda = page.getByRole("region", { name: "Moeda", exact: true });
  await expect(moeda.getByRole("textbox", { name: "Percentual de BTC" })).toHaveValue("32,5");
  await expect(moeda.getByRole("slider", { name: "Meta de BTC" })).toHaveAttribute("aria-valuenow", "32.5");
  await expect(restore).toBeDisabled();

  await discardIfPending(page);
});

test("no toque, rolar sobre o deslizante rola a página e não muda a meta", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Gesto de toque: só no perfil de celular.");
  await openSettings(page);

  const caixa = page.getByRole("textbox", { name: "Percentual de Caixa" });
  const slider = page.getByRole("slider", { name: "Meta de Caixa" });
  const control = page.locator("[data-base-ui-slider-control]").filter({ has: slider });
  await caixa.fill("15,5");
  await slider.scrollIntoViewIfNeeded();

  for (const fraction of [0.15, 0.75]) {
    const box = await control.boundingBox();
    if (!box) {
      throw new Error("Deslizante de Caixa sem posição na tela.");
    }
    const before = await page.evaluate(() => window.scrollY);
    const from = { x: box.x + box.width * fraction, y: box.y + box.height / 2 };
    await touchGesture(page, from, path(from, 0, -180, 10));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 90);
    await expect(caixa).toHaveValue("15,5");
    await page.evaluate(() => window.scrollTo(0, 0));
    await slider.scrollIntoViewIfNeeded();
  }

  const thumb = await slider.boundingBox();
  const track = await control.boundingBox();
  if (!thumb || !track) {
    throw new Error("Deslizante de Caixa sem posição na tela.");
  }
  await page.touchscreen.tap(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
  await page.touchscreen.tap(track.x + track.width * 0.85, track.y + track.height / 2);
  await expect(caixa).toHaveValue("15,5");

  await discardIfPending(page);
});

test("no toque, o arraste horizontal anda de 1 em 1 ponto", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Gesto de toque: só no perfil de celular.");
  await openSettings(page);

  const caixa = page.getByRole("textbox", { name: "Percentual de Caixa" });
  const slider = page.getByRole("slider", { name: "Meta de Caixa" });
  await caixa.fill("15,5");
  await slider.scrollIntoViewIfNeeded();
  const thumb = await slider.boundingBox();
  if (!thumb) {
    throw new Error("Deslizante de Caixa sem posição na tela.");
  }

  const from = { x: thumb.x + thumb.width / 2, y: thumb.y + thumb.height / 2 };
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  const seen = new Set<string>();
  for (const point of path(from, 45, 2, 15)) {
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
    seen.add(await caixa.inputValue());
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await client.detach();

  seen.delete("15,5");
  expect(seen.size).toBeGreaterThan(1);
  for (const value of seen) {
    expect(value, `valor ${value} ao arrastar`).toMatch(/^\d+$/);
  }
  expect(Number(await caixa.inputValue())).toBeGreaterThan(15.5);

  await discardIfPending(page);
});
