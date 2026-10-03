"use client";

import {
  ArrowLeftIcon,
  CheckCircleIcon,
  CurrencyCircleDollarIcon,
  LockKeyIcon,
  PencilSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";

import { saveQuotesAction, undoChangeAction, type EditActionResult } from "@/app/actions/edit-month";
import { LocalDateTime } from "@/components/product/local-time";
import { refreshUnlessEditing, subscribeQuoteRunFinished } from "@/components/product/quote-refresh-client";
import { confirmDiscardChanges, setPendingChanges } from "@/components/product/unsaved-changes";
import { cn } from "@/lib/utils";
import {
  formatBrl,
  formatMonthCompact,
  formatPriceBrl,
  parseLocaleNumber,
} from "@/modules/portfolio/presentation/portfolio-format";
import { parseMonthParam } from "@/modules/portfolio/presentation/reference-month";
import { EditToast, type EditToastState } from "@/modules/portfolio/ui/edit-toast";
import type { MonthQuoteRow, MonthQuotesView } from "@/modules/quotes/application/get-month-quotes";
import type { QuoteRunHistoryPage } from "@/modules/quotes/application/get-run-history";
import { providerLabel, type QuoteRefreshSummary } from "@/modules/quotes/domain/quote-refresh";
import { LastRefreshCard } from "@/modules/quotes/ui/last-refresh-card";
import { RefreshRunHistory } from "@/modules/quotes/ui/refresh-run-history";

// O servidor guarda as cotações com até oito casas decimais.
const MAX_DECIMALS = 8;

const INSTRUMENT_LABELS: Record<string, string> = {
  ACAO: "Ação",
  CRIPTO: "Cripto",
  ETF: "ETF",
  FIAT: "Moeda",
};

type QuoteDraftRow = MonthQuoteRow & {
  text: string;
  changed: boolean;
  invalid: boolean;
  previewTotal: number;
};

export function QuotesWorkspace({
  month,
  summary,
  history,
}: {
  month: MonthQuotesView | null;
  summary: QuoteRefreshSummary | null;
  history: QuoteRunHistoryPage | null;
}) {
  const router = useRouter();
  const monthParam = useSearchParams().get("mes");
  const [stateMonthId, setStateMonthId] = useState(month?.id);
  const [editMode, setEditMode] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<EditToastState | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isUndoing, startUndo] = useTransition();
  const sequence = useRef(0);

  if (month?.id !== stateMonthId) {
    setStateMonthId(month?.id);
    setDrafts({});
    setEditMode(false);
  }

  const rows = month ? month.quotes.map((quote) => draftRow(quote, drafts[quote.symbol])) : [];
  const changed = rows.filter((row) => row.changed);
  const changeCount = changed.length;
  const invalidCount = changed.filter((row) => row.invalid).length;

  useEffect(() => {
    setPendingChanges(changeCount);

    if (changeCount === 0) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changeCount]);

  useEffect(() => () => setPendingChanges(0), []);

  // O histórico e o último resultado por cotação mudam a cada execução, mesmo
  // quando nenhuma cotação foi gravada; o topo só recarrega quando algo foi.
  useEffect(
    () => subscribeQuoteRunFinished(() => refreshUnlessEditing(() => router.refresh())),
    [router],
  );

  const dismissToast = useCallback(() => setToast(null), []);

  const positionsHref = monthParam ? `/posicoes?mes=${monthParam}` : "/posicoes";

  if (!month) {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-center justify-center px-5 text-center">
        <span className="grid size-12 place-items-center rounded-2xl border border-border bg-card text-primary">
          <CurrencyCircleDollarIcon aria-hidden="true" size={22} weight="duotone" />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">Nenhuma cotação nesta competência</h1>
      </div>
    );
  }

  const monthLabel = formatMonthCompact(month.referenceDate);
  const previewTotal =
    month.totalBrl + changed.reduce((total, row) => total + (row.invalid ? 0 : row.previewTotal - row.totalBrl), 0);
  const usdRow = rows.find((row) => row.symbol === "USD");
  const usdRate = usdRow ? previewPrice(usdRow) : null;
  const carriedCount = month.quotes.filter((quote) => quote.carriedFrom !== null).length;
  const failedCount = month.quotes.filter((quote) => quote.lastResult?.status === "FAILED").length;
  const editableCount = month.quotes.filter((quote) => quote.editable).length;

  const notify = (result: EditActionResult) =>
    setToast({
      id: ++sequence.current,
      tone: result.ok ? "success" : "error",
      message: result.message,
      undoToken: result.ok ? result.undoToken : undefined,
    });

  const exitEditMode = () => {
    setDrafts({});
    setEditMode(false);
  };

  const save = () =>
    startSaving(async () => {
      const result = await saveQuotesAction({
        monthId: month.id,
        quotes: changed.map((row) => ({ symbol: row.symbol, valueBrl: row.text.trim() })),
      });

      if (result.ok) {
        exitEditMode();
      }
      notify(result);
    });

  const undo = (token: string) =>
    startUndo(async () => {
      notify(await undoChangeAction(token));
    });

  return (
    <div className="relative mx-auto w-full max-w-[1472px] px-5 py-8 pb-32 sm:px-7 sm:py-10 sm:pb-32 xl:px-12 xl:py-12 xl:pb-32">
      <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[460px] w-[460px]" />

      <header className="flex flex-col gap-6 border-b border-border/70 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {/* Como as abas, a volta pede confirmação com edições pendentes: a
              navegação no cliente não dispara o aviso do navegador. */}
          <Link
            href={positionsHref}
            aria-label="Voltar para Posições"
            onClick={(event) => {
              if (!confirmDiscardChanges()) {
                event.preventDefault();
              }
            }}
            className="group inline-flex items-center gap-1.5 rounded-md text-[11px] font-semibold tracking-[0.16em] text-primary uppercase outline-none transition-colors hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ArrowLeftIcon
              aria-hidden="true"
              size={12}
              weight="bold"
              className="transition-transform duration-150 group-hover:-translate-x-0.5"
            />
            Posições
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-[2.65rem]">Cotações do mês</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Valores em reais usados para calcular as posições com ticker nesta competência.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <p className="font-mono text-xs text-muted-foreground">
            {formatBrl(previewTotal)}
            {usdRate ? ` · US$ ${formatUsd(previewTotal / usdRate)}` : ""}
          </p>
          {editMode || editableCount === 0 || month.isLocked ? null : (
            <button
              type="button"
              onClick={() => setEditMode(true)}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card/70 px-3.5 text-xs font-semibold text-foreground outline-none transition-colors hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <PencilSimpleIcon aria-hidden="true" size={14} weight="bold" />
              Editar cotações
            </button>
          )}
        </div>
      </header>

      {editableCount === 0 && month.quotes.length > 0 ? (
        <div
          data-testid="quotes-locked"
          className="mt-6 flex items-center gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3"
        >
          <LockKeyIcon aria-hidden="true" className="shrink-0 text-muted-foreground" size={16} weight="duotone" />
          <p className="text-xs text-muted-foreground">
            As cotações de {monthLabel} vêm dos provedores ou da planilha. A edição à mão fica disponível só para
            cotação não encontrada ou com falha na última atualização.
          </p>
        </div>
      ) : month.isLocked ? (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3">
          <LockKeyIcon aria-hidden="true" className="text-muted-foreground" size={16} weight="duotone" />
          <p data-testid="month-locked" className="text-xs text-muted-foreground">
            {monthLabel} está fechado. Para editar uma cotação com falha, abra o mês pelo cadeado na linha do tempo.
          </p>
        </div>
      ) : null}

      {/* A atualização só muda o mês corrente; nos outros meses o card não
          aparece (spec 038). */}
      {month.isCurrent ? <LastRefreshCard summary={summary} currentMonth={month.currentMonth} /> : null}

      <section className="premium-panel mt-6 overflow-hidden rounded-[24px]" aria-labelledby="month-quotes-title">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border/60 px-5 py-4 sm:px-6">
          <CurrencyCircleDollarIcon aria-hidden="true" className="text-primary" size={17} weight="duotone" />
          <h2 id="month-quotes-title" className="text-sm font-semibold text-foreground">
            Cotações de {monthLabel}
          </h2>
          <span className="text-[11px] text-muted-foreground">
            {month.quotes.length} {month.quotes.length === 1 ? "símbolo" : "símbolos"}
          </span>
          {carriedCount > 0 ? (
            <span className="rounded-full bg-warning/50 px-2 py-0.5 text-[10px] font-semibold text-warning-foreground">
              {carriedCount} {carriedCount === 1 ? "repetida" : "repetidas"}
            </span>
          ) : null}
          {failedCount > 0 ? (
            <span className="rounded-full bg-destructive/12 px-2 py-0.5 text-[10px] font-semibold text-destructive">
              {failedCount} com falha na última atualização
            </span>
          ) : null}
          {changeCount > 0 ? (
            <span className="rounded-full bg-warning/50 px-2 py-0.5 text-[10px] font-semibold text-warning-foreground">
              {changeCount} {changeCount === 1 ? "alterada" : "alteradas"}
            </span>
          ) : null}
        </div>

        {editMode ? (
          <p className="border-b border-border/60 px-5 py-2.5 text-[11px] text-muted-foreground sm:px-6">
            Só as cotações não encontradas ou com falha na última atualização podem ser editadas; as demais
            vêm dos provedores. Alterar uma cotação recalcula o total das posições daquele símbolo em {monthLabel}.
            {month.isCurrent ? " A próxima atualização bem-sucedida substitui o valor editado." : ""}
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border/60 text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
                <th className="px-4 py-3 pl-5 sm:pl-6">Cotação</th>
                <th className="px-3 py-3 text-right sm:px-4">Valor</th>
                <th className="hidden px-4 py-3 md:table-cell">Origem</th>
                <th className="hidden px-4 py-3 text-right whitespace-nowrap sm:table-cell">
                  <span title="Calculado" className="mr-1 font-mono normal-case text-muted-foreground/60">
                    ƒ
                  </span>
                  Total das posições
                </th>
                <th className="hidden px-4 py-3 pr-5 whitespace-nowrap lg:table-cell sm:pr-6">Última atualização</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/55">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-muted-foreground">
                    Nenhuma cotação nesta competência.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <QuoteRow
                    key={row.symbol}
                    row={row}
                    editMode={editMode}
                    onChange={(text) => setDrafts((current) => ({ ...current, [row.symbol]: text }))}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <RefreshRunHistory initial={history} />

      {editMode ? (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] z-40 flex justify-center px-4">
          <div
            className={cn(
              "flex w-full max-w-xl items-center gap-3 rounded-2xl border bg-card/95 px-4 py-3 shadow-2xl backdrop-blur-xl",
              invalidCount > 0 ? "border-destructive/40" : changeCount > 0 ? "border-warning-border" : "border-border",
            )}
          >
            <PencilSimpleIcon
              aria-hidden="true"
              className={cn("shrink-0", invalidCount > 0 ? "text-destructive" : "text-warning-foreground")}
              size={14}
              weight="bold"
            />
            <p className="text-xs text-foreground" aria-live="polite">
              {invalidCount > 0
                ? `${invalidCount} ${invalidCount === 1 ? "valor inválido" : "valores inválidos"}`
                : changeCount === 0
                  ? "Modo de edição"
                  : `${changeCount} ${changeCount === 1 ? "alteração pendente" : "alterações pendentes"}`}
            </p>
            <button
              type="button"
              onClick={exitEditMode}
              disabled={isSaving}
              className="ml-auto h-8 rounded-lg px-3 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {changeCount > 0 ? "Descartar" : "Sair da edição"}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isSaving || changeCount === 0 || invalidCount > 0}
              className="inline-flex h-8 items-center rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground outline-none transition-[background-color,transform] duration-150 hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.98] disabled:opacity-50"
            >
              {isSaving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      ) : null}

      <EditToast toast={toast} onDismiss={dismissToast} onUndo={undo} undoing={isUndoing} />
    </div>
  );
}

