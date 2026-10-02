"use client";

import {
  CaretDownIcon,
  CheckCircleIcon,
  ClockIcon,
  ListChecksIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useState, useTransition } from "react";

import { loadRunHistoryAction } from "@/app/actions/quote-history";
import { LocalDateTime } from "@/components/product/local-time";
import { cn } from "@/lib/utils";
import type {
  QuoteRunHistoryEntry,
  QuoteRunHistoryPage,
  QuoteRunHistoryStatus,
  QuoteRunOrigin,
} from "@/modules/quotes/application/get-run-history";
import { providerLabel, RUN_HISTORY_MONTHS } from "@/modules/quotes/domain/quote-refresh";

const ORIGIN_LABELS: Record<QuoteRunOrigin, string> = {
  AUTO: "Automática",
  MANUAL: "Manual",
  MONTHLY_UPDATE: "Atualizar carteira",
};

const STATUS: Record<QuoteRunHistoryStatus, { label: string; className: string }> = {
  COMPLETED: { label: "Concluída", className: "bg-primary/10 text-primary" },
  COMPLETED_WITH_ISSUES: { label: "Com falhas", className: "bg-warning/50 text-warning-foreground" },
  FAILED: { label: "Falhou", className: "bg-destructive/12 text-destructive" },
  INTERRUPTED: { label: "Interrompida", className: "bg-destructive/12 text-destructive" },
  RUNNING: { label: "Em andamento", className: "bg-white/[0.06] text-muted-foreground" },
};

/**
 * Todas as execuções dos últimos 36 meses, de qualquer competência (spec 028),
 * da mais recente para a mais antiga; "Mostrar mais" busca a página seguinte.
 */
