"use client";

import { useQueryState } from "nuqs";
import { useMemo, useTransition } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { MonthLock } from "@/components/product/month-lock";
import { MonthStrip, type MonthStripItem } from "@/components/product/month-strip";
import { confirmDiscardChanges } from "@/components/product/unsaved-changes";
import type { PortfolioMonthSummary } from "@/modules/portfolio/application/get-portfolio-months";
import { formatMonth, formatPercent } from "@/modules/portfolio/presentation/portfolio-format";

type MonthTimelineProps = {
  months: PortfolioMonthSummary[];
  selectedMonth: string;
  /**
   * Faixa restrita aos meses de uma posição (specs 075 e 077): ganha o
   * destaque da trilha e os meses entram com uma animação curta.
   */
  scoped?: boolean;
};

/**
 * A faixa de competências da carteira: um mês por vez, na URL (`?mes=`), com as
 * setas do teclado e a situação do mês à direita (spec 034). O desenho e o
 * toque vivem em `MonthStrip`, que Gastos familiares também usa.
 */
export function MonthTimeline({ months, selectedMonth, scoped = false }: MonthTimelineProps) {
  const [isPending, startTransition] = useTransition();
  const [monthParam, setMonth] = useQueryState("mes", { shallow: false, startTransition });
  const items = useMemo(() => months.map(toItem), [months]);

  // O parâmetro da URL muda na hora; o servidor só confirma a competência
  // quando a transição termina. Destacar o mês pedido já no clique evita que o
  // seletor pareça não ter respondido enquanto os dados chegam.
  const activeMonth =
    monthParam !== null && months.some((month) => month.month === monthParam) ? monthParam : selectedMonth;
  const activeIndex = months.findIndex((month) => month.month === activeMonth);
  const active = months[activeIndex];
  const selected = useMemo(() => [activeMonth], [activeMonth]);

  const goTo = (month: string) => {
    if (month === activeMonth || !confirmDiscardChanges()) {
      return;
    }

    void setMonth(month);
  };

  const select = (index: number) => {
    const target = months[index];

    if (target) {
      goTo(target.month);
    }
  };

  // As setas do teclado continuam trocando de mês, sem botões na tela.
  useHotkeys("left", () => select(activeIndex - 1), [activeIndex, months, activeMonth]);
  useHotkeys("right", () => select(activeIndex + 1), [activeIndex, months, activeMonth]);

  if (months.length === 0) {
    return null;
  }

  return (
    <MonthStrip
      items={items}
      selected={selected}
      onSelect={goTo}
      pending={isPending}
      scoped={scoped}
      trailing={active ? <MonthLock month={active} /> : null}
    />
  );
}

function toItem(month: PortfolioMonthSummary): MonthStripItem {
  return {
    month: month.month,
    name: formatMonth(month.referenceDate),
    short: formatMonthLabel(month.referenceDate),
    description: month.changePercent === null ? undefined : `${formatPercent(month.changePercent)} no mês`,
    marker: month.changeBrl === null ? "none" : month.changeBrl >= 0 ? "up" : "down",
  };
}

function formatMonthLabel(referenceDate: Date) {
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    timeZone: "UTC",
  })
    .format(referenceDate)
    .replace(".", "");

  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}
