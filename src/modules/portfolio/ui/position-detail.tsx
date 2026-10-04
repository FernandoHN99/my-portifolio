"use client";

import NumberFlow from "@number-flow/react";
import {
  ArrowLeftIcon,
  ArrowsDownUpIcon,
  ChartPieSliceIcon,
  CoinsIcon,
  HandCoinsIcon,
  InfoIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  TrendDownIcon,
  TrendUpIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useCallback, useRef, useState, useTransition } from "react";

import { removeTransactionAction, undoChangeAction, type EditActionResult } from "@/app/actions/edit-month";
import { cn } from "@/lib/utils";
import type { EditingCatalog } from "@/modules/portfolio/application/get-editing-catalog";
import type { MonthPosition } from "@/modules/portfolio/application/get-month-positions";
import type { PositionHistoryView } from "@/modules/portfolio/application/get-position-history";
import type { HistorySlot, PositionSummary, PresentSlot } from "@/modules/portfolio/domain/position-history";
import { categoryColor } from "@/modules/portfolio/presentation/category-colors";
import { formatDay, maturityStatus } from "@/modules/portfolio/presentation/maturity";
import {
  formatBrl,
  formatPercent,
  formatPriceBrl,
} from "@/modules/portfolio/presentation/portfolio-format";
import { allocationLabel, NO_STRATEGY } from "@/modules/portfolio/presentation/position-filters";
import {
  formatEstimatedPrice,
  formatPoints,
  formatQuantity,
  formatSignedBrl,
  formatUsd,
  monthLabel,
  monthRangeLabel,
  positionHref,
  positionsTableHref,
} from "@/modules/portfolio/presentation/position-page";
import { AssetPriceChart } from "@/modules/portfolio/ui/asset-price-chart";
import { BalanceChangeChart } from "@/modules/portfolio/ui/balance-change-chart";
import { EditToast, type EditToastState } from "@/modules/portfolio/ui/edit-toast";
import { ChangeKpiCard, KpiCard } from "@/modules/portfolio/ui/kpi-card";
import { MaturityBadge } from "@/modules/portfolio/ui/maturity-badge";
import { HighlightRow, PositionAttribution } from "@/modules/portfolio/ui/position-attribution";
import { PositionAllocation } from "@/modules/portfolio/ui/position-allocation";
import { PositionEvolutionChart } from "@/modules/portfolio/ui/position-evolution-chart";
import { PositionFormDialog, type PositionFormMonth } from "@/modules/portfolio/ui/position-form-dialog";
import { PositionMonthsTable } from "@/modules/portfolio/ui/position-months-table";
import {
  PositionTransactionDialog,
  transactionMonthOf,
  type TransactionEdit,
} from "@/modules/portfolio/ui/position-transaction-dialog";
import { PositionTransactions } from "@/modules/portfolio/ui/position-transactions";
import { CdiPanel } from "@/modules/portfolio/ui/cdi-panel";
import { recordedByMonth } from "@/modules/portfolio/domain/position-transactions";
import { cashCurrencyOf, LiquidationDialog, type CashAccountOption } from "@/modules/portfolio/ui/liquidation-dialog";

const SCOPES = ["todas"] as const;

const brlWhole = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const signedPercent = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});
const sharePercent = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * Edição da posição a partir da página dela (spec 043), com o mesmo formulário
 * da tabela: a posição da competência selecionada, se houver, e o mês, que
 * precisa estar aberto.
 */
export type PositionEditing = {
  position: MonthPosition | null;
  month: PositionFormMonth & { isLocked: boolean };
  occupied: string[];
  catalog: EditingCatalog;
  /** Caixas marcados como conta corrente no mês, destinos da liquidação (spec 059). */
  cashAccounts: CashAccountOption[];
};

