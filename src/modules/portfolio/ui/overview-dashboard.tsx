import type { OverviewData } from "@/modules/portfolio/application/get-overview-data";
import { toMonthParam } from "@/modules/portfolio/presentation/reference-month";
import { AssetTypeBreakdown } from "@/modules/portfolio/ui/asset-type-breakdown";
import { CompositionDonuts } from "@/modules/portfolio/ui/composition-donuts";
import { EmptyPortfolio } from "@/modules/portfolio/ui/empty-portfolio";
import { FixedIncomeDurationChart } from "@/modules/portfolio/ui/fixed-income-duration-chart";
import { OverviewKpis } from "@/modules/portfolio/ui/overview-kpis";
import { PortfolioEvolutionChart } from "@/modules/portfolio/ui/portfolio-evolution-chart";
import { RebalancePanel } from "@/modules/portfolio/ui/rebalance-panel";
import type { SelicMonthView } from "@/modules/quotes/application/selic-reference";
import { DevQuoteSyncButton } from "@/modules/quotes/ui/dev-quote-sync-button";

export function OverviewDashboard({ overview, selic }: { overview: OverviewData | null; selic: SelicMonthView | null }) {
  if (!overview) {
    return <><div className="mx-auto max-w-[1472px] px-5 pt-6 sm:px-7 xl:px-12"><DevQuoteSyncButton /></div><EmptyPortfolio /></>;
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
        </div>
        <DevQuoteSyncButton />
      </header>

      <div className="mt-7">
        <OverviewKpis overview={overview} selic={selic} />
      </div>

      <section
        id="evolucao"
        className="premium-panel mt-6 rounded-[24px] p-5 sm:p-7"
        aria-labelledby="evolution-title"
      >
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h2 id="evolution-title" className="text-base font-semibold tracking-[-0.025em]">
            Evolução do patrimônio
          </h2>
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

      <div className="mt-6">
        <AssetTypeBreakdown rows={overview.byType} />
      </div>

      {/* min-w-0 nos itens: a tabela de comprar e vender tem largura mínima e
          rola dentro do painel, sem alargar a página no celular. */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)] [&>*]:min-w-0">
        <RebalancePanel groups={overview.rebalanceGroups} />
        <FixedIncomeDurationChart duration={overview.fixedIncomeDuration} />
      </div>
    </div>
  );
}
