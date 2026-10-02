"use client";

import NumberFlow from "@number-flow/react";
import {
  ArrowLeftIcon,
  CalendarBlankIcon,
  ChartPieSliceIcon,
  CoinsIcon,
  InfoIcon,
  MagnifyingGlassIcon,
  TrendDownIcon,
  TrendUpIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { parseAsStringLiteral, useQueryState } from "nuqs";

import { cn } from "@/lib/utils";
import type { PositionHistoryView } from "@/modules/portfolio/application/get-position-history";
import type { HistorySlot, PositionSummary, PresentSlot } from "@/modules/portfolio/domain/position-history";
import { categoryColor } from "@/modules/portfolio/presentation/category-colors";
import {
  formatBrl,
  formatMonth,
  formatPercent,
  formatPriceBrl,
} from "@/modules/portfolio/presentation/portfolio-format";
import { NO_STRATEGY } from "@/modules/portfolio/presentation/position-filters";
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
import { monthFromKey } from "@/modules/portfolio/domain/position-history";
import { AssetPriceChart } from "@/modules/portfolio/ui/asset-price-chart";
import { BalanceChangeChart } from "@/modules/portfolio/ui/balance-change-chart";
import { ChangeKpiCard, KpiCard } from "@/modules/portfolio/ui/kpi-card";
import { MaturityBadge } from "@/modules/portfolio/ui/maturity-badge";
import { MaturityEditor } from "@/modules/portfolio/ui/maturity-editor";
import { HighlightRow, PositionAttribution } from "@/modules/portfolio/ui/position-attribution";
import { PositionAllocation } from "@/modules/portfolio/ui/position-allocation";
import { PositionEvolutionChart } from "@/modules/portfolio/ui/position-evolution-chart";
import { PositionMonthsTable } from "@/modules/portfolio/ui/position-months-table";

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

export function PositionDetail({ history }: { history: PositionHistoryView | null }) {
  const searchParams = useSearchParams();
  const [scopeParam, setScopeParam] = useQueryState("contas", parseAsStringLiteral(SCOPES));
  const backHref = positionsTableHref(searchParams);

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
  const quoted = Boolean(history.quoteSymbol);
  const dollarBalance = history.quoteSymbol === "USD";
  const current = summary.current;
  const snapshot = current ?? lastPresentUpTo(slots, history.selectedMonth) ?? firstPresent(slots);
  const selectedLabel = monthLabel(history.selectedMonth);
  const firstEver = firstPresent(slots)?.month ?? null;
  const classes = snapshot ? [...new Set(snapshot.allocations.map((slice) => slice.assetClass))] : [];
  const strategy = snapshot ? (snapshot.strategy ?? NO_STRATEGY) : null;
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
                : `${history.institutionName} · ${history.accountName}`}
            </span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="position-chips">
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
          <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-border bg-card/70 px-3.5 py-2.5 text-xs text-muted-foreground">
            <CalendarBlankIcon aria-hidden="true" className="text-primary" size={15} weight="duotone" />
            <span>{formatMonth(monthFromKey(history.selectedMonth))}</span>
            {history.monthStatus === "DRAFT" ? (
              <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[9px] font-semibold tracking-[0.08em] text-warning-foreground uppercase">
                Rascunho
              </span>
            ) : null}
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {current
              ? `${formatBrl(current.valueBrl)}${usdValue !== null ? ` · US$ ${formatUsd(usdValue)}` : ""}`
              : `Sem a posição em ${selectedLabel}`}
          </p>
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

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
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
          assetId={history.assetId}
          maturityDate={history.maturityDate}
          referenceDay={history.referenceDay}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
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
          <div className="mt-5">
            {history.prices && history.quoteSymbol ? (
              <AssetPriceChart
                prices={history.prices}
                symbol={history.quoteSymbol}
                selectedMonth={history.selectedMonth}
                averagePriceBrl={summary.averagePriceBrl}
                averageLabel={dollarBalance ? "Câmbio médio estimado" : "Preço médio estimado"}
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

        <PositionAllocation slot={snapshot} selectedMonth={history.selectedMonth} classTotals={history.classTotals} />
      </div>

      <PositionMonthsTable
        slots={slots}
        selectedMonth={history.selectedMonth}
        quoted={quoted}
        quoteSymbol={history.quoteSymbol}
        ticker={history.ticker}
        scope={scope}
      />
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
          sinceLabel
            ? quoted
              ? `Valorização desde ${sinceLabel}`
              : `Variação desde ${sinceLabel}`
            : quoted
              ? "Valorização desde a entrada"
              : "Variação desde a entrada"
        }
        testId="position-growth"
        valueText={growth === null ? "—" : signedPercent.format(growth / 100)}
        icon={
          growth !== null && growth < 0 ? (
            <TrendDownIcon aria-hidden="true" size={18} weight="duotone" />
          ) : (
            <TrendUpIcon aria-hidden="true" size={18} weight="duotone" />
          )
        }
        tone={growth === null ? "neutral" : growth >= 0 ? "up" : "down"}
        value={
          growth === null ? (
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
          growth === null
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
  assetId,
  maturityDate,
  referenceDay,
}: {
  summary: PositionSummary;
  quoted: boolean;
  dollarBalance: boolean;
  assetId: string;
  maturityDate: string | null;
  referenceDay: string;
}) {
  const current = summary.current;
  const average = summary.averagePriceBrl;
  const aboveAverage = average && current?.priceBrl ? (current.priceBrl / average - 1) * 100 : null;
  const bestMetric = (step: NonNullable<PositionSummary["best"]>) =>
    quoted && step.priceEffectBrl !== null ? step.priceEffectBrl : step.changeBrl;
  const stepDetail = (step: NonNullable<PositionSummary["best"]>) =>
    quoted && step.pricePercent !== null
      ? `${monthLabel(step.month)} · cotação ${formatPercent(step.pricePercent)}`
      : `${monthLabel(step.month)}${step.changePercent !== null ? ` · saldo ${formatPercent(step.changePercent)}` : ""}`;

  return (
    <section className="premium-panel rounded-[24px] p-5 sm:p-6" aria-labelledby="highlights-title">
      <h2 id="highlights-title" className="text-base font-semibold tracking-[-0.025em]">
        Destaques
      </h2>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {quoted ? "Melhor e pior mês pelo efeito de preço." : "Melhor e pior mês pela variação do saldo, com aportes."}
      </p>

      <div className="mt-4 divide-y divide-border/55">
        {quoted ? (
          <HighlightRow
            testId="position-average-price"
            label={dollarBalance ? "Câmbio médio estimado" : "Preço médio estimado"}
            value={average !== null ? formatEstimatedPrice(average) : "—"}
            detail={
              average === null
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
        {!quoted ? (
          <MaturityEditor assetId={assetId} maturityDate={maturityDate} referenceDay={referenceDay} />
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
  return [`${history.institutionName} · ${history.accountName}`, ...history.otherAccounts.map((other) => other.label)];
}

function formatUnsignedPercent(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 2 }).format(Math.abs(value) / 100);
}
