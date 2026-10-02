import { showAppToast } from "@/components/product/app-toaster";
import { hasPendingChanges } from "@/components/product/unsaved-changes";
import { formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";
import { parseMonthParam } from "@/modules/portfolio/presentation/reference-month";
import {
  providerLabel,
  QUOTE_REFRESH_INTERVAL_MS,
  type ManualRefreshResponse,
  type OpenCheckResponse,
  type QuoteRefreshOutcome,
  type QuoteRefreshSummary,
  type QuoteRefreshTriggerKind,
} from "@/modules/quotes/domain/quote-refresh";

// Estado da atualização de cotações no navegador. Fica fora do React para que a
// requisição em andamento e o resultado sobrevivam à troca de abas, que monta
// um novo cabeçalho em cada página.

export type QuoteRefreshClientState = {
  running: boolean;
  spinning: boolean;
  summary: QuoteRefreshSummary | null;
};

const SERVER_STATE: QuoteRefreshClientState = { running: false, spinning: false, summary: null };
const SPIN_DELAY_MS = 300;

let state: QuoteRefreshClientState = SERVER_STATE;
let lastOpenCheckAt: number | null = null;
const listeners = new Set<() => void>();

export function subscribeQuoteRefresh(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getQuoteRefreshState() {
  return state;
}

export function getQuoteRefreshServerState() {
  return SERVER_STATE;
}

function setState(patch: Partial<QuoteRefreshClientState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

// Checagem de abertura: uma vez por carregamento do aplicativo e de novo quando
// a aba volta a ficar visível depois de uma hora. O servidor decide se as
// cotações estão vencidas.
export function runOpenCheck(onDataChanged: () => void) {
  if (state.running) {
    return;
  }

  if (lastOpenCheckAt !== null && Date.now() - lastOpenCheckAt < QUOTE_REFRESH_INTERVAL_MS) {
    return;
  }

  lastOpenCheckAt = Date.now();
  void execute("/api/quotes/open-check", "AUTO", onDataChanged);
}

export function runManualRefresh(onDataChanged: () => void) {
  if (state.running) {
    return;
  }

  void execute("/api/quotes/refresh", "MANUAL", onDataChanged);
}

// Recarrega os dados da tela, exceto quando há edições pendentes, que seriam
// descartadas se a competência exibida mudasse.
export function refreshUnlessEditing(refresh: () => void) {
  if (!hasPendingChanges()) {
    refresh();
  }
}

async function execute(url: string, trigger: QuoteRefreshTriggerKind, onDataChanged: () => void) {
  setState({ running: true, spinning: trigger === "MANUAL" });
  const spinTimer =
    trigger === "AUTO" ? window.setTimeout(() => state.running && setState({ spinning: true }), SPIN_DELAY_MS) : null;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = (await response.json()) as OpenCheckResponse | ManualRefreshResponse;

    if (payload.summary) {
      setState({ summary: payload.summary });
    }

    announceRefresh(payload.refresh, trigger);

    if (refreshChangedData(payload.refresh)) {
      onDataChanged();
    }
  } catch {
    if (trigger === "MANUAL") {
      showAppToast({
        tone: "error",
        title: "Não foi possível atualizar as cotações",
        description: "O aplicativo não respondeu. Tente de novo em instantes.",
      });
    }
  } finally {
    if (spinTimer !== null) {
      window.clearTimeout(spinTimer);
    }
    setState({ running: false, spinning: false });
  }
}

function refreshChangedData(outcome: QuoteRefreshOutcome) {
  return outcome.state === "done" && outcome.run.succeeded > 0;
}

function announceRefresh(outcome: QuoteRefreshOutcome, trigger: QuoteRefreshTriggerKind) {
  if (outcome.state === "busy") {
    if (trigger === "MANUAL") {
      showAppToast({ tone: "info", title: "Já existe uma atualização de cotações em andamento." });
    }
    return;
  }

  if (outcome.state === "unavailable") {
    if (trigger === "MANUAL") {
      showAppToast({ tone: "error", title: "Não foi possível atualizar as cotações", description: outcome.message });
    }
    return;
  }

  if (outcome.state !== "done") {
    return;
  }

  const { run } = outcome;

  if (run.failures.length > 0) {
    const [first] = run.failures;
    showAppToast({
      id: `quotes-${run.id}`,
      tone: "error",
      title:
        run.failures.length === 1
          ? `Cotação de ${first.symbol} não atualizada`
          : `${run.failures.length} cotações não atualizadas`,
      description:
        run.succeeded > 0
          ? `As outras ${run.succeeded} foram atualizadas. ${run.failures.length === 1 ? "Este ativo mantém" : "Estes ativos mantêm"} o valor anterior.`
          : `${run.failures.length === 1 ? "O ativo mantém" : "Os ativos mantêm"} o valor anterior.`,
      data: {
        items: run.failures.map((failure) => ({
          label: failure.symbol,
          detail: failure.assets.length > 0 ? failure.assets.join(", ") : undefined,
          reason: `${providerLabel(failure.provider)}: ${failure.errorMessage}`,
        })),
      },
    });
    return;
  }

  if (run.status === "FAILED") {
    showAppToast({
      id: `quotes-${run.id}`,
      tone: "error",
      title: "Não foi possível atualizar as cotações",
      description: run.errorMessage ?? "A atualização falhou antes de consultar os provedores.",
    });
    return;
  }

  if (trigger === "MANUAL") {
    const month = run.repricedMonth ? parseMonthParam(run.repricedMonth) : null;
    showAppToast({
      id: `quotes-${run.id}`,
      tone: "success",
      title: "Cotações atualizadas",
      description: `${run.succeeded} ${run.succeeded === 1 ? "cotação gravada" : "cotações gravadas"} no histórico de hoje${
        month ? ` e posições de ${formatMonthCompact(month)} recalculadas` : ""
      }.`,
    });
  }
}
