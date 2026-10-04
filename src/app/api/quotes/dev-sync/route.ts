import { devToolsEnabled } from "@/lib/dev-tools";
import { rejectForeignRequest } from "@/lib/same-origin-request";
import { rejectWithoutSession } from "@/modules/auth/session";
import { describeQuoteSync, isQuoteSyncFailure } from "@/modules/quotes/application/quote-sync-report";
import { syncQuotes } from "@/modules/quotes/application/sync-quotes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  // A verificação acontece antes de qualquer sessão, banco ou provedor. Uma
  // chamada direta em produção também não consegue executar o job.
  if (!devToolsEnabled()) {
    return Response.json({ message: "Rota indisponível." }, { status: 404 });
  }
  const rejected = rejectForeignRequest(request) ?? await rejectWithoutSession();
  if (rejected) return rejected;
  try {
    const outcome = await syncQuotes();
    const ok = !isQuoteSyncFailure(outcome);
    return Response.json({ ok, state: outcome.state, lines: describeQuoteSync(outcome) }, { status: ok ? 200 : 502 });
  } catch {
    return Response.json({ ok: false, state: "unavailable", message: "A atualização local falhou. Consulte o terminal do servidor." }, { status: 500 });
  }
}
