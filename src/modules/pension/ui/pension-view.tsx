"use client";

import { ArrowSquareOutIcon, PiggyBankIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { parseAsInteger, useQueryState } from "nuqs";
import { useSyncExternalStore, type ReactNode } from "react";

import { formatCompetenceLong } from "@/lib/competence";
import { formatCents, type Cents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { payslipName } from "@/modules/income/domain/income";
import type { PensionData } from "@/modules/pension/application/get-pension-summary";
import { pensionYears, PGBL_DEDUCTION_PERCENT, summarizePensionYear, type PensionYear } from "@/modules/pension/domain/pension";

// Previdência (spec 089): o limite de 12% da renda tributável do ano, os
// aportes nas posições de Previdência e os meses trabalhados de Recebimentos.
// Só leitura: os aportes mudam na página da posição; os holerites, no mês de
// Recebimentos. O ano fica na URL (`?ano=`).

export function PensionView({ data, menu }: { data: PensionData; menu?: ReactNode }) {
  const [queryYear, setQueryYear] = useQueryState("ano", parseAsInteger);
  const currentYear = Number(data.currentCompetence.slice(0, 4));
  const years = pensionYears(data.contributions, data.periods, currentYear);
  const year = queryYear !== null && years.includes(queryYear) ? queryYear : currentYear;
  const summary = summarizePensionYear(data.contributions, data.periods, year);
  // Marca a página hidratada para os testes de interface.
  const hydrated = useSyncExternalStore(subscribeNothing, isClient, isServer);
  const over = summary.remainingCents < 0;
  const counted = summary.periods.filter((period) => period.counted).length;
  const progress = summary.limitCents > 0 ? Math.round((summary.contributedCents / summary.limitCents) * 100) : 0;

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
          label="Renda tributável"
          cents={summary.taxableCents}
          detail={`${counted} ${counted === 1 ? "holerite" : "holerites"} no cálculo`}
          testId="pension-kpi-taxable"
        />
        <SummaryCard
          label={`Limite de ${PGBL_DEDUCTION_PERCENT}%`}
          cents={summary.limitCents}
          detail="dedutível no ano"
          testId="pension-kpi-limit"
        />
        <SummaryCard
          label="Aportado"
          cents={summary.contributedCents}
          detail={summary.limitCents > 0 ? `${progress}% do limite` : `${summary.contributions.length} aportes`}
          testId="pension-kpi-contributed"
          tone="up"
        >
          {summary.limitCents > 0 ? (
            <span
              role="meter"
              aria-label="Aportado em relação ao limite"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(progress, 100)}
              className="mt-3 block h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
            >
              <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(progress, 100)}%` }} />
            </span>
          ) : null}
        </SummaryCard>
        <SummaryCard
          label={over ? "Acima do limite" : summary.remainingCents === 0 && summary.limitCents > 0 ? "Limite atingido" : "Falta aportar"}
          cents={Math.abs(summary.remainingCents)}
          detail={over ? "além do dedutível" : summary.remainingCents > 0 ? "para chegar ao limite" : "nada a aportar"}
          testId="pension-kpi-remaining"
          tone={over ? undefined : "up"}
          emphasis
        />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6">
        <Panel title="Aportes" testId="pension-contributions">
          <Contributions summary={summary} />
        </Panel>
        <Panel title="Meses trabalhados" testId="pension-periods">
          <Periods summary={summary} />
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, testId, children }: { title: string; testId: string; children: ReactNode }) {
  return (
    <section aria-label={title} data-testid={testId} className="premium-panel min-w-0 rounded-[24px] p-3 sm:p-5">
      <h2 className="px-1 pb-3 text-sm font-semibold tracking-[-0.01em] sm:px-2">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-3 py-10 text-center text-sm text-muted-foreground">
      <PiggyBankIcon aria-hidden="true" size={22} weight="duotone" className="text-primary" />
      {children}
    </div>
  );
}

const date = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;

function Contributions({ summary }: { summary: PensionYear }) {
  if (summary.contributions.length === 0) {
    return <Empty>Nenhum aporte em {summary.year}.</Empty>;
  }

  return (
    <>
      <ul className="divide-y divide-border/60">
        {summary.contributions.map((contribution) => (
          <li key={contribution.id}>
            <Link
              href={`/posicoes/${contribution.accountId}/${contribution.assetId}?mes=${contribution.occurredOn.slice(0, 7)}`}
              data-testid="pension-contribution"
              className="group flex items-center gap-3 rounded-xl px-1 py-2.5 outline-none transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-ring/50 sm:px-2"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-[10px] font-semibold text-primary">
                {contribution.number}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-foreground">{contribution.assetName}</span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                  <span className="font-mono">{date(contribution.occurredOn)}</span> · {contribution.institutionName}
                  {contribution.kind === "OPENING" ? " · saldo inicial" : ""}
                </span>
              </span>
              <span className="shrink-0 font-mono text-xs text-primary">{formatCents(contribution.amountCents)}</span>
              <ArrowSquareOutIcon aria-hidden="true" size={13} className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          </li>
        ))}
      </ul>
      <TotalRow label="Total" cents={summary.contributedCents} testId="pension-total-contributed" />
    </>
  );
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

  return (
    <>
      <table className="hidden w-full text-right text-xs tabular-nums xl:table" data-testid="pension-periods-table">
        <thead>
          <tr className="text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
            <th className="px-2 py-2 text-left font-semibold">Nome</th>
            <th className="px-2 py-2 text-left font-semibold">Início</th>
            <th className="px-2 py-2 text-left font-semibold">Fim</th>
            <th className="px-2 py-2 text-left font-semibold">Empresa</th>
            <th className="px-2 py-2 font-semibold">Dias</th>
            <th className="px-2 py-2 text-center font-semibold">Proporcional</th>
            <th className="px-2 py-2 font-semibold">Bruto</th>
            <th className="px-2 py-2 font-semibold">Por dia</th>
            <th className="px-2 py-2 font-semibold">Renda tributável</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {summary.periods.map((period) => (
            <tr
              key={period.id}
              data-testid="pension-period"
              data-counted={period.counted}
              className={cn("border-t border-border/60", !period.counted && "text-muted-foreground")}
            >
              <td className="px-2 py-2.5 text-left font-sans">
                <Link
                  href={`/recebimentos?mes=${period.month}`}
                  aria-label={`Abrir ${formatCompetenceLong(period.month)} em Recebimentos`}
                  className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <KindBadge period={period} />
                </Link>
              </td>
              <td className="px-2 py-2.5 text-left">{date(period.startsOn)}</td>
              <td className="px-2 py-2.5 text-left">{date(period.endsOn)}</td>
              <td className="max-w-[160px] truncate px-2 py-2.5 text-left font-sans">{period.employer}</td>
              <td className="px-2 py-2.5">{period.days}</td>
              <td className="px-2 py-2.5 text-center font-sans">
                {period.prorated ? (
                  <span className="inline-flex rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">Sim</span>
                ) : (
                  <span className="text-muted-foreground">Não</span>
                )}
              </td>
              <td className="px-2 py-2.5">{formatCents(period.grossCents)}</td>
              <td className="px-2 py-2.5 text-muted-foreground">{formatCents(period.dailyRateCents)}</td>
              <td className="px-2 py-2.5 text-primary">
                {period.counted ? formatCents(period.taxableCents) : <span className="font-sans text-[11px] text-muted-foreground">fora do cálculo</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-border/60 xl:hidden" data-testid="pension-periods-list">
        {summary.periods.map((period) => (
          <li key={period.id}>
            <Link
              href={`/recebimentos?mes=${period.month}`}
              data-testid="pension-period-card"
              className={cn(
                "flex items-center gap-3 rounded-xl px-1 py-2.5 outline-none transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-ring/50 sm:px-2",
                !period.counted && "text-muted-foreground",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <KindBadge period={period} />
                  <span className="truncate text-xs font-medium text-foreground">{period.employer}</span>
                </span>
                <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                  <span className="font-mono">
                    {date(period.startsOn)} a {date(period.endsOn)}
                  </span>{" "}
                  · {period.days} {period.days === 1 ? "dia" : "dias"}
                  {period.prorated ? " · proporcional" : ""}
                </span>
              </span>
              <span className="shrink-0 text-right font-mono text-xs text-primary">
                {period.counted ? formatCents(period.taxableCents) : <span className="font-sans text-[11px] text-muted-foreground">fora do cálculo</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <TotalRow label="Renda tributável" cents={summary.taxableCents} testId="pension-total-taxable" />
    </>
  );
}

function TotalRow({ label, cents, testId }: { label: string; cents: Cents; testId: string }) {
  return (
    <p className="mt-1 flex items-center justify-between gap-3 border-t border-border px-1 pt-3 sm:px-2">
      <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{label}</span>
      <span className="font-mono text-sm text-primary" data-testid={testId} data-cents={cents}>
        {formatCents(cents)}
      </span>
    </p>
  );
}

/** Nome da linha do holerite em selo: verde quando entra no cálculo. */
function KindBadge({ period }: { period: PensionYear["periods"][number] }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-0.5 font-sans text-[10px] font-semibold tracking-[0.04em] whitespace-nowrap uppercase",
        period.counted ? "bg-primary/10 text-primary" : "bg-white/[0.05] text-muted-foreground",
      )}
    >
      {payslipName(period)}
    </span>
  );
}

function SummaryCard({
  label,
  cents,
  detail,
  tone,
  emphasis = false,
  testId,
  children,
}: {
  label: string;
  cents: Cents;
  detail: string;
  /** Verde da marca no que foi aportado e no que ainda cabe; o resto, neutro. */
  tone?: "up";
  emphasis?: boolean;
  testId: string;
  children?: ReactNode;
}) {
  const color = tone === "up" && cents > 0 ? "text-primary" : "text-foreground";

  return (
    <article className={cn("metric-card rounded-2xl p-4 sm:p-5", emphasis && "border-primary/25")}>
      <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p
        data-testid={testId}
        data-cents={cents}
        className={cn("mt-4 font-mono text-xl font-medium tracking-[-0.05em] min-[360px]:text-[15px] min-[400px]:text-base sm:text-xl xl:text-2xl xl:tracking-[-0.04em]", color)}
      >
        {formatCents(cents)}
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground">{detail}</p>
      {children}
    </article>
  );
}

const subscribeNothing = () => () => {};
const isClient = () => true;
const isServer = () => false;

const filterBadgeClass =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 sm:h-8";
const activeFilterBadgeClass = "border-primary/30 bg-primary/[0.08] text-primary";
const inactiveFilterBadgeClass = "border-border bg-card/60 text-muted-foreground hover:text-foreground";
