import { rejectForeignRequest } from "@/lib/same-origin-request";
import { rejectWithoutSession } from "@/modules/auth/session";
import { runOpenChecks } from "@/modules/portfolio/application/open-checks";

export const dynamic = "force-dynamic";

// Rota em vez de Server Action: o cliente despacha Server Actions uma por vez e
// uma navegação descarta a que estiver pendente. A consulta aos provedores pode
// levar vários segundos e não deve segurar salvamentos nem trocas de tela.
export async function POST(request: Request) {
  const rejection = rejectForeignRequest(request);

  if (rejection) {
    return rejection;
  }

  const unauthorized = await rejectWithoutSession();

  if (unauthorized) {
    return unauthorized;
  }

  return Response.json(await runOpenChecks());
}
