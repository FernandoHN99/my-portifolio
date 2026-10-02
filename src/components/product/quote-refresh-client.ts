import { showAppToast } from "@/components/product/app-toaster";
import { hasPendingChanges } from "@/components/product/unsaved-changes";
import type { MonthRolloverOutcome, OpenCheckResponse } from "@/modules/portfolio/domain/month-rollover";
import { formatMonth, formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";
import { parseMonthParam } from "@/modules/portfolio/presentation/reference-month";
import {
  providerLabel,
  QUOTE_REFRESH_INTERVAL_MS,
  type ManualRefreshResponse,
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
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

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
      // Os provedores têm 12 segundos cada; o limite só evita a seta presa se o
      // servidor parar de responder.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = (await response.json()) as Partial<OpenCheckResponse> & ManualRefreshResponse;

    if (payload.summary) {
      setState({ summary: payload.summary });
    }

    if (payload.rollover) {
      announceRollover(payload.rollover);
    }

    announceRefresh(payload.refresh, trigger);

    if (payload.rollover?.state === "created" || refreshChangedData(payload.refresh)) {
      onDataChanged();
    }
  } catch {
    // Também na checagem automática: um erro nunca passa em silêncio. O id fixo
    // faz uma nova falha substituir o aviso anterior em vez de empilhar.
    showAppToast({
      id: "quotes-unreachable",
      tone: "error",
      title: trigger === "MANUAL" ? "Não foi possível atualizar as cotações" : "Não foi possível verificar as cotações",
      description:
        trigger === "MANUAL"
          ? "O aplicativo não respondeu. Tente de novo em instantes."
          : "O aplicativo não respondeu ao abrir. A seta do topo tenta de novo.",
    });
  } finally {
    if (spinTimer !== null) {
      window.clearTimeout(spinTimer);
    }
    setState({ running: false, spinning: false });
  }
}

const listFormat = new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" });

function monthCompact(month: string) {
  const date = parseMonthParam(month);
  return date ? formatMonthCompact(date) : month;
}

function announceRollover(outcome: MonthRolloverOutcome) {
  if (outcome.state === "unavailable") {
    showAppToast({ tone: "error", title: "Não foi possível criar a competência do mês", description: outcome.message });
    return;
  }

  if (outcome.state !== "created" || outcome.months.length === 0) {
    return;
  }

  const [first] = outcome.months;
  const firstDate = parseMonthParam(first.month);
  // Só os meses passados precisam de atenção: a competência corrente recebe as
  // cotações do dia na atualização seguinte.
  const carried = outcome.months.filter((month) => !month.isCurrent && month.carriedQuotes.length > 0);

  showAppToast({
    id: `rollover-${outcome.months.map((month) => month.month).join("-")}`,
    tone: carried.length > 0 ? "warning" : "info",
    title:
      outcome.months.length === 1 && firstDate
        ? `Competência de ${formatMonth(firstDate).toLocaleLowerCase("pt-BR")} criada`
        : `${outcome.months.length} competências criadas: ${listFormat.format(outcome.months.map((month) => monthCompact(month.month)))}`,
    description:
      outcome.months.length === 1
        ? `Posições e rateios copiados de ${monthCompact(first.sourceMonth)}.`
        : `Cada mês copiou as posições e os rateios do anterior, a partir de ${monthCompact(first.sourceMonth)}.`,
    data:
      carried.length > 0
        ? {
            items: carried.map((month) => ({
              label: monthCompact(month.month),
              detail: "sem cotação diária no mês",
              reason: `Repete a cotação de ${monthCompact(month.sourceMonth)} em ${month.carriedQuotes.join(", ")}.`,
            })),
            footnote: "Se precisar, ajuste essas cotações nas cotações do mês, na aba Posições.",
          }
        : undefined,
  });
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
    showAppToast({
      id: "quotes-unavailable",
      tone: "error",
      title: "Não foi possível atualizar as cotações",
      description: outcome.message,
    });
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

  if (trigger === "MANUAL" && run.succeeded === 0) {
    showAppToast({
      id: `quotes-${run.id}`,
      tone: "info",
      title: "Nenhuma cotação para atualizar",
      description: "A competência não tem posições com ticker.",
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
