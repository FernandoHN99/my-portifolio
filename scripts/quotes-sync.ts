import "dotenv/config";

import { getPrismaClient } from "../src/lib/prisma";
import { describeQuoteSync, isQuoteSyncFailure } from "../src/modules/quotes/application/quote-sync-report";
import { syncQuotes } from "../src/modules/quotes/application/sync-quotes";

// Job das cotações pelo terminal (spec 053): a mesma função da função do Neon e
// do GitHub Actions. Busca só os símbolos devidos e sai sem fazer nada quando
// estão em dia; rodar de novo não duplica nada.
//
//   pnpm quotes:sync
//
// Com DATABASE_URL de um schema de teste (pnpm db:test-schema), age só nele.

async function main() {
  const outcome = await syncQuotes();

  for (const line of describeQuoteSync(outcome)) {
    console.log(line);
  }

  await getPrismaClient()?.$disconnect();
  process.exitCode = isQuoteSyncFailure(outcome) ? 1 : 0;
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  await getPrismaClient()?.$disconnect();
  process.exitCode = 1;
});
