"use client";

import { useRouter } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";

import {
  getQuoteRefreshServerState,
  getQuoteRefreshState,
  refreshUnlessEditing,
  runManualRefresh,
  subscribeQuoteRefresh,
} from "@/components/product/quote-refresh-client";
import type { QuoteRefreshSummary } from "@/modules/quotes/domain/quote-refresh";
import { describeRefreshTime } from "@/modules/quotes/presentation/refresh-time";

const CLOCK_STEP_MS = 15_000;

// Estado da atualização de cotações compartilhado pela seta do topo e pela
// página de cotações: os dois leem o mesmo cliente, então giram juntos, mostram
// o mesmo horário e disparam a mesma atualização.
export function useQuoteRefresh(serverSummary: QuoteRefreshSummary | null) {
  const router = useRouter();
  const client = useSyncExternalStore(subscribeQuoteRefresh, getQuoteRefreshState, getQuoteRefreshServerState);
  const now = useClock();
  const summary = newestSummary(serverSummary, client.summary);
  const onDataChanged = useCallback(() => refreshUnlessEditing(() => router.refresh()), [router]);
  const refresh = useCallback(() => runManualRefresh(onDataChanged), [onDataChanged]);

  const time = summary?.lastUpdatedAt && now !== null ? describeRefreshTime(summary.lastUpdatedAt, now) : null;
  const lastRun = summary?.lastRun ?? null;
  const failedSymbols = lastRun?.failures.map((failure) => failure.symbol) ?? [];
  const hasIssues = failedSymbols.length > 0 || lastRun?.status === "FAILED";
  const issueText = hasIssues
    ? failedSymbols.length > 0
      ? `Falha na última tentativa: ${failedSymbols.join(", ")}`
      : "A última tentativa falhou"
    : null;

  return { client, now, summary, time, lastRun, hasIssues, issueText, onDataChanged, refresh };
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
// fuso do usuário, então os rótulos de horário aparecem depois da hidratação.
function useClock() {
  return useSyncExternalStore(subscribeClock, readClock, readServerClock);
}
