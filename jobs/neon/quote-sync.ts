import { describeQuoteSync, isQuoteSyncFailure } from "../../src/modules/quotes/application/quote-sync-report";
import { syncQuotes } from "../../src/modules/quotes/application/sync-quotes";

// Função do Neon que roda o job das cotações (spec 053), chamada pelo gatilho
// agendado declarado em `neon.ts`. Ela vive num projeto do Neon só para jobs,
// numa região com Functions, porque a de São Paulo (aws-sa-east-1), onde está o
// banco, ainda não tem. O DATABASE_URL que o Neon injeta é o do projeto de
// jobs; o banco do app chega por PORTFOLIO_DATABASE_URL.
//
// A rota é pública, como exige o gatilho. Só responde a chamadas do próprio
// Neon: ele remove os cabeçalhos X-Neon-* enviados por clientes, então a
// presença de X-Neon-Trigger-Invocation-Id prova a origem. O job é idempotente,
// e uma chamada repetida só encontra os símbolos em dia.

const quoteSyncFunction = {
  async fetch(request: Request) {
    if (request.method !== "POST") {
      return Response.json({ error: "Use POST." }, { status: 405 });
    }

    const invocationId = request.headers.get("x-neon-trigger-invocation-id");

    if (!invocationId) {
      return Response.json({ error: "Só o gatilho do Neon chama esta função." }, { status: 403 });
    }

    if (!process.env.PORTFOLIO_DATABASE_URL) {
      return Response.json({ error: "PORTFOLIO_DATABASE_URL não está configurada." }, { status: 500 });
    }

    // Antes do primeiro uso do Prisma, que lê DATABASE_URL ao criar o cliente.
    process.env.DATABASE_URL = process.env.PORTFOLIO_DATABASE_URL;

    const body = (await request.json().catch(() => null)) as { data?: { scheduled_at?: string } } | null;
    const scheduledAt = body?.data?.scheduled_at ?? null;
    const outcome = await syncQuotes();
    const lines = describeQuoteSync(outcome);

    for (const line of lines) {
      console.log(`[${scheduledAt ?? invocationId}] ${line}`);
    }

    return Response.json(
      { scheduledAt, state: outcome.state, lines },
      { status: isQuoteSyncFailure(outcome) ? 500 : 200 },
    );
  },
};

export default quoteSyncFunction;
