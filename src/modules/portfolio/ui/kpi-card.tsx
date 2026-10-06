"use client";

import NumberFlow from "@number-flow/react";
import { ArrowDownRightIcon, ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { formatBrl } from "@/modules/portfolio/presentation/portfolio-format";

// Cards de indicador da Visão Geral e da página da posição (specs 011, 024 e
// 016): rótulo, ícone, valor em destaque e uma linha de detalhe, com o hover
// central de `.metric-card`. O valor formatado fica também em `data-value`,
// porque o NumberFlow desenha os dígitos num shadow DOM sem texto legível.

const percentFormat = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

export function ChangeKpiCard({
  label,
  changeBrl,
  changePercent,
  emptyDetail,
  detailSuffix,
  testId,
  footer,
}: {
  label: string;
  changeBrl: number | null;
  changePercent: number | null;
  emptyDetail: string;
  detailSuffix?: string;
  testId?: string;
  footer?: ReactNode;
}) {
  return (
    <KpiCard
      label={label}
      testId={testId}
      footer={footer}
      icon={
        (changeBrl ?? 0) >= 0 ? (
          <ArrowUpRightIcon aria-hidden="true" size={18} weight="bold" />
        ) : (
          <ArrowDownRightIcon aria-hidden="true" size={18} weight="bold" />
        )
      }
      tone={changeBrl === null ? "neutral" : changeBrl >= 0 ? "up" : "down"}
      valueText={changePercent === null ? "—" : percentFormat.format(changePercent / 100)}
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

export function KpiCard({
  label,
  icon,
  value,
  detail,
  tone = "neutral",
  testId,
  valueText,
  footer,
}: {
  label: string;
  icon: ReactNode;
  value: ReactNode;
  detail: ReactNode;
  tone?: "up" | "down" | "neutral";
  testId?: string;
  /** Valor formatado, para leitura fora da animação. */
  valueText?: string;
  /** Um complemento discreto abaixo do detalhe, como os destaques da posição. */
  footer?: ReactNode;
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
        data-value={valueText}
        className={cn(
          "mt-5 font-mono text-2xl font-medium tracking-[-0.04em]",
          tone === "down" ? "text-destructive" : tone === "up" ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground">{detail}</p>
      {footer}
    </article>
  );
}
