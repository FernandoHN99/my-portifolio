"use client";

import {
  ArrowSquareOutIcon,
  BriefcaseIcon,
  PercentIcon,
  PiggyBankIcon,
  ShieldCheckIcon,
  TargetIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsInteger, useQueryState } from "nuqs";
import { useSyncExternalStore, type ReactNode } from "react";

import { RateBar, SummaryCard, TONES } from "@/components/product/finance-parts";
import { formatCompetenceLong } from "@/lib/competence";
import { formatCents, type Cents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { payslipName } from "@/modules/income/domain/income";
import type { PensionData } from "@/modules/pension/application/get-pension-summary";
import { pensionYears, PGBL_DEDUCTION_PERCENT, summarizePensionYear, type PensionYear } from "@/modules/pension/domain/pension";

// Previdência (spec 089): o limite de 12% da renda tributável do ano, os
// aportes nas posições de Previdência e os meses trabalhados de Recebimentos.
// Só leitura: os aportes mudam na página da posição; os holerites, no mês de
// Recebimentos. O ano fica na URL (`?ano=`). Visual da revisão de 2026-10-08,
// na linguagem de Recebimentos: menta no que conta a favor do limite e violeta
// no que passa dele (guia de estilos).

type Period = PensionYear["periods"][number];
type Contribution = PensionYear["contributions"][number];

export function PensionView({ data, menu }: { data: PensionData; menu?: ReactNode }) {
  const [queryYear, setQueryYear] = useQueryState("ano", parseAsInteger);
  const currentYear = Number(data.currentCompetence.slice(0, 4));
  const years = pensionYears(data.contributions, data.periods, currentYear);
  const year = queryYear !== null && years.includes(queryYear) ? queryYear : currentYear;
  const summary = summarizePensionYear(data.contributions, data.periods, year);
  // Marca a página hidratada para os testes de interface.
  const hydrated = useSyncExternalStore(subscribeNothing, isClient, isServer);
  const hasLimit = summary.limitCents > 0;
  const over = hasLimit && summary.remainingCents < 0;
  const reached = hasLimit && summary.remainingCents === 0;
  const counted = summary.periods.filter((period) => period.counted).length;

  return (
    <div
      data-testid="pension-view"
      data-hydrated={hydrated || undefined}
      className="relative mx-auto w-full max-w-[1472px] px-5 py-8 sm:px-7 sm:py-10 xl:px-12 xl:py-12"
    >
      <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[460px] w-[460px]" />

      <header className="border-b border-border/70 pb-8">
        <div className="flex items-center gap-3">
          {menu}
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">Finanças</p>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-[2.65rem]">Previdência</h1>
      </header>

      <fieldset className="mt-6 min-w-0" data-testid="pension-year-badges">
        <legend className="mb-2 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Ano-base</legend>
        <div className="flex flex-wrap gap-2">
          {years.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === year}
              onClick={() => void setQueryYear(option === currentYear ? null : option)}
              className={cn(filterBadgeClass, "font-mono", option === year ? activeFilterBadgeClass : inactiveFilterBadgeClass)}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>

      <section aria-label="Resumo do ano" className="mt-6 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          tone="neutral"
          icon={BriefcaseIcon}
          label="Renda tributável"
          cents={summary.taxableCents}
          detail={`${counted} ${counted === 1 ? "holerite" : "holerites"} no cálculo`}
          testId="pension-kpi-taxable"
        />
        <SummaryCard
          tone="neutral"
          icon={PercentIcon}
          label={`Limite de ${PGBL_DEDUCTION_PERCENT}%`}
          cents={summary.limitCents}
          detail="dedutível no ano"
          testId="pension-kpi-limit"
        />
        <SummaryCard
          tone="saved"
          icon={PiggyBankIcon}
          label="Aportado"
          cents={summary.contributedCents}
          detail={
            summary.usagePercent !== null
              ? `${summary.usagePercent}% do limite`
              : `${summary.contributions.length} ${summary.contributions.length === 1 ? "aporte" : "aportes"}`
          }
          valueClassName={summary.contributedCents > 0 ? "text-primary" : "text-foreground"}
          testId="pension-kpi-contributed"
        />
        <SummaryCard
          tone={over ? "spent" : "saved"}
          icon={reached ? ShieldCheckIcon : TargetIcon}
          label={over ? "Acima do limite" : reached ? "Limite atingido" : "Falta aportar"}
          cents={hasLimit ? Math.abs(summary.remainingCents) : 0}
          detail={
            !hasLimit
              ? "sem holerites no ano"
              : over
                ? "além do dedutível"
                : reached
                  ? "nada a aportar"
                  : "para chegar ao limite"
          }
          valueClassName={over ? "text-chart-spent" : hasLimit ? "text-primary" : "text-foreground"}
          emphasis
          testId="pension-kpi-remaining"
        />
      </section>

      <LimitUsage summary={summary} />

      <div className="mt-6 grid grid-cols-1 gap-6">
        <Panel title="Aportes" count={summary.contributions.length} testId="pension-contributions">
          <Contributions summary={summary} />
        </Panel>
        <Panel title="Meses trabalhados" count={summary.periods.length} testId="pension-periods">
          <Periods summary={summary} />
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, count, testId, children }: { title: string; count: number; testId: string; children: ReactNode }) {
  return (
    <section aria-label={title} data-testid={testId} className="premium-panel min-w-0 rounded-[24px] p-4 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2.5 px-1 text-sm font-semibold tracking-[-0.01em]">
        {title}
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">{count}</span>
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-3 py-10 text-center text-sm text-muted-foreground">
      <span className={cn("grid size-10 place-items-center rounded-xl", TONES.saved.chip)}>
        <PiggyBankIcon aria-hidden="true" size={20} weight="duotone" />
      </span>
      {children}
    </div>
  );
}

/** dd/mm/aa, como a planilha do usuário. */
const date = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(2, 4)}`;

/**
 * O uso do limite numa barra só: cada aporte é um trecho menta, na ordem em que
 * entrou, e o que passa do limite é violeta. A escala vai até o maior entre o
 * limite e o aportado, então o excesso aparece depois da marca do limite.
 */
function LimitUsage({ summary }: { summary: PensionYear }) {
  const { limitCents, contributedCents, usagePercent, segments } = summary;

  if (limitCents <= 0 || usagePercent === null) {
    return (
      <section aria-label="Uso do limite" data-testid="pension-limit" className="premium-panel mt-6 rounded-[24px] p-4 sm:p-6">
        <h2 className="mb-1 px-1 text-sm font-semibold tracking-[-0.01em]">Uso do limite</h2>
        <Empty>
          Nenhum holerite em {summary.year}.{" "}
          <Link href="/recebimentos" className="text-primary underline-offset-4 hover:underline">
            Lançar em Recebimentos
          </Link>
        </Empty>
      </section>
    );
  }

  const over = contributedCents > limitCents;
  const scale = Math.max(limitCents, contributedCents);
  const percent = (cents: Cents) => `${(cents / scale) * 100}%`;
  const limitAt = (limitCents / scale) * 100;
  const free = Math.max(limitCents - contributedCents, 0);

  return (
    <section aria-label="Uso do limite" data-testid="pension-limit" className="premium-panel relative mt-6 overflow-hidden rounded-[24px] p-5 sm:p-6">
      <span
        aria-hidden="true"
        className={cn("pointer-events-none absolute -top-16 -right-10 size-48 rounded-full blur-3xl", over ? TONES.spent.glow : TONES.saved.glow)}
      />
      <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <h2 className="px-1 text-sm font-semibold tracking-[-0.01em]">Uso do limite</h2>
        <p className="flex items-baseline gap-2 font-mono" data-testid="pension-usage" data-percent={usagePercent}>
          <span className={cn("text-3xl font-medium tracking-[-0.05em]", over ? "text-chart-spent" : "text-primary")}>{usagePercent}%</span>
          <span className="text-xs text-muted-foreground">de {formatCents(limitCents)}</span>
        </p>
      </div>

      <div
        role="meter"
        aria-label="Aportado em relação ao limite"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(usagePercent, 100)}
        aria-valuetext={`${usagePercent}% do limite`}
        className="relative mt-6 h-4 rounded-full bg-white/[0.06]"
      >
        <span className="absolute inset-0 flex overflow-hidden rounded-full">
          {segments.map((segment, index) => {
            const contribution = summary.contributions.find((entry) => entry.id === segment.id);

            return (
              <span
                key={`${segment.id}-${segment.over ? "over" : "in"}`}
                title={contribution ? `${date(contribution.occurredOn)} · ${formatCents(contribution.amountCents)}` : undefined}
                className={cn(
                  "h-full border-r border-background/70 last:border-r-0",
                  segment.over ? "bg-chart-spent" : index % 2 === 0 ? "bg-chart-saved" : "bg-chart-saved/75",
                )}
                style={{ width: percent(segment.endCents - segment.startCents) }}
              />
            );
          })}
        </span>
        {over ? (
          <span aria-hidden="true" className="absolute -top-1.5 -bottom-1.5 w-0.5 rounded-full bg-foreground/70" style={{ left: `${limitAt}%` }} />
        ) : null}
      </div>

      <div className="relative mt-2.5 flex justify-between font-mono text-[10px] text-muted-foreground" aria-hidden="true">
        <span>R$ 0</span>
        {over ? (
          <span className="absolute -translate-x-full pr-1.5 whitespace-nowrap text-foreground/80" style={{ left: `${limitAt}%` }}>
            limite {formatCents(limitCents)}
          </span>
        ) : null}
        {over ? null : <span>limite {formatCents(limitCents)}</span>}
      </div>

      <ul aria-label="Legenda" className="relative mt-5 flex flex-wrap items-center gap-2">
        <li className="inline-flex items-center gap-2 rounded-full border border-chart-saved/25 bg-chart-saved/[0.08] px-2.5 py-1 text-[11px] font-medium text-foreground/90">
          <span aria-hidden="true" className="size-2 rounded-full bg-chart-saved" />
          Aportado <span className="font-mono text-muted-foreground">{formatCents(Math.min(contributedCents, limitCents))}</span>
        </li>
        {over ? (
          <li className="inline-flex items-center gap-2 rounded-full border border-chart-spent/25 bg-chart-spent/[0.08] px-2.5 py-1 text-[11px] font-medium text-foreground/90">
            <span aria-hidden="true" className="size-2 rounded-full bg-chart-spent" />
            Acima do limite <span className="font-mono text-muted-foreground">{formatCents(contributedCents - limitCents)}</span>
          </li>
        ) : (
          <li className="inline-flex items-center gap-2 rounded-full border border-border bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-foreground/90">
            <span aria-hidden="true" className="size-2 rounded-full border border-muted-foreground/60" />
            Livre <span className="font-mono text-muted-foreground">{formatCents(free)}</span>
          </li>
        )}
      </ul>
    </section>
  );
}

const th = "px-3 pb-2.5 text-[9px] font-semibold tracking-[0.1em] whitespace-nowrap uppercase";
const td = "border-t border-border/50 px-3 py-3 whitespace-nowrap group-first:border-t-0";

function contributionHref(contribution: Contribution) {
  return `/posicoes/${contribution.accountId}/${contribution.assetId}?mes=${contribution.occurredOn.slice(0, 7)}`;
}

/** Saldo inicial (a primeira parcela, spec 071) ou aporte, em selo. */
function ContributionKind({ contribution }: { contribution: Contribution }) {
  const opening = contribution.kind === "OPENING";

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 font-sans text-[10px] font-semibold tracking-[0.04em] whitespace-nowrap uppercase",
        opening ? "bg-accent text-accent-foreground" : TONES.saved.chip,
      )}
    >
      {opening ? "Saldo inicial" : "Aporte"}
    </span>
  );
}

function NumberChip({ number }: { number: number }) {
  return (
    <span className={cn("grid size-6 shrink-0 place-items-center rounded-full font-mono text-[10px] font-semibold", TONES.saved.chip)}>{number}</span>
  );
}

function Contributions({ summary }: { summary: PensionYear }) {
  const router = useRouter();

  if (summary.contributions.length === 0) {
    return <Empty>Nenhum aporte em {summary.year}.</Empty>;
  }

  return (
    <>
      <div className="hidden xl:block">
        <table className="w-full border-separate border-spacing-0 text-right text-xs tabular-nums" data-testid="pension-contributions-table">
          <thead>
            <tr className="text-muted-foreground/80">
              <th className={cn(th, "w-10 text-left")}>Nº</th>
              <th className={cn(th, "text-left")}>Data</th>
              <th className={cn(th, "w-full text-left")}>Plano</th>
              <th className={cn(th, "text-left")}>Tipo</th>
              <th className={cn(th, TONES.saved.text)}>Valor</th>
              <th className={th}>Acumulado</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {summary.contributions.map((contribution) => (
              <tr
                key={contribution.id}
                data-testid="pension-contribution"
                onClick={() => router.push(contributionHref(contribution))}
                className="group cursor-pointer transition-colors hover:bg-white/[0.035]"
              >
                <td className={cn(td, "rounded-l-xl text-left")}>
                  <NumberChip number={contribution.number} />
                </td>
                <td className={cn(td, "text-left text-foreground/85")}>{date(contribution.occurredOn)}</td>
                <td className={cn(td, "text-left font-sans")}>
                  <Link
                    href={contributionHref(contribution)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Abrir ${contribution.assetName} em ${formatCompetenceLong(contribution.occurredOn.slice(0, 7))}`}
                    className="group/link inline-flex items-center gap-1.5 rounded text-[13px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    {contribution.assetName}
                    <ArrowSquareOutIcon aria-hidden="true" size={12} className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" />
                  </Link>
                  <span className="ml-2 text-[11px] text-muted-foreground">{contribution.institutionName}</span>
                </td>
                <td className={cn(td, "text-left")}>
                  <ContributionKind contribution={contribution} />
                </td>
                <td className={cn(td, TONES.saved.tint, "font-semibold text-primary")}>{formatCents(contribution.amountCents)}</td>
                <td className={cn(td, "rounded-r-xl")}>
                  <span className="flex items-center justify-end gap-2.5">
                    {contribution.usagePercent !== null ? (
                      <>
                        <span className="w-9 text-[10px] text-muted-foreground">{contribution.usagePercent}%</span>
                        <RateBar rate={contribution.usagePercent} label="Acumulado em relação ao limite" className="h-1 w-14" />
                      </>
                    ) : null}
                    <span className="min-w-[6.5rem] text-foreground/85">{formatCents(contribution.cumulativeCents)}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="font-mono">
            <tr className="bg-white/[0.03]">
              <td colSpan={4} className="rounded-l-xl border-t-2 border-border px-3 py-3 text-left font-sans text-[10px] font-semibold tracking-[0.12em] text-foreground uppercase">
                Total
              </td>
              <td
                className={cn("border-t-2 border-border px-3 py-3 font-semibold text-primary", TONES.saved.tint)}
                data-testid="pension-total-contributed"
                data-cents={summary.contributedCents}
              >
                {formatCents(summary.contributedCents)}
              </td>
              <td className="rounded-r-xl border-t-2 border-border px-3 py-3 text-[10px] text-muted-foreground">
                {summary.usagePercent !== null ? `${summary.usagePercent}% do limite` : ""}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ul className="space-y-2.5 xl:hidden" data-testid="pension-contributions-list">
        {summary.contributions.map((contribution) => (
          <li key={contribution.id}>
            <Link
              href={contributionHref(contribution)}
              data-testid="pension-contribution"
              aria-label={`Abrir ${contribution.assetName} em ${formatCompetenceLong(contribution.occurredOn.slice(0, 7))}`}
              className="group block rounded-2xl border border-border/70 bg-card/50 p-3.5 outline-none transition-colors hover:border-primary/25 hover:bg-white/[0.035] focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <span className="flex items-center gap-3">
                <NumberChip number={contribution.number} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] leading-snug font-medium break-words text-foreground">{contribution.assetName}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                    <span className="font-mono">{date(contribution.occurredOn)}</span>
                    <span>{contribution.institutionName}</span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-xs font-semibold text-primary">{formatCents(contribution.amountCents)}</span>
                  <span className="mt-1 block">
                    <ContributionKind contribution={contribution} />
                  </span>
                </span>
              </span>
              {contribution.usagePercent !== null ? (
                <span className="mt-3 flex items-center gap-2.5 text-[10px] text-muted-foreground">
                  <RateBar rate={contribution.usagePercent} label="Acumulado em relação ao limite" className="h-1 flex-1" />
                  <span className="w-28 text-right">
                    {contribution.usagePercent}% · {formatCents(contribution.cumulativeCents)}
                  </span>
                </span>
              ) : null}
            </Link>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-white/[0.03] px-4 py-3">
          <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Total</span>
          <span className="font-mono text-sm font-semibold text-primary" data-testid="pension-total-contributed-mobile" data-cents={summary.contributedCents}>
            {formatCents(summary.contributedCents)}
          </span>
        </li>
      </ul>
    </>
  );
}

