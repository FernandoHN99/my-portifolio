"use client";

import { useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { MonthStrip, MultiMonthToggle, type MonthStripItem } from "@/components/product/month-strip";
import { formatCompetenceLong, formatCompetenceMonth } from "@/lib/competence";

/**
 * Competência no topo de Gastos familiares (spec 096): a mesma faixa da Visão
 * Geral, fixa no alto da página, com o seletor de vários meses à direita. Os
 * meses com pendência da pessoa escolhida levam uma marca; as setas do teclado
 * trocam de mês quando a seleção é de um mês só.
 */
export function FamilyMonthBar({
  competences,
  selected,
  multiple,
  pendingMonths,
  keysEnabled,
  onChoose,
  onToggleMultiple,
}: {
  /** Todas as competências da faixa, em qualquer ordem. */
  competences: readonly string[];
  selected: readonly string[];
  multiple: boolean;
  /** Meses com lançamentos pendentes da pessoa escolhida. */
  pendingMonths: ReadonlySet<string>;
  /** Falso com um formulário ou confirmação aberta. */
  keysEnabled: boolean;
  onChoose: (month: string) => void;
  onToggleMultiple: () => void;
}) {
  const items = useMemo<MonthStripItem[]>(
    () =>
      [...competences].sort().map((month) => ({
        month,
        name: formatCompetenceLong(month),
        short: formatCompetenceMonth(month),
        description: pendingMonths.has(month) ? "com pendências" : undefined,
        marker: pendingMonths.has(month) ? "pending" : "none",
      })),
    [competences, pendingMonths],
  );

  const step = (delta: -1 | 1) => {
    if (multiple || selected.length === 0) {
      return;
    }

    const target = items[items.findIndex((item) => item.month === selected[0]) + delta];

    if (target) {
      onChoose(target.month);
    }
  };

  useHotkeys("left", () => step(-1), { enabled: keysEnabled && !multiple }, [items, selected, multiple]);
  useHotkeys("right", () => step(1), { enabled: keysEnabled && !multiple }, [items, selected, multiple]);

  return (
    <header
      data-testid="family-month-bar"
      className="sticky top-0 z-30 border-b border-border/70 bg-background/88 backdrop-blur-xl"
    >
      <MonthStrip
        items={items}
        selected={selected}
        multiple={multiple}
        onSelect={onChoose}
        trailing={<MultiMonthToggle active={multiple} count={selected.length} onToggle={onToggleMultiple} />}
      />
    </header>
  );
}
