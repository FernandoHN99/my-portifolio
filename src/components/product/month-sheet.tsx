"use client";

import { CalendarBlankIcon, CaretDownIcon } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { tv } from "tailwind-variants";

import { BottomSheet, BottomSheetTrigger } from "@/components/product/bottom-sheet";
import type { MonthStripItem } from "@/components/product/month-strip";
import { filterBadge } from "@/components/product/page-controls";
import { formatCompetence, formatCompetenceLong, formatCompetenceMonth } from "@/lib/competence";

// A competência da carteira no celular (abaixo de `sm`). A faixa de anos e meses
// pede rolagem e alvos pequenos, então ela vira um botão de uma linha com o mês
// escolhido, que abre a escolha numa folha de baixo para cima, como os filtros e o
// `YearMonthPicker` das áreas pessoais (spec 096). Um mês por vez: escolher o mês
// fecha a folha, sem botão de confirmar. Átomos em `tailwind-variants`.
//
// - Os anos vêm do mais recente ao mais antigo, como nas outras áreas; os meses, de
//   Jan a Dez em quatro colunas. Mês sem registro aparece apagado, para a grade
//   não mudar de forma de um ano para o outro.
// - As marcas de alta e de queda da faixa continuam sob cada mês.
// - O ano consultado só vale para a competência em que foi aberto, como na faixa:
//   trocar de competência, ou reabrir a folha, volta ao ano dela.

const sheetTrigger = tv({
  base: "flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border bg-card/60 px-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 sm:hidden",
  variants: {
    // Faixa restrita aos meses de uma posição: o destaque da trilha (specs 075 e 077).
    scoped: { true: "border-primary/30", false: "border-border" },
  },
  defaultVariants: { scoped: false },
});

const sheetMonth = tv({
  base: "flex h-14 touch-manipulation flex-col items-center justify-center rounded-xl border font-mono text-xs font-medium outline-none transition-colors duration-150 select-none focus-visible:ring-2 focus-visible:ring-ring/50",
  variants: {
    selected: {
      true: "border-transparent bg-primary text-primary-foreground",
      false: "border-border bg-card/60 text-muted-foreground active:bg-white/[0.09] disabled:bg-transparent disabled:opacity-35",
    },
  },
  defaultVariants: { selected: false },
});

/** A marca de alta ou de queda sob o mês, a mesma da faixa do computador. */
export const monthMarker = tv({
  base: "mt-1 h-0.5 w-4 rounded-full transition-colors",
  variants: {
    marker: { none: "bg-transparent", up: "", down: "" },
    selected: { true: "", false: "" },
  },
  compoundVariants: [
    { selected: true, marker: ["up", "down"], class: "bg-primary-foreground/50" },
    { selected: false, marker: "up", class: "bg-chart-up/70" },
    { selected: false, marker: "down", class: "bg-chart-down/70" },
  ],
  defaultVariants: { marker: "none", selected: false },
});

const MONTHS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));

type MonthSheetProps = {
  /** Do mais antigo ao mais recente. */
  items: readonly MonthStripItem[];
  /** O mês selecionado, "AAAA-MM". */
  selected: string;
  onSelect: (month: string) => void;
  scoped?: boolean;
};

export function MonthSheet({ items, selected, onSelect, scoped = false }: MonthSheetProps) {
  const [open, setOpen] = useState(false);
  const [browsing, setBrowsing] = useState<{ year: number; from: string } | null>(null);

  if (browsing !== null && browsing.from !== selected) {
    setBrowsing(null);
  }

  const years = [...new Set(items.map((item) => Number(item.month.slice(0, 4))))].sort((a, b) => b - a);
  const selectedYear = Number(selected.slice(0, 4));
  const viewYear = browsing?.year ?? selectedYear;
  const byMonth = new Map(items.map((item) => [item.month, item]));
  const chosen = byMonth.get(selected);

  const changeOpen = (next: boolean) => {
    setOpen(next);

    if (next) {
      setBrowsing(null);
    }
  };

  const choose = (month: string) => {
    setOpen(false);

    if (month !== selected) {
      onSelect(month);
    }
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={changeOpen}
      title="Competência"
      testId="month-sheet"
      trigger={
        <BottomSheetTrigger
          aria-label={`Competência: ${chosen?.name ?? formatCompetenceLong(selected)}`}
          data-testid="month-trigger"
          className={sheetTrigger({ scoped })}
        >
          <CalendarBlankIcon aria-hidden="true" className="shrink-0 text-muted-foreground" size={15} weight="bold" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{formatCompetence(selected)}</span>
          <CaretDownIcon aria-hidden="true" className="shrink-0 text-muted-foreground" size={13} weight="bold" />
        </BottomSheetTrigger>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" data-testid="month-sheet-years">
          {years.map((year) => {
            const holdsSelected = year === selectedYear;
            const viewed = year === viewYear;

            return (
              <button
                key={year}
                type="button"
                aria-pressed={viewed}
                aria-label={holdsSelected && !viewed ? `${year}, competência selecionada` : String(year)}
                onClick={() => setBrowsing(year === selectedYear ? null : { year, from: selected })}
                className={filterBadge({ active: viewed, marked: holdsSelected, class: ["h-11", "font-mono"] })}
              >
                {year}
                {holdsSelected && !viewed ? <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" /> : null}
              </button>
            );
          })}
        </div>

        <div role="group" aria-label={`Meses de ${viewYear}`} className="grid grid-cols-4 gap-2" data-testid="month-sheet-months">
          {MONTHS.map((number) => {
            const month = `${viewYear}-${number}`;
            const item = byMonth.get(month);
            const isSelected = month === selected;
            const name = item?.name ?? formatCompetenceLong(month);

            return (
              <button
                key={month}
                type="button"
                disabled={item === undefined}
                aria-label={item?.description ? `${name}, ${item.description}` : name}
                aria-current={isSelected ? "date" : undefined}
                data-competence={month}
                onClick={() => choose(month)}
                className={sheetMonth({ selected: isSelected })}
              >
                <span className="leading-none">{item?.short ?? formatCompetenceMonth(month)}</span>
                <span aria-hidden="true" className={monthMarker({ marker: item?.marker ?? "none", selected: isSelected })} />
              </button>
            );
          })}
        </div>
      </div>
    </BottomSheet>
  );
}
