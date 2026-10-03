import { expect, test } from "@playwright/test";

import { SIGNED_OUT, testUser } from "./support/auth";
import { stubQuoteChecks } from "./support/quote-checks";

// Login (spec 050): sem sessão, nada dos dados aparece.
test.describe("sem sessão", () => {
  test.use({ storageState: SIGNED_OUT });

  test("as páginas levam à entrada e voltam ao endereço pedido", async ({ page }) => {
    await stubQuoteChecks(page);
    await page.goto("/posicoes");
    await expect(page).toHaveURL(/\/entrar\?para=%2Fposicoes$/);
    await expect(page.getByRole("heading", { name: "Meu portfólio" })).toBeVisible();

    const { email, password } = testUser();
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/posicoes$/);
    await expect(page.getByRole("heading", { level: 1, name: "Carteira do mês" })).toBeVisible();
  });

  test("senha errada mostra o aviso e não entra", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("E-mail").fill(testUser().email);
    await page.getByLabel("Senha").fill("senha-incorreta-do-teste");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.locator("form").getByRole("alert")).toHaveText("E-mail ou senha incorretos.");
    await expect(page).toHaveURL(/\/entrar$/);
  });

  test("as rotas de dados respondem 401", async ({ request }) => {
    expect((await request.get("/api/backup")).status()).toBe(401);
    const check = await request.post("/api/quotes/open-check", { data: {} });
    expect(check.status()).toBe(401);
  });

  test("um e-mail fora da lista não cria conta", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByRole("button", { name: "Criar conta" }).click();
    await page.getByLabel("Nome").fill("Visitante");
    await page.getByLabel("E-mail").fill("visitante@exemplo.test");
    await page.getByLabel("Senha").fill("senha-de-visitante-123");
    await page.getByRole("button", { name: "Criar conta", exact: true }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("não tem permissão para criar conta");
  });
});

test("a configuração mostra a conta e o botão de sair", async ({ page }) => {
  await stubQuoteChecks(page);
  await page.goto("/configuracao");
  const account = page.getByRole("region").filter({ hasText: testUser().email });
  await expect(account).toHaveCount(1);
  await expect(account.getByRole("button", { name: "Sair" })).toBeVisible();
});
