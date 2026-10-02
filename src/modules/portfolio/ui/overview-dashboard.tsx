import { CalendarBlankIcon, FileSearchIcon } from "@phosphor-icons/react/dist/ssr";

import { MonthStatusBadge } from "@/components/product/month-status-badge";
import type { OverviewData } from "@/modules/portfolio/application/get-overview-data";
import { formatMonth } from "@/modules/portfolio/presentation/portfolio-format";
import { toMonthParam } from "@/modules/portfolio/presentation/reference-month";
import { CompositionDonuts } from "@/modules/portfolio/ui/composition-donuts";
import { FixedIncomeDurationChart } from "@/modules/portfolio/ui/fixed-income-duration-chart";
import { OverviewKpis } from "@/modules/portfolio/ui/overview-kpis";
import { PortfolioEvolutionChart } from "@/modules/portfolio/ui/portfolio-evolution-chart";
import { RebalancePanel } from "@/modules/portfolio/ui/rebalance-panel";

export function OverviewDashboard({ overview }: { overview: OverviewData | null }) {
  if (!overview) {
    return <EmptyOverview />;
  }

  const monthParam = toMonthParam(overview.referenceDate);

  return (
    <div className="relative mx-auto w-full max-w-[1472px] px-5 py-8 sm:px-7 sm:py-10 xl:px-12 xl:py-12">
      <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[460px] w-[460px]" />

      <header className="flex flex-col gap-6 border-b border-border/70 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Visão geral
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-[2.65rem]">
            Patrimônio consolidado
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Posições separadas por conta, consolidadas em uma única visão.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-border bg-card/70 px-3.5 py-2.5 text-xs text-muted-foreground">
            <CalendarBlankIcon aria-hidden="true" className="text-primary" size={15} weight="duotone" />
            <span>{formatMonth(overview.referenceDate)}</span>
            <MonthStatusBadge status={overview.monthStatus} />
          </div>
        </div>
      </header>

      <div className="mt-7">
        <OverviewKpis overview={overview} />
      </div>

      <section
        id="evolucao"
        className="premium-panel mt-6 rounded-[24px] p-5 sm:p-7"
        aria-labelledby="evolution-title"
      >
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="evolution-title" className="text-base font-semibold tracking-[-0.025em]">
              Evolução do patrimônio
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Clique em uma coluna para abrir aquela competência.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <PortfolioEvolutionChart
            history={overview.history}
            selectedMonth={monthParam}
            classLabels={overview.classLabels}
            currencyLabels={overview.currencyLabels}
          />
        </div>
      </section>

      <div className="mt-6">
        <CompositionDonuts groups={overview.composition} />
      </div>

      {/* min-w-0 nos itens: a tabela de comprar e vender tem largura mínima e
          rola dentro do painel, sem alargar a página no celular. */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)] [&>*]:min-w-0">
        <RebalancePanel
          groups={overview.rebalanceGroups}
          tolerance={overview.offTargetTolerance}
        />
        <FixedIncomeDurationChart duration={overview.fixedIncomeDuration} />
      </div>
    </div>
  );
}

function EmptyOverview() {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-center justify-center px-5 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-2xl border border-border bg-card text-primary">
        <FileSearchIcon aria-hidden="true" size={22} weight="duotone" />
      </span>
      <h1 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">
        Sua carteira ainda não tem posições
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Importe os dados do Excel para montar a primeira visão consolidada.
      </p>
    </div>
  );
}
