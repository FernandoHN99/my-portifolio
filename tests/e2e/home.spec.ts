import { expect, test } from "@playwright/test";

test("apresenta a carteira normalizada", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Patrimônio consolidado",
    }),
  ).toBeVisible();
  await expect(page.getByTestId("portfolio-total")).toContainText("R$");
  await expect(page.getByRole("heading", { name: "Principais posições" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Por instituição" })).toBeVisible();

  const editPositions = page.getByRole("link", { name: "Editar posições" });
  if (await editPositions.isVisible()) {
    await editPositions.click();
    await expect(page.getByRole("heading", { name: "Ajuste o que mudou no mês." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar alterações" })).toBeDisabled();
    await page.getByRole("link", { name: "Voltar para visão geral" }).click();
  }

  await page.getByRole("link", { name: "Atualização", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: /Prepare a próxima competência|Atualização de/,
    }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Revisão de dados" }).click();
  await expect(page.getByRole("heading", { name: /achados, sem correções silenciosas/ })).toBeVisible();
});
