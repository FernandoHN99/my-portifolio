"use client";

import NumberFlow from "@number-flow/react";
import { ArrowDownRightIcon, ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

import { KpiCard } from "@/components/product/kpi-card";
import { formatBrl } from "@/modules/portfolio/presentation/portfolio-format";

// Indicador de variação da Visão Geral e da página da posição (specs 011, 024 e
// 016): o card é o `KpiCard` de `components/product`, comum a todas as áreas.
// O valor formatado fica também em `data-value`, porque o NumberFlow desenha os
// dígitos num shadow DOM sem texto legível.

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