export function RefreshRunHistory({ initial }: { initial: QuoteRunHistoryPage | null }) {
  const [initialPage, setInitialPage] = useState(initial);
  const [extra, setExtra] = useState<QuoteRunHistoryEntry[]>([]);
  const [cursor, setCursor] = useState(initial?.nextCursor ?? null);
  const [isLoading, startLoading] = useTransition();

  // Uma nova execução atualiza a primeira página e recomeça a paginação.
  if (initial !== initialPage) {
    setInitialPage(initial);
    setExtra([]);
    setCursor(initial?.nextCursor ?? null);
  }

  const runs = [...(initial?.runs ?? []), ...extra];
  const total = initial?.total ?? 0;

  const loadMore = () => {
    if (!cursor) {
      return;
    }

    startLoading(async () => {
      const page = await loadRunHistoryAction(cursor);

      if (page) {
        setExtra((current) => [...current, ...page.runs.filter((run) => !current.some((item) => item.id === run.id))]);
        setCursor(page.nextCursor);
      }
    });
  };

  return (
    <section className="premium-panel mt-6 overflow-hidden rounded-[24px]" aria-labelledby="run-history-title">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-5 py-4 sm:px-6">
        <ListChecksIcon aria-hidden="true" className="text-primary" size={17} weight="duotone" />
        <h2 id="run-history-title" className="text-sm font-semibold text-foreground">
          Histórico de execuções
        </h2>
        <span data-testid="run-history-count" className="text-[11px] text-muted-foreground">
          {total} {total === 1 ? "execução" : "execuções"} nos últimos {RUN_HISTORY_MONTHS} meses
        </span>
      </div>

      {runs.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground sm:px-6">
          {initial ? "Nenhuma atualização de cotações registrada." : "Não foi possível ler o histórico de execuções."}
        </p>
      ) : (
        <ol className="divide-y divide-border/55">
          {runs.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </ol>
      )}

      {cursor ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-5 py-3 sm:px-6">
          <p className="text-[11px] text-muted-foreground">
            Mostrando {runs.length} de {total}.
          </p>
          <button
            type="button"
            onClick={loadMore}
            disabled={isLoading}
            className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            {isLoading ? "Carregando…" : "Mostrar mais"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function RunRow({ run }: { run: QuoteRunHistoryEntry }) {
  const [open, setOpen] = useState(false);
  const status = STATUS[run.status];
  const expandable = run.failures.length > 0;
  const detailsId = `run-${run.id}-falhas`;

  const content = (
    <>
      <RunIcon status={run.status} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <LocalDateTime iso={run.at} className="font-mono text-xs text-foreground" />
          <span className="text-[11px] text-muted-foreground">{ORIGIN_LABELS[run.origin]}</span>
          {run.origin === "MONTHLY_UPDATE" ? (
            <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[9px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Fluxo anterior
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">{describeRun(run)}</span>
      </span>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap",
          status.className,
        )}
      >
        {status.label}
      </span>
      {expandable ? (
        <CaretDownIcon
          aria-hidden="true"
          className={cn("shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
          size={13}
          weight="bold"
        />
      ) : null}
    </>
  );

  return (
    <li data-testid="quote-run">
      {expandable ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-start gap-3 px-5 py-3.5 text-left outline-none transition-colors hover:bg-white/[0.02] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset sm:items-center sm:px-6"
        >
          {content}
        </button>
      ) : (
        <div className="flex items-start gap-3 px-5 py-3.5 sm:items-center sm:px-6">{content}</div>
      )}

      {expandable && open ? (
        <ul id={detailsId} className="space-y-2 border-t border-border/40 bg-white/[0.012] px-5 py-3.5 pl-12 sm:px-6 sm:pl-[3.25rem]">
          {run.failures.map((failure) => (
            <li key={failure.symbol} className="text-xs leading-snug">
              <span className="font-mono font-semibold text-foreground">{failure.symbol}</span>
              {failure.assets.length > 0 ? (
                <span className="text-muted-foreground"> · {failure.assets.join(", ")}</span>
              ) : null}
              <span className="block text-[11px] text-muted-foreground/80">
                {providerLabel(failure.provider)}: {failure.errorMessage}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function RunIcon({ status }: { status: QuoteRunHistoryStatus }) {
  if (status === "COMPLETED") {
    return <CheckCircleIcon aria-hidden="true" className="mt-px shrink-0 text-primary" size={16} weight="fill" />;
  }

  if (status === "RUNNING") {
    return <ClockIcon aria-hidden="true" className="mt-px shrink-0 text-muted-foreground" size={16} weight="duotone" />;
  }

  return (
    <WarningCircleIcon
      aria-hidden="true"
      className={cn(
        "mt-px shrink-0",
        status === "COMPLETED_WITH_ISSUES" ? "text-warning-foreground" : "text-destructive",
      )}
      size={16}
      weight="fill"
    />
  );
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function describeRun(run: QuoteRunHistoryEntry) {
  if (run.status === "RUNNING") {
    return "Consultando os provedores.";
  }

  // A execução antiga gravava as cotações e as posições numa transação só, no
  // fim; parada no meio, nada chegou às posições.
  if (run.status === "INTERRUPTED") {
    return "Interrompida antes de terminar; nenhuma cotação foi aplicada.";
  }

  const total = run.succeeded + run.failures.length;

  if (total === 0) {
    return run.status === "FAILED"
      ? (run.errorMessage ?? "A atualização falhou antes de consultar os provedores.")
      : "Nenhuma cotação para atualizar.";
  }

  // A atualização anterior aplicava tudo ou nada: com uma falha, nenhum valor
  // chegou às posições.
  if (run.origin === "MONTHLY_UPDATE" && run.status !== "COMPLETED") {
    return `${plural(run.failures.length, "cotação com falha", "cotações com falha")} de ${total}; nenhuma foi aplicada.`;
  }

  if (run.failures.length === 0) {
    return `${plural(run.succeeded, "cotação atualizada", "cotações atualizadas")}.`;
  }

  if (run.succeeded === 0) {
    return run.failures.every((failure) => failure.errorCode === "NOT_SAVED")
      ? `${plural(total, "cotação consultada", "cotações consultadas")}, mas não gravadas.`
      : `${plural(run.failures.length, "cotação com falha", "cotações com falha")}; nada mudou.`;
  }

  return `${plural(run.succeeded, "cotação atualizada", "cotações atualizadas")} e ${plural(run.failures.length, "com falha", "com falha")}.`;
}
