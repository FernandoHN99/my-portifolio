import {
  CalendarBlankIcon,
  FileSearchIcon,
  ScalesIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import type { AllocationGroup, AllocationOverview } from "@/modules/portfolio/application/get-allocation-overview";
import {
  formatBrl,
  formatMonth,
  formatPercent,
  formatSharePercent,
} from "@/modules/portfolio/presentation/portfolio-format";

export function AllocationDashboard({ overview }: { overview: AllocationOverview | null }) {
  if (!overview) {
    return <EmptyAllocation />;
  }

  return (
    <div className="relative mx-auto w-full max-w-[1472px] px-5 py-8 sm:px-7 sm:py-10 xl:px-12 xl:py-12">
      <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[460px] w-[460px]" />

      <header className="flex flex-col gap-6 border-b border-border/70 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">Alocação</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-[2.65rem]">
            Atual contra meta
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Classificação ponderada das posições comparada ao plano de metas vigente.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-border bg-card/70 px-3.5 py-2.5 text-xs text-muted-foreground">
            <CalendarBlankIcon aria-hidden="true" className="text-primary" size={15} weight="duotone" />
            <span>{formatMonth(overview.referenceDate)}</span>
            {overview.monthStatus === "DRAFT" ? (
              <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[9px] font-semibold tracking-[0.08em] text-warning-foreground uppercase">
                Rascunho
              </span>
            ) : null}
          </div>
          <p className="font-mono text-xs text-muted-foreground">{formatBrl(overview.totalBrl)} no total</p>
        </div>
      </header>

      {!overview.hasTargetPlan ? (
        <p className="mt-6 rounded-xl border border-border bg-card/60 px-4 py-3 text-xs text-muted-foreground">
          Nenhum plano de metas ativo foi encontrado. As colunas de meta ficam vazias até que um plano seja
          importado.
        </p>
      ) : null}

      {overview.unclassifiedBrl > 0 ? (
        <p className="mt-4 rounded-xl border border-border bg-card/60 px-4 py-3 text-xs text-muted-foreground">
          {formatBrl(overview.unclassifiedBrl)} ({formatSharePercent(overview.unclassifiedShare)}) da
          competência ainda não têm classificação. Os valores aparecem como &ldquo;Sem classificação&rdquo; na
          classe de ativos.
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {overview.groups.map((group) => (
          <AllocationGroupCard key={group.key} group={group} />
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <Link
          href="/importacao"
          className="group inline-flex items-center gap-2 rounded-lg text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          Revisar achados de classificação
        </Link>
      </div>
    </div>
  );
}

function AllocationGroupCard({ group }: { group: AllocationGroup }) {
  return (
    <section className="premium-panel rounded-[24px] p-5 sm:p-6" aria-labelledby={`group-${group.key}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={`group-${group.key}`} className="text-base font-semibold tracking-[-0.025em]">
            {group.title}
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">{group.description}</p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {group.rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem dados para esta competência.</p>
        ) : (
          group.rows.map((row) => (
            <div key={row.key}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-foreground/85">{row.label}</span>
                <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <span>{formatSharePercent(row.currentShare)}</span>
                  {row.targetShare !== null ? (
                    <>
                      <span className="text-muted-foreground/50">/ {formatSharePercent(row.targetShare)}</span>
                      <span
                        className={
                          (row.differenceShare ?? 0) >= 0
                            ? "text-primary"
                            : "text-destructive"
                        }
                      >
                        {formatPercent(row.differenceShare ?? 0)}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground/50">sem meta</span>
                  )}
                </div>
              </div>
              <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.045]">
                <div
                  className="h-full rounded-full bg-primary/75"
                  style={{ width: `${Math.min(Math.max(row.currentShare, 0), 100)}%` }}
                />
                {row.targetShare !== null ? (
                  <div
                    className="absolute inset-y-0 w-px bg-foreground/70"
                    style={{ left: `${Math.min(Math.max(row.targetShare, 0), 100)}%` }}
                  />
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function EmptyAllocation() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-64px)] max-w-xl flex-col items-center justify-center px-5 py-16 text-center lg:min-h-[100dvh]">
      <span className="grid size-12 place-items-center rounded-2xl border border-border bg-card text-primary">
        <ScalesIcon aria-hidden="true" size={22} weight="duotone" />
      </span>
      <h1 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">Nenhuma classificação disponível</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Importe e normalize a carteira para ver a alocação atual.
      </p>
      <Link className="mt-6 text-sm font-medium text-primary hover:text-primary/80" href="/importacao">
        <span className="inline-flex items-center gap-2">
          <FileSearchIcon aria-hidden="true" size={15} weight="duotone" />
          Revisar dados de origem
        </span>
      </Link>
    </div>
  );
}
