"use client";

import NumberFlow from "@number-flow/react";
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  CurrencyBtcIcon,
  CurrencyDollarIcon,
  TrendUpIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { OverviewData } from "@/modules/portfolio/application/get-overview-data";
import { formatBrl, formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";

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

function ChangeKpiCard({
  label,
  changeBrl,
  changePercent,
  emptyDetail,
  detailSuffix,
  testId,
}: {
  label: string;
  changeBrl: number | null;
  changePercent: number | null;
  emptyDetail: string;
  detailSuffix?: string;
  testId?: string;
}) {
  return (
    <KpiCard
      label={label}
      testId={testId}
      icon={
        (changeBrl ?? 0) >= 0 ? (
          <ArrowUpRightIcon aria-hidden="true" size={18} weight="bold" />
        ) : (
          <ArrowDownRightIcon aria-hidden="true" size={18} weight="bold" />
        )
      }
      tone={changeBrl === null ? "neutral" : changeBrl >= 0 ? "up" : "down"}
      value={
        changePercent === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <NumberFlow
            value={changePercent / 100}
            format={{ style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero" }}
            locales="pt-BR"
          />
        )
      }
      detail={
        changeBrl === null
          ? emptyDetail
          : detailSuffix
            ? `${formatBrl(changeBrl)} ${detailSuffix}`
            : formatBrl(changeBrl)
      }
    />
  );
}

function KpiCard({
  label,
  icon,
  value,
  detail,
  tone = "neutral",
  testId,
}: {
  label: string;
  icon: ReactNode;
  value: ReactNode;
  detail: string;
  tone?: "up" | "down" | "neutral";
  testId?: string;
}) {
  return (
    <article className="metric-card rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          {label}
        </p>
        <span
          className={cn(
            "grid size-8 place-items-center rounded-lg ring-1",
            tone === "down"
              ? "bg-destructive/10 text-destructive ring-destructive/15"
              : "bg-primary/8 text-primary ring-primary/10",
          )}
        >
          {icon}
        </span>
      </div>
      <p
        data-testid={testId}
        className={cn(
          "mt-5 font-mono text-2xl font-medium tracking-[-0.04em]",
          tone === "down" ? "text-destructive" : tone === "up" ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground">{detail}</p>
    </article>
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
