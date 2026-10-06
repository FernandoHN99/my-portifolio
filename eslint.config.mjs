import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Builds dos servidores de teste (PORTFOLIO_TEST_DIST_DIR, spec 072).
    ".next-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Pacote gerado da função do Neon (pnpm jobs:build, spec 053).
    "jobs/neon/dist/**",
  ]),
]);

export default eslintConfig;
