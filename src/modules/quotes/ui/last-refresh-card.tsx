"use client";

import { ArrowClockwiseIcon, ClockCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";

import { useQuoteRefresh } from "@/components/product/use-quote-refresh";
import { cn } from "@/lib/utils";
import { formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";
import { parseMonthParam } from "@/modules/portfolio/presentation/reference-month";
import type { QuoteRefreshSummary } from "@/modules/quotes/domain/quote-refresh";
import { formatRefreshDateTime } from "@/modules/quotes/presentation/refresh-time";

// Última atualização das cotações, com a mesma atualização manual da seta do
// topo. Os dois usam o mesmo cliente: giram juntos e publicam os mesmos avisos.
// Aparece só no mês corrente, o único que a atualização muda (spec 038).
export function LastRefreshCard({
  summary: serverSummary,
  currentMonth,
}: {
  summary: QuoteRefreshSummary | null;
  currentMonth: string;
}) {
  const { client, now, summary, time, lastRun, hasIssues, refresh } = useQuoteRefresh(serverSummary);
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
            client.spinning ? "text-primary" : null,
            !client.spinning && now === null && summary?.lastUpdatedAt ? "invisible" : null,
          )}
        >
          {client.spinning
            ? "Atualizando cotações…"
            : (time?.long ?? (summary?.lastUpdatedAt ? "Atualizado há 10 min" : "Cotações sem atualização"))}
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
          Busca as cotações de hoje nos provedores e recalcula as posições de {compact(currentMonth)}.
        </p>
      </div>

      {/* Sem o atributo disabled, como a seta do topo: o botão continua focado
          enquanto a atualização roda, e um clique repetido é ignorado. */}
      <button
        type="button"
        onClick={refresh}
        aria-disabled={client.running || undefined}
        aria-busy={client.running || undefined}
        className="group inline-flex h-9 shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground outline-none transition-[background-color,transform] duration-150 hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.98] aria-disabled:cursor-wait aria-disabled:opacity-70 sm:self-center"
      >
        <ArrowClockwiseIcon
          aria-hidden="true"
          size={14}
          weight="bold"
          className={cn(
            client.spinning
              ? "animate-spin"
              : "transition-transform duration-200 ease-out group-hover:rotate-45 motion-reduce:transition-none",
          )}
        />
        {client.running ? "Atualizando…" : "Atualizar cotações"}
      </button>
    </section>
  );
}

function compact(month: string) {
  const date = parseMonthParam(month);
  return date ? formatMonthCompact(date) : month;
}