function QuoteRow({
  row,
  editMode,
  onChange,
}: {
  row: QuoteDraftRow;
  editMode: boolean;
  onChange: (text: string) => void;
}) {
  const totalChanged = row.changed && !row.invalid && Math.abs(row.previewTotal - row.totalBrl) > 0.005;

  return (
    <tr data-testid="quote-row" className="align-top transition-colors duration-150 hover:bg-white/[0.018]">
      <td className="px-4 py-4 pl-5 sm:pl-6">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-sm font-semibold text-foreground">{row.symbol}</span>
          {row.instrumentType ? (
            <span className="text-[10px] text-muted-foreground">
              {INSTRUMENT_LABELS[row.instrumentType] ?? row.instrumentType}
            </span>
          ) : null}
        </p>
        <p className="mt-1 max-w-[340px] text-[11px] leading-snug text-muted-foreground">
          {row.assets.length > 0 ? row.assets.join(", ") : "Nenhuma posição usa esta cotação"}
        </p>
        {row.quantities.length > 0 ? (
          <p className="mt-0.5 text-[10px] text-muted-foreground/80">
            {row.quantities.length} {row.quantities.length === 1 ? "posição" : "posições"}
          </p>
        ) : null}
        <div className="mt-1.5 md:hidden">
          <QuoteOrigin row={row} />
        </div>
        <div className="mt-1 lg:hidden">
          <LastResult row={row} compact />
        </div>
      </td>
      <td
        className={cn(
          "px-3 py-4 text-right sm:px-4",
          row.changed && "bg-warning/25 shadow-[inset_2px_0_0_var(--warning-border)]",
        )}
      >
        {editMode && row.editable ? (
          <label className="relative ml-auto flex w-full min-w-[104px] items-center sm:min-w-[164px]">
            <span className="pointer-events-none absolute left-2.5 text-[11px] text-muted-foreground">R$</span>
            <input
              data-quote-cell="value"
              inputMode="decimal"
              aria-label={`Cotação de ${row.symbol}`}
              aria-invalid={row.invalid}
              value={row.text}
              placeholder="sem cotação"
              onChange={(event) => onChange(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={moveFocus}
              className={cn(
                "h-8 w-full rounded-md border bg-background/60 pr-2 pl-8 text-right font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2",
                row.invalid
                  ? "border-destructive focus-visible:ring-destructive/40"
                  : row.changed
                    ? "border-warning-border focus-visible:ring-ring/50"
                    : "border-border focus-visible:border-primary/60 focus-visible:ring-ring/50",
              )}
            />
          </label>
        ) : (
          <>
            <span className="font-mono text-xs font-medium whitespace-nowrap text-foreground sm:text-sm">
              {row.valueBrl === null ? <span className="text-muted-foreground">Sem cotação</span> : formatPriceBrl(row.valueBrl)}
            </span>
            {editMode ? (
              <p title="Vem dos provedores pela atualização de cotações." className="mt-1 text-[9px] text-muted-foreground">
                Automática
              </p>
            ) : null}
          </>
        )}
        {row.changed && !row.invalid && row.valueBrl !== null ? (
          <p className="mt-1 font-mono text-[9px] text-muted-foreground sm:whitespace-nowrap">
            antes {formatPriceBrl(row.valueBrl)}
          </p>
        ) : null}
        {totalChanged ? (
          <p className="mt-0.5 font-mono text-[9px] text-muted-foreground sm:hidden">
            posições {formatBrl(row.previewTotal)}
          </p>
        ) : null}
      </td>
      <td className="hidden px-4 py-4 md:table-cell">
        <QuoteOrigin row={row} />
      </td>
      <td
        className={cn(
          "hidden bg-white/[0.012] px-4 py-4 text-right sm:table-cell",
          totalChanged && "bg-warning/25 shadow-[inset_2px_0_0_var(--warning-border)]",
        )}
      >
        {row.quantities.length === 0 ? (
          <span className="font-mono text-xs text-muted-foreground">—</span>
        ) : (
          <>
            <span className="font-mono text-xs whitespace-nowrap text-foreground">{formatBrl(row.previewTotal)}</span>
            {totalChanged ? (
              <p className="mt-0.5 font-mono text-[9px] whitespace-nowrap text-muted-foreground">
                de {formatBrl(row.totalBrl)}
              </p>
            ) : null}
          </>
        )}
      </td>
      <td className="hidden px-4 py-4 pr-5 lg:table-cell sm:pr-6">
        <LastResult row={row} />
      </td>
    </tr>
  );
}

function QuoteOrigin({ row }: { row: MonthQuoteRow }) {
  if (row.valueBrl === null) {
    return <span className="text-[11px] text-muted-foreground">Sem valor no mês</span>;
  }

  if (row.carriedFrom) {
    const source = parseMonthParam(row.carriedFrom);
    const label = source ? formatMonthCompact(source) : row.carriedFrom;

    return (
      <span
        title={`Sem cotação diária neste mês: o valor foi copiado de ${label}.`}
        className="inline-flex rounded-full bg-warning/50 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-warning-foreground"
      >
        Repetida de {label}
      </span>
    );
  }

  if (row.quoteDate) {
    return <span className="text-[11px] whitespace-nowrap text-foreground/85">Cotação de {formatDay(row.quoteDate)}</span>;
  }

  return (
    <span
      title="Valor importado do Excel ou editado à mão, sem um dia do histórico diário."
      className="text-[11px] whitespace-nowrap text-muted-foreground"
    >
      Valor do mês
    </span>
  );
}

function LastResult({ row, compact = false }: { row: MonthQuoteRow; compact?: boolean }) {
  const result = row.lastResult;

  if (!result) {
    return compact ? null : (
      <span title="Sem atualização de cotações neste mês" className="text-[11px] text-muted-foreground">
        —
      </span>
    );
  }

  const ok = result.status === "SUCCESS";

  return (
    <div data-testid={compact ? undefined : "quote-last-result"} className="flex items-start gap-1.5">
      {ok ? (
        <CheckCircleIcon aria-hidden="true" className="mt-px shrink-0 text-primary" size={13} weight="fill" />
      ) : (
        <WarningCircleIcon aria-hidden="true" className="mt-px shrink-0 text-destructive" size={13} weight="fill" />
      )}
      <div className="min-w-0 text-[11px] leading-snug">
        <p className={ok ? "text-foreground/85" : "text-destructive"}>
          {result.trigger === "INCLUSION" ? "Incluída" : ok ? "Atualizada" : "Falhou"} em{" "}
          <LocalDateTime iso={result.fetchedAt} />
        </p>
        {/* Motivos com termos longos, como ALPHA_VANTAGE_API_KEY, quebram em
            qualquer ponto para não alargar a coluna no celular. */}
        <p className={cn("text-muted-foreground wrap-anywhere", compact && "max-w-[260px]")}>
          {providerLabel(result.provider)}
          {result.trigger === "INCLUSION" ? " · ao incluir a posição" : null}
          {ok ? null : `: ${result.errorMessage ?? "falha sem descrição."}`}
        </p>
      </div>
    </div>
  );
}

function draftRow(quote: MonthQuoteRow, draft: string | undefined): QuoteDraftRow {
  const initial = quote.valueText.replace(".", ",");
  const text = draft ?? initial;
  const parsed = parseLocaleNumber(text);
  // Sem valor guardado, qualquer texto digitado é uma alteração, para que um
  // valor que não é número fique marcado em vez de ser ignorado ao salvar.
  const changed = text.trim() !== initial && (quote.valueBrl === null || parsed !== quote.valueBrl);
  const invalid = changed && (parsed === null || parsed <= 0 || decimalPlaces(text) > MAX_DECIMALS);
  const previewTotal =
    changed && !invalid && parsed !== null
      ? quote.quantities.reduce((total, quantity) => total + Math.round(quantity * parsed * 100) / 100, 0)
      : quote.totalBrl;

  return { ...quote, text, changed, invalid, previewTotal };
}

function previewPrice(row: QuoteDraftRow) {
  return row.changed && !row.invalid ? parseLocaleNumber(row.text) : row.valueBrl;
}

function decimalPlaces(text: string) {
  const trimmed = text.trim();
  const separator = trimmed.includes(",") ? "," : ".";
  const [, decimals = ""] = trimmed.split(separator);
  return decimals.length;
}

const dayFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });

// Dia de calendário (AAAA-MM-DD), sem fuso: a coluna DATE do banco.
function formatDay(dateKey: string) {
  return dayFormat.format(new Date(`${dateKey}T00:00:00Z`));
}

// Só as cotações editáveis têm campo; as setas e o Enter andam entre elas.
function moveFocus(event: KeyboardEvent<HTMLInputElement>) {
  const step = event.key === "ArrowDown" || event.key === "Enter" ? 1 : event.key === "ArrowUp" ? -1 : 0;

  if (step === 0) {
    return;
  }

  const inputs = [...document.querySelectorAll<HTMLElement>('[data-quote-cell="value"]')];
  const target = inputs[inputs.indexOf(event.currentTarget) + step];

  if (target) {
    event.preventDefault();
    target.focus();
  }
}

function formatUsd(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
