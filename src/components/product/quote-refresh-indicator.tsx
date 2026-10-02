"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  getQuoteRefreshServerState,
  getQuoteRefreshState,
  refreshUnlessEditing,
  runManualRefresh,
  runOpenCheck,
  subscribeQuoteRefresh,
} from "@/components/product/quote-refresh-client";
import { cn } from "@/lib/utils";
import type { QuoteRefreshSummary } from "@/modules/quotes/domain/quote-refresh";
import { describeRefreshTime } from "@/modules/quotes/presentation/refresh-time";

const CLOCK_STEP_MS = 15_000;

export function QuoteRefreshIndicator({ summary: serverSummary }: { summary: QuoteRefreshSummary | null }) {
  const router = useRouter();
  const client = useSyncExternalStore(subscribeQuoteRefresh, getQuoteRefreshState, getQuoteRefreshServerState);
  const now = useClock();
  const summary = newestSummary(serverSummary, client.summary);
  const onDataChanged = useCallback(() => refreshUnlessEditing(() => router.refresh()), [router]);

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

  const time = summary?.lastUpdatedAt && now !== null ? describeRefreshTime(summary.lastUpdatedAt, now) : null;
  const lastRun = summary?.lastRun ?? null;
  const failedSymbols = lastRun?.failures.map((failure) => failure.symbol) ?? [];
  const hasIssues = failedSymbols.length > 0 || lastRun?.status === "FAILED";
  const longLabel = client.spinning
    ? "Atualizando cotações…"
    : time?.long ?? (summary?.lastUpdatedAt ? null : "Cotações sem atualização");
  const shortLabel = client.spinning ? "…" : time?.short ?? (summary?.lastUpdatedAt ? null : "—");
  const issueText = hasIssues
    ? failedSymbols.length > 0
      ? `Falha na última tentativa: ${failedSymbols.join(", ")}`
      : "A última tentativa falhou"
    : null;
  const title = [time ? `Última atualização das cotações em ${time.absolute}` : null, issueText]
    .filter(Boolean)
    .join(". ");

  return (
    <div
      data-testid="quote-refresh"
      title={title || undefined}
      className="flex h-9 shrink-0 items-center gap-1 rounded-xl border border-border bg-card/70 p-1 sm:pl-3"
    >
      <span
        className={cn(
          "hidden text-[11px] whitespace-nowrap text-muted-foreground tabular-nums sm:inline",
          longLabel === null && "invisible",
        )}
      >
        {longLabel ?? "Atualizado há 10 min"}
      </span>
      <button
        type="button"
        onClick={() => runManualRefresh(onDataChanged)}
        disabled={client.running}
        aria-label={[
          "Atualizar cotações",
          longLabel && !client.spinning ? longLabel.toLocaleLowerCase("pt-BR") : null,
          issueText,
        ]
          .filter(Boolean)
          .join(". ")}
        className="group relative inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-muted-foreground outline-none transition-colors duration-150 hover:bg-white/[0.045] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-wait disabled:hover:bg-transparent"
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
        <span
          aria-hidden="true"
          className={cn(
            "text-[11px] whitespace-nowrap tabular-nums sm:hidden",
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

function newestSummary(server: QuoteRefreshSummary | null, client: QuoteRefreshSummary | null) {
  if (!server) {
    return client;
  }

  if (!client) {
    return server;
  }

  return client.generatedAt > server.generatedAt ? client : server;
}

function subscribeClock(callback: () => void) {
  const timer = window.setInterval(callback, CLOCK_STEP_MS);
  return () => window.clearInterval(timer);
}

function readClock() {
  return Math.floor(Date.now() / CLOCK_STEP_MS) * CLOCK_STEP_MS;
}

function readServerClock() {
  return null;
}

// Hora atual só no navegador, em passos de 15 segundos: o servidor não conhece o
// fuso do usuário, então o rótulo aparece depois da hidratação.
function useClock() {
  return useSyncExternalStore(subscribeClock, readClock, readServerClock);
}
