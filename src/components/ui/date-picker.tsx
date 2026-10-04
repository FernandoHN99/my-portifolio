"use client";

import { Popover } from "@base-ui/react/popover";
import { CalendarBlankIcon, CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

// Campo de data do design system (spec 069), no lugar do `<input type="date">`
// nativo, que cada navegador desenha de um jeito. O texto aceita digitar
// DD/MM/AAAA, com as barras postas sozinhas; o botão abre um calendário com
// os dias fora do intervalo bloqueados. Valores em AAAA-MM-DD, como antes.

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const YEARS_PER_PAGE = 12;

export type DatePickerProps = {
  /** AAAA-MM-DD, ou vazio. */
  value: string;
  onChange: (value: string) => void;
  /** Primeiro e último dia aceitos, AAAA-MM-DD. */
  min?: string;
  max?: string;
  "aria-label": string;
  placeholder?: string;
  /** Oferece "Limpar" no calendário, para datas opcionais. */
  clearable?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
};

export function DatePicker({
  value,
  onChange,
  min,
  max,
  "aria-label": label,
  placeholder = "dd/mm/aaaa",
  clearable = false,
  invalid = false,
  disabled = false,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  // Texto digitado enquanto o campo tem foco; fora dele, a data escolhida.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value ? toDisplay(value) : "");
  const typed = draft !== null && draft.length === 10 ? fromDisplay(draft) : null;
  const outOfRange = typed !== null && !withinRange(typed, min, max);
  const incomplete = draft !== null && draft.length > 0 && (draft.length < 10 || typed === null);

  const type = (text: string) => {
    const masked = maskDate(text);
    setDraft(masked);

    if (masked === "") {
      onChange("");
      return;
    }

    const day = masked.length === 10 ? fromDisplay(masked) : null;

    if (day && withinRange(day, min, max)) {
      onChange(day);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div
        data-slot="date-picker"
        className={cn(
          "relative flex h-9 w-full items-center rounded-lg border bg-background/60 text-xs text-foreground transition-[border-color,box-shadow] duration-150 focus-within:ring-2",
          invalid || outOfRange
            ? "border-destructive focus-within:ring-destructive/40"
            : "border-border focus-within:border-primary/60 focus-within:ring-ring/50",
          open && "border-primary/60",
          disabled && "opacity-50",
          className,
        )}
      >
        <input
          aria-label={label}
          aria-invalid={invalid || outOfRange || undefined}
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          value={shown}
          disabled={disabled}
          maxLength={10}
          onChange={(event) => type(event.target.value)}
          onFocus={() => setDraft(value ? toDisplay(value) : "")}
          onBlur={() => setDraft(null)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && event.altKey) {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className="h-full w-full min-w-0 flex-1 bg-transparent pr-9 pl-2.5 font-mono text-xs tabular-nums outline-none placeholder:font-sans placeholder:text-muted-foreground/60 disabled:cursor-not-allowed"
        />
        <Popover.Trigger
          disabled={disabled}
          aria-label={`Abrir calendário: ${label}`}
          className="absolute inset-y-0 right-0 grid w-9 place-items-center rounded-r-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-primary data-popup-open:text-primary"
        >
          <CalendarBlankIcon aria-hidden="true" size={14} weight="bold" />
        </Popover.Trigger>
      </div>
      {incomplete || outOfRange ? (
        <span className="sr-only" role="status">
          {outOfRange ? `Escolha um dia entre ${toDisplay(min ?? "")} e ${toDisplay(max ?? "")}.` : "Data incompleta."}
        </span>
      ) : null}
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={12} className="z-[60] outline-none">
          <Popover.Popup
            aria-label={`Calendário: ${label}`}
            className="w-[min(18rem,calc(100vw-1.5rem))] origin-[var(--transform-origin)] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0"
          >
            {open ? (
              <Calendar
                value={value}
                min={min}
                max={max}
                clearable={clearable}
                onSelect={(day) => {
                  onChange(day);
                  setDraft(null);
                  setOpen(false);
                }}
              />
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Calendar({
  value,
  min,
  max,
  clearable,
  onSelect,
}: {
  value: string;
  min?: string;
  max?: string;
  clearable: boolean;
  onSelect: (day: string) => void;
}) {
  const today = todayKey();
  const start = value || clampDay(today, min, max);
  const [focused, setFocused] = useState(start);
  const [view, setView] = useState<"days" | "years">("days");
  const [yearPage, setYearPage] = useState(() => Number(start.slice(0, 4)) - 5);
  const focusRef = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);

  useEffect(() => {
    // Foco no dia escolhido ao abrir e a cada movimento pelo teclado.
    if (view === "days") {
      focusRef.current?.focus({ preventScroll: !moved.current });
    }
  }, [focused, view]);

  const year = Number(focused.slice(0, 4));
  const month = Number(focused.slice(5, 7)) - 1;
  const first = new Date(Date.UTC(year, month, 1));
  const gridStart = addDays(toKey(first), -first.getUTCDay());
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const weeks = days[35].slice(5, 7) === focused.slice(5, 7) ? 6 : 5;

  const move = (day: string) => {
    moved.current = true;
    setFocused(clampDay(day, min, max));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const steps: Record<string, () => string> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      PageUp: () => addMonthsKeepingDay(focused, event.shiftKey ? -12 : -1),
      PageDown: () => addMonthsKeepingDay(focused, event.shiftKey ? 12 : 1),
      Home: () => addDays(focused, -new Date(`${focused}T00:00:00Z`).getUTCDay()),
      End: () => addDays(focused, 6 - new Date(`${focused}T00:00:00Z`).getUTCDay()),
    };
    const step = steps[event.key];

    if (step) {
      event.preventDefault();
      move(step());
    }
  };

  const monthDisabled = (offset: number) => {
    const target = addMonthsKeepingDay(`${focused.slice(0, 8)}01`, offset);
    const lastOfTarget = addDays(addMonthsKeepingDay(target, 1), -1);
    return (min !== undefined && lastOfTarget < min) || (max !== undefined && target > max);
  };

  if (view === "years") {
    const years = Array.from({ length: YEARS_PER_PAGE }, (_, index) => yearPage + index);
    const yearAllowed = (candidate: number) =>
      (min === undefined || `${candidate}-12-31` >= min) && (max === undefined || `${candidate}-01-01` <= max);

    return (
      <div>
        <CalendarHeader
          title={`${years[0]} – ${years[years.length - 1]}`}
          titleLabel="Voltar aos dias"
          onTitle={() => setView("days")}
          onPrevious={() => setYearPage((page) => page - YEARS_PER_PAGE)}
          onNext={() => setYearPage((page) => page + YEARS_PER_PAGE)}
          previousLabel="Anos anteriores"
          nextLabel="Próximos anos"
        />
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {years.map((candidate) => (
            <button
              key={candidate}
              type="button"
              disabled={!yearAllowed(candidate)}
              aria-pressed={candidate === year}
              onClick={() => {
                move(`${candidate}${focused.slice(4)}`);
                setView("days");
              }}
              className={cn(
                "h-9 rounded-lg font-mono text-xs tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-30",
                candidate === year ? "bg-primary text-primary-foreground" : "text-foreground/85 hover:bg-white/[0.06]",
              )}
            >
              {candidate}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <CalendarHeader
        title={`${MONTH_NAMES[month]} ${year}`}
        titleLabel={`${MONTH_NAMES[month]} de ${year}. Escolher o ano`}
        onTitle={() => {
          setYearPage(year - 5);
          setView("years");
        }}
        onPrevious={() => move(addMonthsKeepingDay(focused, -1))}
        onNext={() => move(addMonthsKeepingDay(focused, 1))}
        previousLabel="Mês anterior"
        nextLabel="Próximo mês"
        previousDisabled={monthDisabled(-1)}
        nextDisabled={monthDisabled(1)}
      />

      <div className="mt-3 grid grid-cols-7 text-center" aria-hidden="true">
        {WEEKDAYS.map((weekday, index) => (
          <span key={index} className="pb-1.5 text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
            {weekday}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5" onKeyDown={onKeyDown} data-testid="date-picker-days">
        {days.slice(0, weeks * 7).map((day) => {
          const inMonth = day.slice(5, 7) === focused.slice(5, 7);
          const allowed = withinRange(day, min, max);
          const selected = day === value;
          const isToday = day === today;
          const date = new Date(`${day}T00:00:00Z`);

          return (
            <button
              key={day}
              ref={day === focused ? focusRef : undefined}
              type="button"
              tabIndex={day === focused ? 0 : -1}
              disabled={!allowed}
              aria-pressed={selected}
              aria-label={`${WEEKDAY_NAMES[date.getUTCDay()]}, ${date.getUTCDate()} de ${MONTH_NAMES[date.getUTCMonth()]} de ${date.getUTCFullYear()}${isToday ? ", hoje" : ""}`}
              onClick={() => onSelect(day)}
              onFocus={() => {
                if (day !== focused) setFocused(day);
              }}
              className={cn(
                "mx-auto grid size-9 place-items-center rounded-lg font-mono text-xs tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-25 sm:size-8",
                selected
                  ? "bg-primary font-semibold text-primary-foreground"
                  : isToday
                    ? "text-primary ring-1 ring-primary/45 hover:bg-primary/10"
                    : inMonth
                      ? "text-foreground/90 hover:bg-white/[0.06]"
                      : "text-muted-foreground/45 hover:bg-white/[0.04]",
              )}
            >
              {date.getUTCDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5">
        {withinRange(today, min, max) ? (
          <button
            type="button"
            onClick={() => onSelect(today)}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-primary outline-none transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            Hoje
          </button>
        ) : (
          <span />
        )}
        {clearable && value ? (
          <button
            type="button"
            onClick={() => onSelect("")}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            Limpar
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CalendarHeader({
  title,
  titleLabel,
  onTitle,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
  previousDisabled = false,
  nextDisabled = false,
}: {
  title: string;
  titleLabel: string;
  onTitle: () => void;
  onPrevious: () => void;
  onNext: () => void;
  previousLabel: string;
  nextLabel: string;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
}) {
  const arrowClass =
    "grid size-8 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-30";

  return (
    <div className="flex items-center justify-between gap-1">
      <button type="button" aria-label={previousLabel} onClick={onPrevious} disabled={previousDisabled} className={arrowClass}>
        <CaretLeftIcon aria-hidden="true" size={13} weight="bold" />
      </button>
      <button
        type="button"
        aria-label={titleLabel}
        onClick={onTitle}
        className="h-8 rounded-lg px-2.5 text-xs font-semibold tracking-[-0.01em] text-foreground capitalize outline-none transition-colors hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {title}
      </button>
      <button type="button" aria-label={nextLabel} onClick={onNext} disabled={nextDisabled} className={arrowClass}>
        <CaretRightIcon aria-hidden="true" size={13} weight="bold" />
      </button>
    </div>
  );
}

/** DD/MM/AAAA a partir dos dígitos digitados, com as barras nos lugares. */
export function maskDate(text: string) {
  const digits = text.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join("/");
}

function toDisplay(day: string) {
  return day ? day.split("-").reverse().join("/") : "";
}

function fromDisplay(text: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);

  if (!match) {
    return null;
  }

  const day = `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && toKey(date) === day ? day : null;
}

function withinRange(day: string, min?: string, max?: string) {
  return (min === undefined || day >= min) && (max === undefined || day <= max);
}

function clampDay(day: string, min?: string, max?: string) {
  if (min !== undefined && day < min) return min;
  if (max !== undefined && day > max) return max;
  return day;
}

function toKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, amount: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return toKey(date);
}

/** Mesmo dia em outro mês, no último dia quando o mês é mais curto. */
function addMonthsKeepingDay(day: string, amount: number) {
  const [year, month, date] = day.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + amount, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date, lastDay));
  return toKey(target);
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
