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

  await page.getByRole("link", { name: "Revisão de dados" }).click();
  await expect(page.getByRole("heading", { name: /achados, sem correções silenciosas/ })).toBeVisible();
});
