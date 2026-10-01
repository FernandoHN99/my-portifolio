"use client";

import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react/dist/ssr";
import { useQueryState } from "nuqs";
import { useEffect, useRef, useTransition } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { cn } from "@/lib/utils";
import type { PortfolioMonthSummary } from "@/modules/portfolio/application/get-portfolio-months";

type MonthTimelineProps = {
  months: PortfolioMonthSummary[];
  selectedMonth: string;
};

export function MonthTimeline({ months, selectedMonth }: MonthTimelineProps) {
  const [isPending, startTransition] = useTransition();
  const [, setMonth] = useQueryState("mes", { shallow: false, startTransition });
  const selectedRef = useRef<HTMLButtonElement>(null);
  const selectedIndex = months.findIndex((month) => month.month === selectedMonth);
  const latestMonth = months.at(-1);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selectedMonth]);

  const select = (index: number) => {
    const target = months[index];

    if (target) {
      void setMonth(target.month);
    }
  };

  useHotkeys("left", () => select(selectedIndex - 1), [selectedIndex, months]);
  useHotkeys("right", () => select(selectedIndex + 1), [selectedIndex, months]);

  if (months.length === 0) {
    return null;
  }

  const years = [...new Set(months.map((month) => month.referenceDate.getUTCFullYear()))];

  return (
    <div className="relative flex items-center gap-2 border-b border-border/70 bg-background/80 px-4 py-2.5 backdrop-blur-xl sm:px-6">
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden transition-opacity duration-150",
          isPending ? "opacity-100" : "opacity-0",
        )}
      >
        <span className="month-progress block h-full w-1/3 bg-primary" />
      </span>
      <span aria-live="polite" className="sr-only">
        {isPending ? "Carregando competência" : ""}
      </span>

      <TimelineButton
        label="Mês anterior"
        disabled={selectedIndex <= 0}
        onClick={() => select(selectedIndex - 1)}
      >
        <CaretLeftIcon aria-hidden="true" size={14} weight="bold" />
      </TimelineButton>

      <div
        className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Competências disponíveis"
      >
        {years.map((year) => (
          <div key={year} className="flex shrink-0 items-center gap-1.5">
            <span className="px-1 font-mono text-[10px] tracking-[0.1em] text-muted-foreground/70">
              {year}
            </span>
            {months
              .filter((month) => month.referenceDate.getUTCFullYear() === year)
              .map((month) => {
                const isSelected = month.month === selectedMonth;

                return (
                  <button
                    key={month.month}
                    ref={isSelected ? selectedRef : undefined}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => void setMonth(month.month)}
                    className={cn(
                      "group relative flex h-9 shrink-0 flex-col items-center justify-center rounded-lg px-2.5 text-[11px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/50",
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-white/[0.045] hover:text-foreground",
                    )}
                  >
                    <span>{formatMonthLabel(month.referenceDate)}</span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-0.5 h-0.5 w-4 rounded-full transition-colors",
                        month.changeBrl === null
                          ? "bg-transparent"
                          : month.changeBrl >= 0
                            ? isSelected
                              ? "bg-primary-foreground/50"
                              : "bg-primary/70"
                            : isSelected
                              ? "bg-primary-foreground/50"
                              : "bg-destructive/70",
                      )}
                    />
                  </button>
                );
              })}
          </div>
        ))}
      </div>

      <TimelineButton
        label="Próximo mês"
        disabled={selectedIndex >= months.length - 1}
        onClick={() => select(selectedIndex + 1)}
      >
        <CaretRightIcon aria-hidden="true" size={14} weight="bold" />
      </TimelineButton>

      {latestMonth && latestMonth.month !== selectedMonth ? (
        <button
          type="button"
          onClick={() => void setMonth(latestMonth.month)}
          className="hidden h-8 shrink-0 items-center rounded-lg border border-border px-2.5 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 sm:flex"
        >
          Mais recente
        </button>
      ) : null}
    </div>
  );
}

function TimelineButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-35 disabled:hover:text-muted-foreground"
    >
      {children}
    </button>
  );
}

function formatMonthLabel(referenceDate: Date) {
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    timeZone: "UTC",
  }).format(referenceDate);

  return label.replace(".", "").charAt(0).toLocaleUpperCase("pt-BR") + label.replace(".", "").slice(1);
}
