import { expect, test, type Page } from "@playwright/test";

import { stubQuoteChecks } from "./support/quote-checks";

// Backup dos dados (spec 042). Os testes rodam sobre os dados reais: baixam o
// backup e conferem um arquivo, que só lê, mas nunca confirmam a restauração.
test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

async function downloadBackup(page: Page) {
  const response = await page.request.get("/api/backup");
  expect(response.status()).toBe(200);
  return { response, backup: (await response.json()) as { format: string; version: number; tables: Record<string, unknown[]> } };
}

function backupPanel(page: Page) {
  return page.getByRole("region", { name: "Backup dos dados" });
}

test("exporta todos os dados num arquivo", async ({ page }) => {
  const { response, backup } = await downloadBackup(page);

  expect(response.headers()["content-disposition"]).toMatch(
    /^attachment; filename="meu-portfolio-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json"$/,
  );
  expect(backup.format).toBe("meu-portfolio-backup");
  expect(backup.version).toBe(2);
  // Sem as tabelas da importação do Excel, com o registro de importações (spec 047).
  expect(Object.keys(backup.tables)).toContain("dataImports");
  expect(Object.keys(backup.tables)).not.toContain("importBatches");
  expect(backup.tables.portfolioMonths.length).toBeGreaterThan(0);
  expect(backup.tables.positions.length).toBeGreaterThan(0);
  expect(backup.tables.targetPlans.length).toBeGreaterThan(0);

  await page.goto("/configuracao");
  await expect(backupPanel(page).getByRole("link", { name: "Exportar backup" })).toHaveAttribute("href", "/api/backup");
});

test("confere um backup, mostra o resumo e cancela sem gravar", async ({ page }) => {
  const { backup } = await downloadBackup(page);

  await page.goto("/configuracao");
  await backupPanel(page)
    .getByLabel("Arquivo de backup")
    .setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });

  const dialog = page.getByRole("dialog", { name: "Restaurar este backup?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("row", { name: /^Posições/ })).toContainText(
    backup.tables.positions.length.toLocaleString("pt-BR"),
  );
  await expect(dialog.getByRole("row", { name: /^Competências/ })).toContainText(
    backup.tables.portfolioMonths.length.toLocaleString("pt-BR"),
  );

  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
});

test("recusa um arquivo que não é backup", async ({ page }) => {
  await page.goto("/configuracao");
  const panel = backupPanel(page);

  await panel
    .getByLabel("Arquivo de backup")
    .setInputFiles({ name: "outro.json", mimeType: "application/json", buffer: Buffer.from('{"format":"outro"}') });
  await expect(panel.getByRole("alert")).toHaveText("O arquivo não é um backup deste aplicativo.");

  await panel
    .getByLabel("Arquivo de backup")
    .setInputFiles({ name: "texto.json", mimeType: "application/json", buffer: Buffer.from("não é json") });
  await expect(panel.getByRole("alert")).toHaveText("texto.json não é um arquivo de backup válido.");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