/** Nome da linha do holerite em selo: menta quando entra no cálculo, neutro quando não (13º, PLR). */
function KindBadge({ period }: { period: Period }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-0.5 font-sans text-[10px] font-semibold tracking-[0.04em] whitespace-nowrap uppercase",
        period.counted ? TONES.saved.chip : TONES.neutral.chip,
      )}
    >
      {payslipName(period)}
    </span>
  );
}

function ProratedBadge() {
  return <span className="inline-flex rounded-full bg-accent px-2 py-0.5 font-sans text-[10px] font-semibold text-accent-foreground">Sim</span>;
}

function Periods({ summary }: { summary: PensionYear }) {
  if (summary.periods.length === 0) {
    return (
      <Empty>
        Nenhum holerite em {summary.year}.{" "}
        <Link href="/recebimentos" className="text-primary underline-offset-4 hover:underline">
          Lançar em Recebimentos
        </Link>
      </Empty>
    );
  }

  const href = (period: Period) => `/recebimentos?mes=${period.month}`;

  return (
    <>
      <div className="hidden xl:block">
        <table className="w-full border-separate border-spacing-0 text-right text-xs tabular-nums" data-testid="pension-periods-table">
          <thead>
            <tr className="text-muted-foreground/80">
              <th className={cn(th, "text-left")}>Nome</th>
              <th className={cn(th, "text-left")}>Período</th>
              <th className={cn(th, "w-full text-left")}>Empresa</th>
              <th className={th}>Dias</th>
              <th className={cn(th, "text-center")}>Proporcional</th>
              <th className={th}>Bruto</th>
              <th className={th}>Por dia</th>
              <th className={cn(th, TONES.saved.text)}>Renda tributável</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {summary.periods.map((period) => (
              <tr
                key={period.id}
                data-testid="pension-period"
                data-counted={period.counted}
                className={cn("group transition-colors hover:bg-white/[0.035]", !period.counted && "text-muted-foreground")}
              >
                <td className={cn(td, "rounded-l-xl text-left font-sans")}>
                  <Link
                    href={href(period)}
                    aria-label={`Abrir ${formatCompetenceLong(period.month)} em Recebimentos`}
                    className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <KindBadge period={period} />
                  </Link>
                </td>
                <td className={cn(td, "text-left whitespace-nowrap", period.counted ? "text-foreground/85" : "text-muted-foreground")}>
                  {date(period.startsOn)} <span className="text-muted-foreground/60">→</span> {date(period.endsOn)}
                </td>
                <td className={cn(td, "max-w-0 truncate text-left font-sans", period.counted && "text-foreground/90")}>{period.employer}</td>
                <td className={td}>{period.days}</td>
                <td className={cn(td, "text-center font-sans")}>
                  {period.prorated ? <ProratedBadge /> : <span className="text-muted-foreground/60">Não</span>}
                </td>
                <td className={cn(td, period.counted && "text-foreground/85")}>{formatCents(period.grossCents)}</td>
                <td className={cn(td, "text-muted-foreground/75")}>{formatCents(period.dailyRateCents)}</td>
                <td className={cn(td, "rounded-r-xl", period.counted && cn(TONES.saved.tint, "font-semibold text-primary"))}>
                  {period.counted ? formatCents(period.taxableCents) : <span className="font-sans text-[11px] font-normal text-muted-foreground">fora do cálculo</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="font-mono">
            <tr className="bg-white/[0.03]">
              <td colSpan={7} className="rounded-l-xl border-t-2 border-border px-3 py-3 text-left font-sans text-[10px] font-semibold tracking-[0.12em] text-foreground uppercase">
                Renda tributável
              </td>
              <td
                className={cn("rounded-r-xl border-t-2 border-border px-3 py-3 font-semibold text-primary", TONES.saved.tint)}
                data-testid="pension-total-taxable"
                data-cents={summary.taxableCents}
              >
                {formatCents(summary.taxableCents)}
              </td>
            </tr>
            <tr>
              <td colSpan={7} className="px-3 py-3 text-left font-sans text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                × {PGBL_DEDUCTION_PERCENT}% = limite do ano
              </td>
              <td className="px-3 py-3 font-semibold text-foreground" data-testid="pension-total-limit" data-cents={summary.limitCents}>
                {formatCents(summary.limitCents)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ul className="space-y-2.5 xl:hidden" data-testid="pension-periods-list">
        {summary.periods.map((period) => (
          <li key={period.id}>
            <Link
              href={href(period)}
              data-testid="pension-period-card"
              aria-label={`Abrir ${formatCompetenceLong(period.month)} em Recebimentos`}
              className={cn(
                "group flex items-center gap-3 rounded-2xl border border-border/70 bg-card/50 p-3.5 outline-none transition-colors hover:border-primary/25 hover:bg-white/[0.035] focus-visible:ring-2 focus-visible:ring-ring/50",
                !period.counted && "text-muted-foreground",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <KindBadge period={period} />
                  <span className={cn("text-xs font-medium break-words", period.counted ? "text-foreground" : "text-muted-foreground")}>{period.employer}</span>
                </span>
                <span className="mt-1.5 block text-[11px] leading-snug text-muted-foreground">
                  <span className="font-mono">
                    {date(period.startsOn)} → {date(period.endsOn)}
                  </span>{" "}
                  · {period.days} {period.days === 1 ? "dia" : "dias"}
                  {period.prorated ? " · proporcional" : ""}
                </span>
              </span>
              <span className="shrink-0 text-right font-mono text-xs">
                {period.counted ? (
                  <span className="font-semibold text-primary">{formatCents(period.taxableCents)}</span>
                ) : (
                  <span className="font-sans text-[11px] text-muted-foreground">fora do cálculo</span>
                )}
              </span>
            </Link>
          </li>
        ))}
        <li className="grid grid-cols-1 gap-1.5 rounded-2xl border border-border bg-white/[0.03] px-4 py-3 min-[360px]:grid-cols-2 min-[360px]:gap-4">
          <span className="flex items-baseline justify-between gap-2 min-[360px]:block">
            <span className="block text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Renda tributável</span>
            <span className="font-mono text-sm font-semibold text-primary min-[360px]:mt-1 min-[360px]:block" data-testid="pension-total-taxable-mobile" data-cents={summary.taxableCents}>
              {formatCents(summary.taxableCents)}
            </span>
          </span>
          <span className="flex items-baseline justify-between gap-2 min-[360px]:block">
            <span className="block text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">× {PGBL_DEDUCTION_PERCENT}% = limite</span>
            <span className="font-mono text-sm font-semibold text-foreground min-[360px]:mt-1 min-[360px]:block">{formatCents(summary.limitCents)}</span>
          </span>
        </li>
      </ul>
    </>
  );
}

const subscribeNothing = () => () => {};
const isClient = () => true;
const isServer = () => false;

const filterBadgeClass =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 sm:h-8";
const activeFilterBadgeClass = "border-primary/30 bg-primary/[0.08] text-primary";
const inactiveFilterBadgeClass = "border-border bg-card/60 text-muted-foreground hover:text-foreground";
