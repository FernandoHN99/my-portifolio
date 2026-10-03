import "dotenv/config";

import { defineConfig, devices } from "@playwright/test";

import { AUTH_STATE } from "./tests/e2e/support/auth";

// E2E_BASE_URL aponta os testes para outro servidor já rodando, como um app
// ligado a um schema de teste do banco (pnpm db:test-schema), sem subir o dev.
const externalBaseUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: externalBaseUrl ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  // Com login (spec 050): o projeto "setup" entra com o usuário local de
  // E2E_USER_EMAIL e E2E_USER_PASSWORD, e os demais reaproveitam a sessão.
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/, use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"], channel: "chrome", storageState: AUTH_STATE },
      dependencies: ["setup"],
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"], channel: "chrome", storageState: AUTH_STATE },
      dependencies: ["setup"],
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "pnpm dev --hostname 127.0.0.1",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
