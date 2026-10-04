import { ensureMonthsUpToDate } from "@/modules/portfolio/application/month-rollover";
import { ensureDefaultTargetPlan } from "@/modules/portfolio/application/target-plan-editing";
import type { MonthRolloverOutcome, OpenCheckResponse, TargetPlanCheck } from "@/modules/portfolio/domain/month-rollover";
import { getQuoteRefreshSummary } from "@/modules/quotes/application/quote-refresh-summary";

// Checagem feita quando o aplicativo é aberto e a cada poucos minutos com ele
// visível. Primeiro a virada de mês, que cria as competências que faltam até o
// mês corrente; depois as metas padrão, se não houver plano de metas (spec
// 048). As cotações não são mais buscadas aqui: o job agendado as atualiza
// (spec 053), e a checagem só devolve o resumo da última execução. Nenhuma
// falha aqui quebra a página, e uma falha numa etapa não impede as seguintes.
export async function runOpenChecks({ now = new Date() }: { now?: Date } = {}): Promise<OpenCheckResponse> {
  const rollover = await ensureMonthsUpToDate(now).catch(
    (error: unknown): MonthRolloverOutcome => ({
      state: "unavailable",
      message: describeUnexpected(error, "Não foi possível criar a competência do mês."),
    }),
  );
  const targetPlan = await ensureDefaultTargetPlan().catch((): TargetPlanCheck => "unavailable");

  return { rollover, targetPlan, summary: await getQuoteRefreshSummary(now) };
}

function describeUnexpected(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? `${fallback} ${error.message.slice(0, 200)}` : fallback;
}
