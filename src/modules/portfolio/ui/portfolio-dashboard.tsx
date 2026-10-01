import {
  ArrowDownRightIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BankIcon,
  CalendarBlankIcon,
  ChartLineUpIcon,
  CoinsIcon,
  FileSearchIcon,
  WalletIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";

import { refreshPortfolioMonthAction } from "@/app/actions/refresh-portfolio-month";
import type {
  PortfolioBreakdownItem,
  PortfolioOverview,
} from "@/modules/portfolio/application/get-portfolio-overview";
import {
  formatBrl,
  formatMonth,
  formatPercent,
} from "@/modules/portfolio/presentation/portfolio-format";
import { PortfolioValueChart } from "@/modules/portfolio/ui/portfolio-value-chart";
import { RefreshPortfolioButton } from "@/modules/portfolio/ui/refresh-portfolio-button";

const CHART_COLORS = ["#5ce4a4", "#6ea8ff", "#b394ff", "#f2bb66", "#e2799c"];

export function PortfolioDashboard({ overview }: { overview: PortfolioOverview | null }) {
  if (!overview) {
    return <EmptyPortfolio />;
  }

  const positiveChange = (overview.changeBrl ?? 0) >= 0;
  const currencyData = consolidateBreakdown(overview.currencies, 5);
  const donutBackground = buildDonutBackground(currencyData);

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
            {overview.monthStatus === "DRAFT" ? (
              <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[9px] font-semibold tracking-[0.08em] text-warning-foreground uppercase">
                Rascunho
              </span>
            ) : null}
          </div>
          {overview.updateRunId ? (
            <Link
              href={`/atualizacao/${overview.updateRunId}`}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              Ver atualização
              <ArrowRightIcon aria-hidden="true" size={15} weight="bold" />
            </Link>
          ) : (
            <form action={refreshPortfolioMonthAction}>
              <RefreshPortfolioButton />
            </form>
          )}
        </div>
      </header>

      <section className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(330px,0.5fr)]">
        <article className="premium-panel overflow-hidden rounded-[24px] p-5 sm:p-7" aria-labelledby="total-title">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p id="total-title" className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
                Patrimônio total
              </p>
              <p data-testid="portfolio-total" className="mt-3 font-mono text-[clamp(2.25rem,6vw,4.6rem)] leading-none font-medium tracking-[-0.065em] text-foreground">
                {formatBrl(overview.totalBrl)}
              </p>
              {overview.changeBrl !== null && overview.changePercent !== null ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span
                    className={
                      positiveChange
                        ? "inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                        : "inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive"
                    }
                  >
                    {positiveChange ? (
                      <ArrowUpRightIcon aria-hidden="true" size={13} weight="bold" />
                    ) : (
                      <ArrowDownRightIcon aria-hidden="true" size={13} weight="bold" />
                    )}
                    {formatPercent(overview.changePercent)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatBrl(Math.abs(overview.changeBrl))} no mês
                  </span>
                </div>
              ) : null}
            </div>

            <span className="hidden size-11 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15 sm:grid">
              <ChartLineUpIcon aria-hidden="true" size={21} weight="duotone" />
            </span>
          </div>

          <div className="mt-9 border-t border-border/60 pt-5">
            <div className="mb-1 flex items-center justify-between gap-4">
              <p className="text-xs font-medium text-foreground/80">Evolução em 12 meses</p>
              <p className="text-[10px] text-muted-foreground">Valores em BRL</p>
            </div>
            <PortfolioValueChart history={overview.history} />
          </div>
        </article>

        <article className="premium-panel rounded-[24px] p-5 sm:p-7" aria-labelledby="currency-title">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
                Exposição
              </p>
              <h2 id="currency-title" className="mt-2 text-base font-semibold tracking-[-0.025em]">
                Por moeda-base
              </h2>
            </div>
            <CoinsIcon aria-hidden="true" className="text-primary" size={19} weight="duotone" />
          </div>

          <div className="mt-7 flex justify-center">
            <div
              aria-label="Distribuição da carteira por moeda-base"
              className="relative grid size-44 place-items-center rounded-full"
              role="img"
              style={{ background: donutBackground }}
            >
              <div className="grid size-[118px] place-items-center rounded-full border border-border bg-card shadow-[0_0_30px_rgba(0,0,0,0.18)]">
                <div className="text-center">
                  <p className="font-mono text-xl font-medium">{currencyData.length}</p>
                  <p className="mt-1 text-[9px] tracking-[0.12em] text-muted-foreground uppercase">moedas</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-7 space-y-3.5">
            {currencyData.map((item, index) => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="size-2 rounded-full" style={{ backgroundColor: CHART_COLORS[index] }} />
                <span className="text-xs text-foreground/80">{item.label}</span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {item.share.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section aria-label="Indicadores da carteira" className="mt-6 grid gap-3 sm:grid-cols-3">
        <PortfolioMetric
          icon={<WalletIcon aria-hidden="true" size={18} weight="duotone" />}
          label="Posições"
          value={overview.positionCount.toLocaleString("pt-BR")}
          detail="Na competência atual"
        />
        <PortfolioMetric
          icon={<BankIcon aria-hidden="true" size={18} weight="duotone" />}
          label="Instituições"
          value={overview.institutionCount.toLocaleString("pt-BR")}
          detail="Custódias separadas"
        />
        <PortfolioMetric
          icon={<CalendarBlankIcon aria-hidden="true" size={18} weight="duotone" />}
          label="Histórico"
          value={`${overview.history.length} meses`}
          detail={`${formatMonth(overview.history[0].date, true)} até ${formatMonth(overview.referenceDate, true)}`}
        />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <section className="premium-panel overflow-hidden rounded-[24px]" aria-labelledby="positions-title">
          <div className="flex items-center justify-between gap-4 border-b border-border/70 p-5 sm:p-6">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
                Maiores exposições
              </p>
              <h2 id="positions-title" className="mt-2 text-base font-semibold tracking-[-0.025em]">
                Principais posições
              </h2>
            </div>
            <span className="text-[10px] text-muted-foreground">Top {overview.topPositions.length}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border/60 text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
                  <th className="px-5 py-3.5 sm:px-6">Ativo</th>
                  <th className="hidden px-5 py-3.5 sm:table-cell">Custódia</th>
                  <th className="hidden px-5 py-3.5 md:table-cell">Moeda</th>
                  <th className="px-5 py-3.5 text-right sm:px-6">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/55">
                {overview.topPositions.map((position) => (
                  <tr key={position.id} className="transition-colors duration-150 hover:bg-white/[0.018]">
                    <td className="px-5 py-4 sm:px-6">
                      <p className="text-sm font-medium text-foreground/90">{position.assetName}</p>
                      <p className="mt-1 font-mono text-[9px] text-muted-foreground">{position.ticker ?? "SALDO"}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground sm:hidden">{position.institutionName}</p>
                    </td>
                    <td className="hidden px-5 py-4 sm:table-cell">
                      <p className="text-xs text-foreground/80">{position.institutionName}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{position.accountName}</p>
                    </td>
                    <td className="hidden px-5 py-4 font-mono text-xs text-muted-foreground md:table-cell">{position.baseCurrency}</td>
                    <td className="px-4 py-4 text-right font-mono text-xs font-medium whitespace-nowrap text-foreground sm:px-6 sm:text-sm">
                      {formatBrl(position.totalBrl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="premium-panel rounded-[24px] p-5 sm:p-6" aria-labelledby="institutions-title">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
                Custódia
              </p>
              <h2 id="institutions-title" className="mt-2 text-base font-semibold tracking-[-0.025em]">
                Por instituição
              </h2>
            </div>
            <BankIcon aria-hidden="true" className="text-primary" size={19} weight="duotone" />
          </div>

          <div className="mt-7 space-y-5">
            {overview.institutions.map((institution) => (
              <div key={institution.label}>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-foreground/80">{institution.label}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{formatBrl(institution.valueBrl, { compact: true })}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.045]">
                  <div
                    className="h-full rounded-full bg-primary/75"
                    style={{ width: `${Math.max(institution.share, 1)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 flex justify-end">
        <Link
          href="/importacao"
          className="group inline-flex items-center gap-2 rounded-lg text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          Revisar dados de origem
          <ArrowRightIcon className="text-primary transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" size={14} />
        </Link>
      </div>
    </div>
  );
}

function PortfolioMetric({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="metric-card rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
        <span className="grid size-8 place-items-center rounded-lg bg-primary/8 text-primary ring-1 ring-primary/10">{icon}</span>
      </div>
      <p className="mt-5 font-mono text-2xl font-medium tracking-[-0.04em]">{value}</p>
      <p className="mt-1.5 text-xs text-muted-foreground">{detail}</p>
    </article>
  );
}

function consolidateBreakdown(items: PortfolioBreakdownItem[], limit: number) {
  if (items.length <= limit) {
    return items;
  }

  const visible = items.slice(0, limit - 1);
  const remainder = items.slice(limit - 1).reduce(
    (total, item) => ({
      label: "Outras",
      valueBrl: total.valueBrl + item.valueBrl,
      share: total.share + item.share,
    }),
    { label: "Outras", valueBrl: 0, share: 0 },
  );

  return [...visible, remainder];
}

function buildDonutBackground(items: PortfolioBreakdownItem[]) {
  let cursor = 0;
  const stops = items.map((item, index) => {
    const start = cursor;
    cursor += item.share;
    return `${CHART_COLORS[index]} ${start}% ${cursor}%`;
  });

  return `conic-gradient(${stops.join(", ")})`;
}

function EmptyPortfolio() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-64px)] max-w-xl flex-col items-center justify-center px-5 py-16 text-center lg:min-h-[100dvh]">
      <span className="grid size-12 place-items-center rounded-2xl border border-border bg-card text-primary">
        <FileSearchIcon aria-hidden="true" size={22} weight="duotone" />
      </span>
      <h1 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">Sua carteira ainda não tem posições</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Importe e revise os dados de origem para montar a primeira visão consolidada.
      </p>
      <Link className="mt-6 text-sm font-medium text-primary hover:text-primary/80" href="/importacao">
        Revisar dados de origem
      </Link>
    </div>
  );
}
