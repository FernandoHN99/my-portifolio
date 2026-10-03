"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect } from "react";

import { runOpenCheck } from "@/components/product/quote-refresh-client";
import { useQuoteRefresh } from "@/components/product/use-quote-refresh";
import { cn } from "@/lib/utils";
import type { QuoteRefreshSummary } from "@/modules/quotes/domain/quote-refresh";

const OPEN_CHECK_POLL_MS = 5 * 60 * 1000;

/**
 * Há quanto tempo as cotações foram atualizadas. Sem botão: a atualização é só
 * automática (spec 051), pela checagem que este componente dispara ao abrir o
 * aplicativo e a cada poucos minutos com ele visível.
 */
export function QuoteRefreshIndicator({ summary: serverSummary }: { summary: QuoteRefreshSummary | null }) {
  const { client, summary, time, hasIssues, issueText, onDataChanged } = useQuoteRefresh(serverSummary);

  useEffect(() => {
    runOpenCheck(onDataChanged);

    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") {
        runOpenCheck(onDataChanged);
      }
    };

    // Com o aplicativo aberto e visível, a checagem também roda sozinha: a cada
    // poucos minutos o cliente tenta, e `runOpenCheck` só chama o servidor uma
    // vez por hora. Assim a virada de mês e as cotações acompanham o relógio
    // sem recarregar a página (spec 034).
    const timer = window.setInterval(checkWhenVisible, OPEN_CHECK_POLL_MS);

    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [onDataChanged]);

  const longLabel = client.spinning
    ? "Atualizando cotações…"
    : time?.long ?? (summary?.lastUpdatedAt ? null : "Cotações sem atualização");
  const shortLabel = client.spinning ? "…" : time?.short ?? (summary?.lastUpdatedAt ? null : "—");
  const title = [time ? `Última atualização das cotações em ${time.absolute}` : null, issueText]
    .filter(Boolean)
    .join(". ");

  return (
    <div
      data-testid="quote-refresh"
      title={title || undefined}
      aria-label={[longLabel ?? "Cotações", issueText].filter(Boolean).join(". ")}
      aria-busy={client.running || undefined}
      role="status"
      className="relative flex h-9 min-w-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-card/70 px-1 md:px-3"
    >
      {client.spinning ? (
        <ArrowClockwiseIcon aria-hidden="true" size={12} weight="bold" className="hidden shrink-0 animate-spin text-primary md:block" />
      ) : null}
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
      {hasIssues && !client.spinning ? (
        <span
          aria-hidden="true"
          data-testid="quote-refresh-issue"
          className="absolute top-1 right-1 size-1.5 rounded-full bg-destructive ring-2 ring-card"
        />
      ) : null}
    </div>
  );
}
