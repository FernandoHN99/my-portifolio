import { confirmMonthRolloverAction } from "@/app/actions/edit-month";
import { showAppToast } from "@/components/product/app-toaster";
import { hasPendingChanges } from "@/components/product/unsaved-changes";
import type { MonthRolloverOutcome, OpenCheckResponse } from "@/modules/portfolio/domain/month-rollover";
import { formatMonth, formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";
import { parseMonthParam } from "@/modules/portfolio/presentation/reference-month";
import { providerLabel, type QuoteRefreshRunView, type QuoteRefreshSummary } from "@/modules/quotes/domain/quote-refresh";

// Estado da checagem de abertura no navegador. Fica fora do React para que a
// requisição em andamento e o resultado sobrevivam à troca de abas, que monta
// um novo cabeçalho em cada página. As cotações são atualizadas só pelo job
// agendado (spec 053): a checagem traz o resumo da última execução, e o
// navegador recarrega os dados quando ele mostra cotações novas.

export type PendingRollover = { latestMonth: string; months: string[] };

export type QuoteRefreshClientState = {
  running: boolean;
  summary: QuoteRefreshSummary | null;
  /** Competências que faltam até o mês corrente, à espera da confirmação (spec 078). */
  pendingRollover: PendingRollover | null;
  /** A confirmação está criando as competências. */
  rollingOver: boolean;
};

const SERVER_STATE: QuoteRefreshClientState = { running: false, summary: null, pendingRollover: null, rollingOver: false };
const DISMISSED_ROLLOVER_KEY = "rollover:dismissed";
const REQUEST_TIMEOUT_MS = 60 * 1000;
/** Intervalo mínimo entre checagens de uma aba. */
const OPEN_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const ANNOUNCED_RUN_KEY = "quotes:announced-run";

let state: QuoteRefreshClientState = SERVER_STATE;
let lastOpenCheckAt: number | null = null;
let refreshQueued = false;
// O resumo que a tela mostra: o do servidor ao montar a página, depois o de
// cada checagem. Uma execução nova muda a última execução ou o horário.
let seen: Pick<QuoteRefreshSummary, "lastUpdatedAt"> & { lastRunId: string | null } | null = null;
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

// Checagem de abertura: uma vez por carregamento do aplicativo e de novo a
// cada cinco minutos com a aba visível. O resumo do servidor ao montar a página
// é a referência para saber se o job gravou cotações desde então.
export function runOpenCheck(onDataChanged: () => void, serverSummary: QuoteRefreshSummary | null = null) {
  seen ??= serverSummary
    ? { lastUpdatedAt: serverSummary.lastUpdatedAt, lastRunId: serverSummary.lastRun?.id ?? null }
    : null;

  if (state.running) {
    return;
  }

  if (lastOpenCheckAt !== null && Date.now() - lastOpenCheckAt < OPEN_CHECK_INTERVAL_MS) {
    return;
  }

  lastOpenCheckAt = Date.now();
  void execute(onDataChanged);
}

/** Cria as competências pendentes depois da confirmação (spec 078). */
export async function confirmRollover(onDataChanged: () => void) {
  if (state.rollingOver) {
    return;
  }

  setState({ rollingOver: true });

  try {
    const outcome = await confirmMonthRolloverAction();
    setState({ pendingRollover: null });
    announceRollover(outcome);

    if (outcome.state === "created") {
      onDataChanged();
    }
  } catch {
    showAppToast({ tone: "error", title: "Não foi possível criar a competência do mês", description: "Tente de novo em instantes." });
  } finally {
    setState({ rollingOver: false });
  }
}

/** "Agora não": não pergunta de novo pelo mesmo mês nesta sessão. */
export function dismissRollover() {
  const target = state.pendingRollover?.months.at(-1);

  if (target) {
    try {
      window.sessionStorage.setItem(DISMISSED_ROLLOVER_KEY, target);
    } catch {
      // Sem armazenamento, a pergunta volta na próxima checagem.
    }
  }

  setState({ pendingRollover: null });
}

function wasDismissed(month: string) {
  try {
    return window.sessionStorage.getItem(DISMISSED_ROLLOVER_KEY) === month;
  } catch {
    return false;
  }
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
  setState({ running: true });

  try {
    const response = await fetch("/api/quotes/open-check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = (await response.json()) as OpenCheckResponse;
    const quotesChanged = payload.summary ? noteSummary(payload.summary) : false;

    if (payload.summary) {
      setState({ summary: payload.summary });
    }

    if (payload.rollover?.state === "pending") {
      // Pergunta antes de virar o mês (spec 078), a menos que o usuário já
      // tenha dito "agora não" para o mesmo mês nesta sessão.
      const target = payload.rollover.months.at(-1);
      setState({
        pendingRollover: target && wasDismissed(target) ? null : { latestMonth: payload.rollover.latestMonth, months: payload.rollover.months },
      });
    } else if (payload.rollover) {
      setState({ pendingRollover: null });
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

    const lastRun = payload.summary?.lastRun ?? null;

    if (lastRun) {
      announceRun(lastRun);
    }

    if (
      payload.rollover.state === "created" ||
      payload.rollover.state === "started" ||
      payload.targetPlan === "created" ||
      quotesChanged
    ) {
      onDataChanged();
    }
  } catch {
    // Um erro nunca passa em silêncio. O id fixo faz uma nova falha substituir
    // o aviso anterior em vez de empilhar.
    showAppToast({
      id: "quotes-unreachable",
      tone: "error",
      title: "Não foi possível verificar as cotações",
      description: "O aplicativo não respondeu ao abrir. Ele tenta de novo na próxima checagem.",
    });
  } finally {
    setState({ running: false });
  }
}

/**
 * Guarda o resumo visto e diz se o job gravou cotações desde o anterior. Uma
 * execução nova também avisa a página de cotações, que mostra o histórico de
 * execuções.
 */
function noteSummary(summary: QuoteRefreshSummary) {
  const previous = seen;
  const lastRunId = summary.lastRun?.id ?? null;
  seen = { lastUpdatedAt: summary.lastUpdatedAt, lastRunId };

  if (!previous) {
    return false;
  }

  if (summary.lastRun && lastRunId !== previous.lastRunId) {
    const run = summary.lastRun;
    runListeners.forEach((listener) => listener(run));
  }

  return summary.lastUpdatedAt !== previous.lastUpdatedAt;
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

// Avisa as falhas de cada execução uma única vez, mesmo que a página seja
// recarregada: o id da última execução avisada fica no navegador.
function announceRun(run: QuoteRefreshRunView) {
  if (run.status === "RUNNING" || (run.failures.length === 0 && run.status !== "FAILED") || wasAnnounced(run.id)) {
    return;
  }

  markAnnounced(run.id);

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

function wasAnnounced(runId: string) {
  try {
    return window.localStorage.getItem(ANNOUNCED_RUN_KEY) === runId;
  } catch {
    return false;
  }
}

function markAnnounced(runId: string) {
  try {
    window.localStorage.setItem(ANNOUNCED_RUN_KEY, runId);
  } catch {
    // Sem armazenamento, o aviso pode se repetir num novo carregamento.
  }
}
