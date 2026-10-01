import { expect, test } from "@playwright/test";

test("apresenta a fundação e o próximo passo", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Sua carteira começa pelo histórico real.",
    }),
  ).toBeVisible();
  await expect(page.getByText("raw_file/01-Investimentos.xlsm")).toBeVisible();
  await expect(page.getByTestId("database-status")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Importação do Excel" }),
  ).toBeVisible();
});
