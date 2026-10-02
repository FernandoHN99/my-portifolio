"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect } from "react";

import { runOpenCheck } from "@/components/product/quote-refresh-client";
import { useQuoteRefresh } from "@/components/product/use-quote-refresh";
import { cn } from "@/lib/utils";
import type { QuoteRefreshSummary } from "@/modules/quotes/domain/quote-refresh";

export function QuoteRefreshIndicator({
  summary: serverSummary,
  canRefresh = true,
}: {
  summary: QuoteRefreshSummary | null;
  /** Falso fora do mês corrente: só o horário aparece, sem a seta. */
  canRefresh?: boolean;
}) {
  const { client, summary, time, hasIssues, issueText, onDataChanged, refresh } = useQuoteRefresh(serverSummary);

  useEffect(() => {
    runOpenCheck(onDataChanged);

    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") {
        runOpenCheck(onDataChanged);
      }
    };

    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => document.removeEventListener("visibilitychange", checkWhenVisible);
  }, [onDataChanged]);

  const longLabel = client.spinning
    ? "Atualizando cotações…"
    : time?.long ?? (summary?.lastUpdatedAt ? null : "Cotações sem atualização");
  const shortLabel = client.spinning ? "…" : time?.short ?? (summary?.lastUpdatedAt ? null : "—");
  const title = [time ? `Última atualização das cotações em ${time.absolute}` : null, issueText]
    .filter(Boolean)
    .join(". ");

  // Fora do mês corrente, o horário da última atualização continua visível,
  // sem a seta: a checagem ao abrir segue rodando normalmente.
  if (!canRefresh && !client.spinning) {
    return (
      <div
        data-testid="quote-refresh"
        title={title || undefined}
        aria-label={[longLabel ?? "Cotações", issueText].filter(Boolean).join(". ")}
        role="status"
        className="relative flex h-9 min-w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card/70 px-1 md:px-3"
      >
        <span
          className={cn(
            "hidden text-[11px] whitespace-nowrap text-muted-foreground tabular-nums md:inline",
            longLabel === null && "invisible",
          )}
        >
          {longLabel ?? "Atualizado há 10 min"}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "text-[9px] leading-none font-medium whitespace-nowrap text-muted-foreground tabular-nums md:hidden",
            shortLabel === null && "invisible",
          )}
        >
          {shortLabel ?? "10 min"}
        </span>
        {hasIssues ? (
          <span
            aria-hidden="true"
            data-testid="quote-refresh-issue"
            className="absolute top-1 right-1 size-1.5 rounded-full bg-destructive ring-2 ring-card"
          />
        ) : null}
      </div>
    );
  }

  return (
    <div
      data-testid="quote-refresh"
      title={title || undefined}
      className="flex h-9 min-w-9 shrink-0 items-center rounded-xl border border-border bg-card/70 md:gap-1 md:p-1 md:pl-3"
    >
      <span
        className={cn(
          "hidden text-[11px] whitespace-nowrap text-muted-foreground tabular-nums md:inline",
          longLabel === null && "invisible",
        )}
      >
        {longLabel ?? "Atualizado há 10 min"}
      </span>
      {/* Sem o atributo disabled: o botão continua focado enquanto a
          atualização roda, e runManualRefresh ignora o clique repetido. */}
      <button
        type="button"
        onClick={refresh}
        aria-disabled={client.running || undefined}
        aria-busy={client.running || undefined}
        aria-label={[
          "Atualizar cotações",
          longLabel && !client.spinning ? longLabel.toLocaleLowerCase("pt-BR") : null,
          issueText,
        ]
          .filter(Boolean)
          .join(". ")}
        className="group relative flex h-[34px] min-w-[34px] flex-col items-center justify-center gap-[3px] rounded-[11px] px-1 text-muted-foreground outline-none transition-colors duration-150 hover:bg-white/[0.045] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-disabled:cursor-wait aria-disabled:hover:bg-transparent md:h-7 md:rounded-lg md:px-2"
      >
        <ArrowClockwiseIcon
          aria-hidden="true"
          size={14}
          weight="bold"
          className={cn(
            "shrink-0",
            client.spinning
              ? "animate-spin"
              : "transition-transform duration-200 ease-out group-hover:rotate-45 motion-reduce:transition-none",
          )}
        />
        {/* No celular e em telas médias o tempo curto fica embaixo da seta,
            num bloco do tamanho do botão de configuração, para não tirar
            espaço das abas. */}
        <span
          aria-hidden="true"
          className={cn(
            "text-[9px] leading-none font-medium whitespace-nowrap tabular-nums md:hidden",
            shortLabel === null && "invisible",
          )}
        >
          {shortLabel ?? "10 min"}
        </span>
        {hasIssues && !client.spinning ? (
          <span
            aria-hidden="true"
            data-testid="quote-refresh-issue"
            className="absolute top-1 right-1 size-1.5 rounded-full bg-destructive ring-2 ring-card"
          />
        ) : null}
      </button>
    </div>
  );
}
