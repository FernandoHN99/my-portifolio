import { defineConfig } from "@neon/config/v1";

// Configuração versionada do job das cotações no Neon (spec 053), aplicada com
// `neon deploy` a partir desta pasta, ligada ao projeto de jobs (não ao do
// banco, que fica em aws-sa-east-1, região ainda sem Functions):
//
//   pnpm jobs:build                        # empacota em jobs/neon/dist
//   cd jobs/neon
//   neon link                              # projeto de jobs, em aws-us-east-1
//   neon deploy --env ../../.env.jobs      # segredos lidos na hora, fora do Git
//
// O passo a passo e os segredos esperados estão em docs/quote-sync-job.md.
// Os valores de `env` são lidos do ambiente no momento do deploy.

export default defineConfig({
  functions: {
    quotesync: {
      name: "Atualização de cotações",
      // Pacote pronto de `pnpm jobs:build`: o cliente do Prisma e o pg precisam
      // do `require` criado no topo do módulo, que o empacotamento padrão não
      // põe.
      source: "./dist",
      bundler: "none",
      env: {
        PORTFOLIO_DATABASE_URL: process.env.PORTFOLIO_DATABASE_URL ?? "",
        COINGECKO_API_KEY: process.env.COINGECKO_API_KEY ?? "",
        FINNHUB_API_KEY: process.env.FINNHUB_API_KEY ?? "",
        ALPHA_VANTAGE_API_KEY: process.env.ALPHA_VANTAGE_API_KEY ?? "",
        BRAPI_TOKEN: process.env.BRAPI_TOKEN ?? "",
        AWESOME_API_KEY: process.env.AWESOME_API_KEY ?? "",
        // O dia e o mês corrente das cotações seguem o relógio de São Paulo.
        TZ: "America/Sao_Paulo",
      },
    },
  },
  triggers: {
    // De hora em hora, no minuto zero (UTC). O job decide o que está devido:
    // cotações com mais de 50 minutos e históricos por carregar.
    "quotes-hourly": {
      type: "schedule",
      function: "quotesync",
      cron: "0 * * * *",
    },
  },
});