export function PositionDetail({
  history,
  editing,
}: {
  history: PositionHistoryView | null;
  editing: PositionEditing | null;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [scopeParam, setScopeParam] = useQueryState("contas", parseAsStringLiteral(SCOPES));
  const [form, setForm] = useState({ open: false, key: 0 });
  const [movement, setMovement] = useState<{ open: boolean; key: number; edit: TransactionEdit | null }>({
    open: false,
    key: 0,
    edit: null,
  });
  const [liquidation, setLiquidation] = useState({ open: false, key: 0 });
  const [isRemoving, startRemoving] = useTransition();
  const [toast, setToast] = useState<EditToastState | null>(null);
  const [isUndoing, startUndo] = useTransition();
  const sequence = useRef(0);
  const dismissToast = useCallback(() => setToast(null), []);
  const backHref = positionsTableHref(searchParams);

  const notify = (result: EditActionResult) =>
    setToast({
      id: ++sequence.current,
      tone: result.ok ? "success" : "error",
      message: result.message,
      undoToken: result.ok ? result.undoToken : undefined,
    });
  const undo = (token: string) =>
    startUndo(async () => {
      const result = await undoChangeAction(token);
      notify(result);
      if (result.ok) {
        router.refresh();
      }
    });

  if (!history) {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-center justify-center px-5 text-center">
        <span className="grid size-12 place-items-center rounded-2xl border border-border bg-card text-primary">
          <MagnifyingGlassIcon aria-hidden="true" size={22} weight="duotone" />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">Posição não encontrada</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Nenhuma competência tem esta combinação de conta e ativo.
        </p>
        <BackLink href={backHref} className="mt-6" />
      </div>
    );
  }

  const scope: "account" | "all" = scopeParam === "todas" && history.all ? "all" : "account";
  const view = scope === "all" && history.all ? history.all : history.account;
  const { summary, slots } = view;
  const transactions = view.transactions.filter((entry) => entry.month <= history.selectedMonth);
  const quoted = Boolean(history.quoteSymbol);
  const dollarBalance = history.quoteSymbol === "USD";
  const current = summary.current;
  const snapshot = current ?? lastPresentUpTo(slots, history.selectedMonth) ?? firstPresent(slots);
  const selectedLabel = monthLabel(history.selectedMonth);
  const firstEver = firstPresent(slots)?.month ?? null;
  const allocations = snapshot?.allocations ?? [];
  // Uma classificação só, de 100%, aparece como um selo discreto no cabeçalho,
  // e a cotação ocupa a largura toda (spec 045).
  const singleAllocation = allocations.length === 1 ? allocations[0] : null;
  const classes = singleAllocation ? [] : [...new Set(allocations.map((slice) => slice.assetClass))];
  const editPosition = editing?.position ?? null;
  const editBlocked = !editing
    ? "Indisponível."
    : editing.month.isLocked
      ? `${selectedLabel} está fechado. Abra o mês pelo cadeado para editar.`
      : !editPosition
        ? `Sem a posição em ${selectedLabel}.`
        : null;
  const strategy = snapshot ? (snapshot.strategy ?? NO_STRATEGY) : null;
  // Título vencido com saldo no mês aberto (spec 059).
  const canLiquidate =
    editBlocked === null &&
    editPosition !== null &&
    history.maturityDate !== null &&
    history.maturityDate <= history.referenceDay &&
    editPosition.totalBrl > 0;
  const usdValue = current && history.usdRate ? current.valueBrl / history.usdRate : null;

  return (
    <div className="relative mx-auto w-full max-w-[1472px] px-5 py-8 pb-24 sm:px-7 sm:py-10 xl:px-12 xl:py-12">
      <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[460px] w-[460px]" />

      <header className="flex flex-col gap-6 border-b border-border/70 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <BackLink href={backHref} />
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] break-words sm:text-[2.65rem]">
            {history.assetName}
          </h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground">
            <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-foreground/85">
              {history.ticker ?? "SALDO"}
            </span>
            <span>
              {scope === "all"
                ? `Todas as contas: ${allAccountLabels(history).join(", ")}`
                : history.institutionName}
            </span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="position-chips">
            {singleAllocation ? (
              <span
                title="Rateio: 100% nesta classificação"
                data-testid="position-single-allocation"
                className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-muted-foreground"
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: categoryColor(singleAllocation.assetClass) }} />
                {allocationLabel(singleAllocation)}
                <span className="font-mono text-[10px] text-muted-foreground/70">100%</span>
              </span>
            ) : null}
            {classes.map((assetClass) => (
              <span
                key={assetClass}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-muted-foreground"
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: categoryColor(assetClass) }} />
                {assetClass}
              </span>
            ))}
            {strategy ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
                <span className="size-1.5 rounded-full" style={{ backgroundColor: categoryColor(strategy) }} />
                {strategy}
              </span>
            ) : null}
            {history.maturityDate ? (
              <MaturityBadge
                maturityDate={history.maturityDate}
                referenceDay={history.referenceDay}
                className="px-2.5 py-1 text-[11px]"
              />
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <p className="font-mono text-xs text-muted-foreground">
            {current
              ? `${formatBrl(current.valueBrl)}${usdValue !== null ? ` · US$ ${formatUsd(usdValue)}` : ""}`
              : `Sem a posição em ${selectedLabel}`}
          </p>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {canLiquidate ? (
              <button
                type="button"
                onClick={() => setLiquidation((value) => ({ open: true, key: value.key + 1 }))}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                <HandCoinsIcon aria-hidden="true" size={14} weight="bold" />
                Liquidar
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setMovement((value) => ({ open: true, key: value.key + 1, edit: null }))}
              disabled={editBlocked !== null}
              title={editBlocked ?? `Aporte, retirada ou rendimento em ${selectedLabel}`}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card/70 px-3.5 text-xs font-semibold text-foreground outline-none transition-colors hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <ArrowsDownUpIcon aria-hidden="true" size={14} weight="bold" />
              Movimentar
            </button>
            <button
              type="button"
              onClick={() => setForm((value) => ({ open: true, key: value.key + 1 }))}
              disabled={editBlocked !== null}
              title={editBlocked ?? `Editar a posição em ${selectedLabel}`}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card/70 px-3.5 text-xs font-semibold text-foreground outline-none transition-colors hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <PencilSimpleIcon aria-hidden="true" size={14} weight="bold" />
              Editar posição
            </button>
          </div>
        </div>
      </header>

      {history.all ? (
        <section
          aria-label="Contas do ativo"
          className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3 sm:flex-row sm:items-center"
        >
          <div role="group" aria-label="Contas consideradas" className="flex w-fit items-center gap-0.5 rounded-lg border border-border bg-card/60 p-0.5">
            {(
              [
                { key: "account", label: "Nesta conta" },
                { key: "all", label: "Todas as contas" },
              ] as const
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={scope === option.key}
                onClick={() => void setScopeParam(option.key === "all" ? "todas" : null)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                  scope === option.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {history.assetName} também esteve em{" "}
            {history.otherAccounts.map((other, index) => (
              <span key={other.accountId}>
                {index > 0 ? (index === history.otherAccounts.length - 1 ? " e " : ", ") : null}
                <Link
                  href={positionHref(other.accountId, history.assetId, searchParams)}
                  className="rounded-sm text-foreground/85 underline decoration-border underline-offset-4 outline-none transition-colors hover:text-foreground hover:decoration-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {other.label}
                </Link>{" "}
                ({monthRangeLabel(other.firstMonth, other.lastMonth)})
              </span>
            ))}
            . “Todas as contas” soma o ativo em todas elas.
          </p>
        </section>
      ) : null}

      {summary.state !== "present" ? (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3" data-testid="position-absent">
          <InfoIcon aria-hidden="true" className="shrink-0 text-muted-foreground" size={16} weight="duotone" />
          <p className="text-xs text-muted-foreground">
            {summary.state === "before" && firstEver
              ? `A posição entra no histórico em ${monthLabel(firstEver)}; em ${selectedLabel} ainda não existia.`
              : summary.lastPresentMonth
                ? `Sem a posição em ${selectedLabel}${scope === "account" ? " nesta conta" : ""}. Última competência com ela: ${monthLabel(summary.lastPresentMonth)}.`
                : `Sem a posição em ${selectedLabel}.`}
          </p>
        </div>
      ) : null}

      <div className="mt-7">
        <PositionKpis
          summary={summary}
          quoted={quoted}
          quoteSymbol={history.quoteSymbol}
          ticker={history.ticker}
          usdValue={usdValue}
          selectedLabel={selectedLabel}
          firstEver={firstEver}
        />
      </div>

      <section className="premium-panel mt-6 rounded-[24px] p-5 sm:p-7" aria-labelledby="position-evolution-title">
        <div className="mb-1">
          <h2 id="position-evolution-title" className="text-base font-semibold tracking-[-0.025em]">
            Evolução da posição
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Valor em cada competência desde a entrada. Clique em um mês para abrir aquela competência.
          </p>
        </div>
        <div className="mt-5">
          <PositionEvolutionChart
            slots={slots}
            selectedMonth={history.selectedMonth}
            quoted={quoted}
            quoteSymbol={history.quoteSymbol}
            ticker={history.ticker}
            scopeLabel={scope}
          />
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)] [&>*]:min-w-0">
        <PositionAttribution
          summary={summary}
          quoted={quoted}
          dollarBalance={dollarBalance}
          scope={scope}
          hasOtherAccounts={history.all !== null}
        />
        <PositionHighlights
          summary={summary}
          quoted={quoted}
          dollarBalance={dollarBalance}
          liquidity={history.liquidity}
          maturityDate={history.maturityDate}
          referenceDay={history.referenceDay}
        />
      </div>

      <div
        className={cn(
          "mt-6 grid grid-cols-1 gap-6 [&>*]:min-w-0",
          !singleAllocation && "xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]",
        )}
      >
        <section className="premium-panel rounded-[24px] p-5 sm:p-7" aria-labelledby="asset-price-title">
          <h2 id="asset-price-title" className="text-base font-semibold tracking-[-0.025em]">
            {history.quoteSymbol === "USD"
              ? "Cotação do dólar"
              : history.quoteSymbol
                ? `Cotação de ${history.ticker ?? history.quoteSymbol}`
                : "Variação mensal do saldo"}
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {!history.prices
              ? "Saldo em reais, sem cotação de mercado: cada barra é a diferença para a competência anterior, com rendimentos, aportes e resgates juntos."
              : "Fechamento de cada mês: a cotação mais recente daquele mês. No mês corrente, a última cotação."}
          </p>
          {history.history?.state === "pending" ? (
            <p data-testid="price-history-pending" className="mt-2 text-[11px] text-primary">
              Preparando o histórico de cotações deste ativo. Ele aparece depois da próxima atualização automática,
              em até uma hora.
            </p>
          ) : history.history?.state === "failed" ? (
            <p data-testid="price-history-pending" className="mt-2 text-[11px] text-destructive">
              O histórico de cotações ainda não foi carregado ({history.history.error}). A atualização automática tenta
              de novo uma vez por dia.
            </p>
          ) : null}
          <div className="mt-5">
            {history.prices && history.quoteSymbol ? (
              <AssetPriceChart
                prices={history.prices}
                symbol={history.quoteSymbol}
                selectedMonth={history.selectedMonth}
                averagePriceBrl={summary.averagePriceBrl}
                averageLabel={
                  summary.costSource === "known"
                    ? dollarBalance ? "Câmbio médio de compra" : "Preço médio de compra"
                    : dollarBalance ? "Câmbio médio estimado" : "Preço médio estimado"
                }
                markers={transactions.flatMap((entry) =>
                  (entry.kind === "CONTRIBUTION" || entry.kind === "WITHDRAWAL") && entry.unitPriceBrl
                    ? [{ day: entry.occurredOn, kind: entry.kind, unitPriceBrl: entry.unitPriceBrl }]
                    : [],
                )}
              />
            ) : (
              <BalanceChangeChart slots={slots} selectedMonth={history.selectedMonth} scope={scope} />
            )}
          </div>
          {history.prices && history.prices.carriedMonths.length > 0 ? (
            <p className="mt-3 text-[10px] text-muted-foreground">
              Fora do gráfico: {history.prices.carriedMonths.map(monthLabel).join(", ")}, com a cotação repetida de
              outra competência.
            </p>
          ) : null}
        </section>

        {singleAllocation ? null : (
          <PositionAllocation slot={snapshot} selectedMonth={history.selectedMonth} classTotals={history.classTotals} />
        )}
      </div>

      {history.cdi ? <CdiPanel cdi={history.cdi} /> : null}

      <PositionMonthsTable
        slots={slots}
        selectedMonth={history.selectedMonth}
        quoted={quoted}
        quoteSymbol={history.quoteSymbol}
        ticker={history.ticker}
        scope={scope}
        recorded={recordedByMonth(view.transactions)}
      />

      <PositionTransactions
        transactions={transactions}
        quoted={quoted}
        dollars={dollarBalance}
        editableMonthId={editing && !editing.month.isLocked ? editing.month.id : null}
        firstMonth={firstEver}
        costSource={summary.costSource}
        editableAccountId={history.accountId}
        showAccountLabels={scope === "all"}
        removing={isRemoving}
        onEdit={(entry) =>
          setMovement((value) => ({
            open: true,
            key: value.key + 1,
            edit: {
              id: entry.id,
              kind: entry.kind,
              occurredOn: entry.occurredOn,
              quantity: entry.quantity,
              unitPriceBrl: entry.unitPriceBrl,
              amountBrl: entry.amountBrl,
              note: entry.note,
            },
          }))
        }
        onRemove={(entry) =>
          startRemoving(async () => {
            const result = await removeTransactionAction({ monthId: entry.monthId, transactionId: entry.id });
            notify(result);
          })
        }
      />

      {editing && editPosition && history.maturityDate ? (
        <LiquidationDialog
          open={liquidation.open}
          onOpenChange={(open) => setLiquidation((value) => ({ ...value, open }))}
          target={{
            positionId: editPosition.id,
            assetName: editPosition.assetName,
            totalBrl: editPosition.totalBrl,
            maturityDate: history.maturityDate,
            currency: cashCurrencyOf(editPosition.quoteSymbol),
          }}
          formKey={liquidation.key}
          month={transactionMonthOf(editing.month.id, editing.month.referenceDate, editing.month.label)}
          cashAccounts={editing.cashAccounts}
          onSaved={notify}
        />
      ) : null}

      {editing && editPosition ? (
        <PositionTransactionDialog
          open={movement.open}
          onOpenChange={(open) => setMovement((value) => ({ ...value, open }))}
          target={{
            positionId: editPosition.id,
            assetName: editPosition.assetName,
            quoteSymbol: editPosition.quoteSymbol,
            quantity: editPosition.quantity,
            unitPriceBrl: editPosition.unitPriceBrl,
            totalBrl: editPosition.totalBrl,
          }}
          edit={movement.edit}
          formKey={movement.key}
          month={transactionMonthOf(editing.month.id, editing.month.referenceDate, editing.month.label)}
          onSaved={notify}
        />
      ) : null}

      {editing ? (
        <PositionFormDialog
          open={form.open}
          onOpenChange={(open) => setForm((value) => ({ ...value, open }))}
          target={editPosition ? { mode: "edit", position: editPosition } : null}
          formKey={form.key}
          catalog={editing.catalog}
          month={editing.month}
          occupied={new Set(editing.occupied)}
          onSaved={notify}
        />
      ) : null}
      <EditToast toast={toast} onDismiss={dismissToast} onUndo={undo} undoing={isUndoing} />
    </div>
  );
}

function PositionKpis({
  summary,
  quoted,
  quoteSymbol,
  ticker,
  usdValue,
  selectedLabel,
  firstEver,
}: {
  summary: PositionSummary;
  quoted: boolean;
  quoteSymbol: string | null;
  ticker: string | null;
  usdValue: number | null;
  selectedLabel: string;
  firstEver: string | null;
}) {
  const current = summary.current;
  const step = summary.monthStep;
  const growth = summary.growthPercent;
  const recordedIncome = !quoted && summary.attributionSource !== "estimated" && summary.recorded
    ? summary.incomeBrl ?? 0 : null;
  const sinceLabel = summary.firstMonth ? monthLabel(summary.firstMonth) : null;

  return (
    <section aria-label="Indicadores da posição" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Valor da posição"
        testId="position-value"
        valueText={current ? brlWhole.format(current.valueBrl) : "—"}
        icon={<CoinsIcon aria-hidden="true" size={18} weight="duotone" />}
        value={
          current ? (
            <NumberFlow
              value={current.valueBrl}
              format={{ style: "currency", currency: "BRL", maximumFractionDigits: 0 }}
              locales="pt-BR"
            />
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        }
        detail={
          !current
            ? summary.state === "before" && firstEver
              ? `Entra em ${monthLabel(firstEver)}`
              : `Sem a posição em ${selectedLabel}`
            : quoted && current.priceBrl !== null
              ? `${formatQuantity(current.quantity, quoteSymbol, ticker)} × ${formatPriceBrl(current.priceBrl)}`
              : usdValue !== null
                ? `US$ ${formatUsd(usdValue)}`
                : "Saldo em reais"
        }
      />

      <ChangeKpiCard
        label="Variação no mês"
        testId="position-month-change"
        changeBrl={step?.changeBrl ?? null}
        changePercent={step?.changePercent ?? null}
        detailSuffix={step?.acrossMissing ? `desde ${monthLabel(step.fromMonth)}` : undefined}
        emptyDetail={monthChangeEmpty(summary, selectedLabel)}
      />

      <KpiCard
        label={
          recordedIncome !== null ? "Rendimentos registrados" : sinceLabel
            ? quoted
              ? `Valorização desde ${sinceLabel}`
              : `Variação desde ${sinceLabel}`
            : quoted
              ? "Valorização desde a entrada"
              : "Variação desde a entrada"
        }
        testId="position-growth"
        valueText={recordedIncome !== null ? formatSignedBrl(recordedIncome) : growth === null ? "—" : signedPercent.format(growth / 100)}
        icon={
          growth !== null && growth < 0 ? (
            <TrendDownIcon aria-hidden="true" size={18} weight="duotone" />
          ) : (
            <TrendUpIcon aria-hidden="true" size={18} weight="duotone" />
          )
        }
        tone={recordedIncome !== null ? recordedIncome >= 0 ? "up" : "down" : growth === null ? "neutral" : growth >= 0 ? "up" : "down"}
        value={
          recordedIncome !== null ? <span>{formatSignedBrl(recordedIncome)}</span> : growth === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <NumberFlow
              value={growth / 100}
              format={{ style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero" }}
              locales="pt-BR"
            />
          )
        }
        detail={
          recordedIncome !== null ? "Aportes e retiradas ficam fora deste total" : growth === null
            ? !summary.firstMonth
              ? "A posição ainda não existia"
              : summary.heldMonths === 1 && summary.state === "present"
                ? "Primeira competência da posição"
                : "Sem duas competências seguidas com a posição"
            : quoted && summary.priceGainBrl !== null
              ? `Ganho de preço: ${formatSignedBrl(summary.priceGainBrl)}`
              : summary.heldChangeBrl !== null
                ? `${formatSignedBrl(summary.heldChangeBrl)}, com aportes e rendimentos`
                : "—"
        }
      />

      <KpiCard
        label="Participação na carteira"
        testId="position-share"
        valueText={current ? sharePercent.format(current.share / 100) : "—"}
        icon={<ChartPieSliceIcon aria-hidden="true" size={18} weight="duotone" />}
        value={
          current ? (
            <NumberFlow
              value={current.share / 100}
              format={{ style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }}
              locales="pt-BR"
            />
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        }
        detail={
          summary.shareChange !== null && summary.previousMonth
            ? `${formatPoints(summary.shareChange)} desde ${monthLabel(summary.previousMonth)}`
            : current
              ? `De ${formatBrl(current.portfolioTotalBrl)} na carteira`
              : `Sem a posição em ${selectedLabel}`
        }
      />
    </section>
  );
}

function PositionHighlights({
  summary,
  quoted,
  dollarBalance,
  liquidity,
  maturityDate,
  referenceDay,
}: {
  summary: PositionSummary;
  quoted: boolean;
  dollarBalance: boolean;
  liquidity: string | null;
  maturityDate: string | null;
  referenceDay: string;
}) {
  const current = summary.current;
  const average = summary.averagePriceBrl;
  const aboveAverage = average && current?.priceBrl ? (current.priceBrl / average - 1) * 100 : null;
  const bestMetric = (step: NonNullable<PositionSummary["best"]>) =>
    step.source && step.source !== "estimated"
      ? (step.priceEffectBrl ?? 0) + (step.incomeBrl ?? 0)
      : quoted && step.priceEffectBrl !== null ? step.priceEffectBrl : step.changeBrl;
  const stepDetail = (step: NonNullable<PositionSummary["best"]>) =>
    quoted && step.pricePercent !== null
      ? `${monthLabel(step.month)} · cotação ${formatPercent(step.pricePercent)}`
      : `${monthLabel(step.month)}${step.source && step.source !== "estimated" ? " · rendimento registrado" : step.changePercent !== null ? ` · saldo ${formatPercent(step.changePercent)}` : ""}`;

  return (
    <section className="premium-panel rounded-[24px] p-5 sm:p-6" aria-labelledby="highlights-title">
      <h2 id="highlights-title" className="text-base font-semibold tracking-[-0.025em]">
        Destaques
      </h2>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {summary.attributionSource && summary.attributionSource !== "estimated"
          ? "Nos meses registrados, melhor e pior pelo efeito de preço e rendimentos, sem aportes."
          : quoted ? "Melhor e pior mês pelo efeito de preço." : "Melhor e pior mês pela variação do saldo, com aportes."}
      </p>

      <div className="mt-4 divide-y divide-border/55">
        {quoted ? (
          <HighlightRow
            testId="position-average-price"
            label={
              summary.costSource === "known"
                ? dollarBalance ? "Câmbio médio de compra" : "Preço médio de compra"
                : summary.costSource === "unknown"
                  ? "Custo de compra desconhecido"
                  : dollarBalance ? "Câmbio médio estimado" : "Preço médio estimado"
            }
            value={average !== null ? formatEstimatedPrice(average) : "—"}
            detail={
              summary.costSource === "unknown"
                ? "A base de abertura não informa o custo de aquisição anterior."
                : average === null
                  ? "Sem a posição nesta competência"
                : aboveAverage !== null
                  ? `Cotação ${formatUnsignedPercent(aboveAverage)} ${aboveAverage >= 0 ? "acima" : "abaixo"} ${
                      dollarBalance ? "do câmbio médio" : "do preço médio"
                    }`
                  : undefined
            }
          />
        ) : null}
        <HighlightRow
          testId="position-best-month"
          label="Melhor mês"
          value={summary.best ? formatSignedBrl(bestMetric(summary.best)) : "—"}
          detail={summary.best ? stepDetail(summary.best) : "Poucas competências para comparar"}
          tone={summary.best ? (bestMetric(summary.best) >= 0 ? "up" : "down") : "neutral"}
        />
        <HighlightRow
          testId="position-worst-month"
          label="Pior mês"
          value={summary.worst ? formatSignedBrl(bestMetric(summary.worst)) : "—"}
          detail={summary.worst ? stepDetail(summary.worst) : "Poucas competências para comparar"}
          tone={summary.worst ? (bestMetric(summary.worst) >= 0 ? "up" : "down") : "neutral"}
        />
        <HighlightRow
          testId="position-presence"
          label="Presença"
          value={summary.firstMonth ? `${summary.heldMonths} de ${summary.monthsSinceFirst}` : "—"}
          detail={
            summary.firstMonth
              ? `Competências com a posição desde ${monthLabel(summary.firstMonth)}${
                  summary.segments > 1 ? `, em ${summary.segments} períodos` : ""
                }`
              : "A posição ainda não existia"
          }
        />
        <HighlightRow
          testId="position-liquidity"
          label="Liquidez"
          value={liquidity ?? "—"}
          detail={liquidity ? "Prazo para o dinheiro ficar disponível no resgate" : "Não informada"}
        />
        {!quoted || dollarBalance ? (
          <HighlightRow
            testId="position-maturity"
            label="Vencimento"
            value={maturityDate ? formatDay(parseDay(maturityDate)) : "—"}
            detail={maturityDate ? maturityStatus(maturityDate, referenceDay).title : "Não informado"}
          />
        ) : null}
      </div>
    </section>
  );
}

function BackLink({ href, className }: { href: string; className?: string }) {
  return (
    <Link
      href={href}
      aria-label="Voltar para Posições"
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-md text-[11px] font-semibold tracking-[0.16em] text-primary uppercase outline-none transition-colors hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
    >
      <ArrowLeftIcon
        aria-hidden="true"
        size={12}
        weight="bold"
        className="transition-transform duration-150 group-hover:-translate-x-0.5"
      />
      Posições
    </Link>
  );
}

function monthChangeEmpty(summary: PositionSummary, selectedLabel: string) {
  if (summary.state !== "present") {
    return `Sem a posição em ${selectedLabel}`;
  }

  if (!summary.previousMonth) {
    return "Primeira competência do histórico";
  }

  if (!summary.previousPresent) {
    return `Entrou em ${selectedLabel}; sem a posição em ${monthLabel(summary.previousMonth)}`;
  }

  return "Sem comparação";
}

function firstPresent(slots: HistorySlot[]) {
  return (slots.find((slot) => slot.kind === "present") as PresentSlot | undefined) ?? null;
}

function lastPresentUpTo(slots: HistorySlot[], month: string) {
  const candidates = slots.filter((slot): slot is PresentSlot => slot.kind === "present" && slot.month <= month);
  return candidates.at(-1) ?? null;
}

function allAccountLabels(history: PositionHistoryView) {
  return [history.institutionName, ...history.otherAccounts.map((other) => other.label)];
}

function formatUnsignedPercent(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 2 }).format(Math.abs(value) / 100);
}

function parseDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
