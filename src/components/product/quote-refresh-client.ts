import { showAppToast } from "@/components/product/app-toaster";
import { hasPendingChanges } from "@/components/product/unsaved-changes";
import type { MonthRolloverOutcome, OpenCheckResponse } from "@/modules/portfolio/domain/month-rollover";
import { formatMonth, formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";
import { parseMonthParam } from "@/modules/portfolio/presentation/reference-month";
import {
  providerLabel,
  QUOTE_REFRESH_INTERVAL_MS,
  type QuoteRefreshOutcome,
  type QuoteRefreshRunView,
  type QuoteRefreshSummary,
} from "@/modules/quotes/domain/quote-refresh";

// Estado da checagem de cotações no navegador. Fica fora do React para que a
// requisição em andamento e o resultado sobrevivam à troca de abas, que monta
// um novo cabeçalho em cada página. Só há atualização automática (spec 051).

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
let refreshQueued = false;
const listeners = new Set<() => void>();
const runListeners = new Set<(run: QuoteRefreshRunView) => void>();

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

// Avisa cada execução terminada, com ou sem sucesso. A página de cotações mostra
// o histórico de execuções e o último resultado por símbolo, que mudam mesmo
// quando nenhuma cotação foi gravada.
export function subscribeQuoteRunFinished(listener: (run: QuoteRefreshRunView) => void) {
  runListeners.add(listener);
  return () => {
    runListeners.delete(listener);
  };
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
  void execute(onDataChanged);
}

// Recarrega os dados da tela, exceto quando há edições pendentes, que seriam
// descartadas se a competência exibida mudasse. Pedidos feitos no mesmo ciclo,
// pelo topo e pela página de cotações, viram um único recarregamento.
export function refreshUnlessEditing(refresh: () => void) {
  if (hasPendingChanges() || refreshQueued) {
    return;
  }

  refreshQueued = true;
  queueMicrotask(() => {
    refreshQueued = false;
    refresh();
  });
}

async function execute(onDataChanged: () => void) {
  setState({ running: true, spinning: false });
  // O indicador só mostra "Atualizando" se a checagem demorar: quando as
  // cotações estão em dia, a resposta chega antes.
  const spinTimer = window.setTimeout(() => state.running && setState({ spinning: true }), SPIN_DELAY_MS);

  try {
    const response = await fetch("/api/quotes/open-check", {
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

    const payload = (await response.json()) as OpenCheckResponse;

    if (payload.summary) {
      setState({ summary: payload.summary });
    }

    if (payload.rollover) {
      announceRollover(payload.rollover);
    }

    if (payload.targetPlan === "created") {
      showAppToast({
        id: "default-targets",
        tone: "info",
        title: "Metas padrão criadas",
        description: "Cada grupo foi dividido em partes iguais entre as categorias da carteira. Ajuste na Configuração.",
      });
    }

    announceRefresh(payload.refresh);

    if (
      payload.rollover.state === "created" ||
      payload.targetPlan === "created" ||
      refreshChangedData(payload.refresh)
    ) {
      onDataChanged();
    }

    if (payload.refresh.state === "done") {
      const { run } = payload.refresh;
      runListeners.forEach((listener) => listener(run));
    }
  } catch {
    // Também na checagem automática: um erro nunca passa em silêncio. O id fixo
    // faz uma nova falha substituir o aviso anterior em vez de empilhar.
    showAppToast({
      id: "quotes-unreachable",
      tone: "error",
      title: "Não foi possível verificar as cotações",
      description: "O aplicativo não respondeu ao abrir. Ele tenta de novo na próxima checagem.",
    });
  } finally {
    window.clearTimeout(spinTimer);
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
            footnote: "Se precisar, ajuste essas cotações em Posições, no botão Cotações.",
          }
        : undefined,
  });
}

function refreshChangedData(outcome: QuoteRefreshOutcome) {
  return outcome.state === "done" && outcome.run.succeeded > 0;
}

function announceRefresh(outcome: QuoteRefreshOutcome) {
  if (outcome.state === "busy") {
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
}
