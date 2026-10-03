import { expect, test as setup } from "@playwright/test";

import { AUTH_STATE, testUser } from "./support/auth";
import { stubQuoteChecks } from "./support/quote-checks";

// Entra uma vez pela tela de entrada (spec 050) e guarda a sessão para os
// demais cenários. A sessão é a única gravação: nada da carteira muda.
setup("entra com o usuário local", async ({ page }) => {
  const { email, password } = testUser();
  await stubQuoteChecks(page);

  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();

  await expect(page).toHaveURL(/\/$/);
  await page.context().storageState({ path: AUTH_STATE });
});
