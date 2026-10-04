"use client";

import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";

import { useQuoteRefresh } from "@/components/product/use-quote-refresh";
import { cn } from "@/lib/utils";
import { formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";
import { parseMonthParam } from "@/modules/portfolio/presentation/reference-month";
import type { QuoteRefreshSummary } from "@/modules/quotes/domain/quote-refresh";
import { formatRefreshDateTime } from "@/modules/quotes/presentation/refresh-time";

// Última atualização das cotações, feita só pelo job agendado, de hora em hora
// (spec 053). Usa o mesmo cliente do indicador do topo. Aparece só no mês
// corrente, o único que a atualização muda (spec 038).
export function LastRefreshCard({
  summary: serverSummary,
  currentMonth,
}: {
  summary: QuoteRefreshSummary | null;
  currentMonth: string;
}) {
  const { now, summary, time, lastRun, hasIssues } = useQuoteRefresh(serverSummary);
  const lastAttemptIsLatestUpdate =
    lastRun !== null && summary?.lastUpdatedAt === (lastRun.finishedAt ?? lastRun.startedAt);
  const failed = lastRun?.failures ?? [];

  return (
    <section
      aria-labelledby="last-refresh-title"
      className="metric-card mt-6 flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5"
    >
      <span className="hidden size-10 shrink-0 place-items-center rounded-xl bg-primary/8 text-primary ring-1 ring-primary/10 sm:grid">
        <ClockCounterClockwiseIcon aria-hidden="true" size={19} weight="duotone" />
      </span>

      <div className="min-w-0 flex-1">
        <h2
          id="last-refresh-title"
          className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase"
        >
          Última atualização
        </h2>
        <p
          data-testid="last-refresh-time"
          className={cn(
            "mt-1.5 text-lg font-semibold tracking-[-0.03em] text-foreground",
            now === null && summary?.lastUpdatedAt ? "invisible" : null,
          )}
        >
          {time?.long ?? (summary?.lastUpdatedAt ? "Atualizado há 10 min" : "Cotações sem atualização")}
        </p>
        {time ? <p className="mt-0.5 text-xs text-muted-foreground">Em {time.absolute}</p> : null}
        {hasIssues && lastRun && now !== null ? (
          <p data-testid="last-refresh-issue" className="mt-1.5 text-xs text-destructive">
            {lastAttemptIsLatestUpdate ? "Nessa atualização" : `Última tentativa em ${formatRefreshDateTime(lastRun.startedAt)}`}
            {failed.length > 0
              ? `: ${failed.length} ${failed.length === 1 ? "cotação" : "cotações"} com falha (${failed.map((failure) => failure.symbol).join(", ")}).`
              : `: ${lastRun.errorMessage ?? "a atualização falhou."}`}
          </p>
        ) : null}
        <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
          As cotações são atualizadas automaticamente de hora em hora, sem depender do aplicativo aberto, e
          recalculam as posições de {compact(currentMonth)}.
        </p>
      </div>

    </section>
  );
}

function compact(month: string) {
  const date = parseMonthParam(month);
  return date ? formatMonthCompact(date) : month;
}
