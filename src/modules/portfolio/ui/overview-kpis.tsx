"use client";

import NumberFlow from "@number-flow/react";
import { CurrencyBtcIcon, CurrencyDollarIcon, TrendUpIcon } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

import type { OverviewData } from "@/modules/portfolio/application/get-overview-data";
import { formatBrl, formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";
import { ChangeKpiCard, KpiCard } from "@/modules/portfolio/ui/kpi-card";

export function OverviewKpis({ overview }: { overview: OverviewData }) {
  return (
    <section aria-label="Indicadores da competência" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Patrimônio total"
        testId="portfolio-total"
        icon={<TrendUpIcon aria-hidden="true" size={18} weight="duotone" />}
        value={
          <NumberFlow
            value={overview.totalBrl}
            format={{ style: "currency", currency: "BRL", maximumFractionDigits: 0 }}
            locales="pt-BR"
          />
        }
        detail={
          overview.totalUsd === null
            ? "Câmbio do mês indisponível"
            : `US$ ${overview.totalUsd.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
        }
      />

      <ChangeKpiCard
        label="Variação no mês"
        changeBrl={overview.changeBrl}
        changePercent={overview.changePercent}
        emptyDetail="Sem mês anterior"
      />

      <ChangeKpiCard
        label="Variação em 12 meses"
        changeBrl={overview.change12mBrl}
        changePercent={overview.change12mPercent}
        emptyDetail="Histórico insuficiente"
      />

      <ChangeKpiCard
        label="Variação em todo o período"
        testId="period-change"
        changeBrl={overview.changeSinceStartBrl}
        changePercent={overview.changeSinceStartPercent}
        detailSuffix={`desde ${formatMonthCompact(overview.periodStart)}`}
        emptyDetail="Primeira competência do histórico"
      />

      <div className="metric-card rounded-2xl p-4 sm:col-span-2 sm:p-5 xl:col-span-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <QuoteBadge
            icon={<CurrencyDollarIcon aria-hidden="true" size={16} weight="duotone" />}
            label="Dólar no mês"
            value={overview.usdRate === null ? "—" : formatBrl(overview.usdRate)}
          />
          <QuoteBadge
            icon={<CurrencyBtcIcon aria-hidden="true" size={16} weight="duotone" />}
            label="Bitcoin no mês"
            value={overview.btcRate === null ? "—" : formatBrl(overview.btcRate)}
          />
          <QuoteBadge label="Posições" value={overview.positionCount.toLocaleString("pt-BR")} />
          <QuoteBadge label="Instituições" value={overview.institutionCount.toLocaleString("pt-BR")} />
        </div>
      </div>
    </section>
  );
}

function QuoteBadge({
  icon,
  label,
  value,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      {icon ? (
        <span className="grid size-8 place-items-center rounded-lg bg-primary/8 text-primary">
          {icon}
        </span>
      ) : null}
      <div>
        <p className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">{label}</p>
        <p className="mt-0.5 font-mono text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}
