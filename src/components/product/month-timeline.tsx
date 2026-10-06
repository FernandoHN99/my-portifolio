"use client";

import { AnimatePresence, motion, useReducedMotion, type Transition } from "motion/react";
import { useQueryState } from "nuqs";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { MonthLock } from "@/components/product/month-lock";
import { confirmDiscardChanges } from "@/components/product/unsaved-changes";
import { cn } from "@/lib/utils";
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

type YearGroup = {
  year: number;
  months: PortfolioMonthSummary[];
};

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const PANEL_MOTION: Record<"full" | "reduced", { enter: Transition; exit: Transition }> = {
  full: {
    enter: {
      width: { duration: 0.22, ease: EASE_OUT },
      opacity: { duration: 0.18, ease: EASE_OUT },
    },
    exit: {
      width: { duration: 0.22, ease: EASE_OUT },
      opacity: { duration: 0.2, ease: EASE_OUT },
    },
  },
  reduced: {
    enter: { width: { duration: 0 }, opacity: { duration: 0.12 } },
    exit: { width: { duration: 0 }, opacity: { duration: 0.12 } },
  },
};

export function MonthTimeline({ months, selectedMonth, scoped = false }: MonthTimelineProps) {
  const [isPending, startTransition] = useTransition();
  const [monthParam, setMonth] = useQueryState("mes", { shallow: false, startTransition });
  const reduceMotion = useReducedMotion() ?? false;
  const stripRef = useRef<HTMLElement>(null);
  const [browsing, setBrowsing] = useState<{ year: number; from: string } | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  // A entrada animada vale só para a primeira montagem da faixa restrita, não
  // para cada ano aberto depois.
  const [intro, setIntro] = useState(scoped);

  useEffect(() => {
    if (!intro) {
      return;
    }

    const done = window.setTimeout(() => setIntro(false), 700);
    return () => window.clearTimeout(done);
  }, [intro]);

  // O parâmetro da URL muda na hora; o servidor só confirma a competência
  // quando a transição termina. Destacar o mês pedido já no clique evita que o
  // seletor pareça não ter respondido enquanto os dados chegam.
  const activeMonth =
    monthParam !== null && months.some((month) => month.month === monthParam)
      ? monthParam
      : selectedMonth;
  const activeIndex = months.findIndex((month) => month.month === activeMonth);
  const active = months[activeIndex];
  const activeYear = active ? active.referenceDate.getUTCFullYear() : null;

  // O ano aberto para consulta só vale para a competência em que foi aberto.
  // Qualquer troca de competência, pelo mês, pelo teclado ou pela URL, devolve
  // a faixa ao ano dela; sem limpar aqui, o
  // ano consultado reabriria sozinho se a competência voltasse à de antes.
  if (browsing !== null && browsing.from !== activeMonth) {
    setBrowsing(null);
  }

  const expandedYear = browsing?.year ?? activeYear;
  const hydrated = useSyncExternalStore(subscribeNothing, isClient, isServer);
  const years = useMemo(() => groupByYear(months), [months]);

  const reveal = useCallback((behavior: ScrollBehavior) => {
    const strip = stripRef.current;
    // O painel do ano que está fechando continua no DOM até a saída terminar;
    // por isso a busca parte do ano aberto, e não da faixa inteira.
    const expanded = strip?.querySelector<HTMLElement>("[data-expanded]");
    const target = expanded?.querySelector<HTMLElement>("[aria-current='date']") ?? expanded;

    if (!strip || !target) {
      return;
    }

    const stripBox = strip.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    const offset = targetBox.left - stripBox.left + strip.scrollLeft;
    const left =
      targetBox.width >= strip.clientWidth
        ? offset
        : offset - (strip.clientWidth - targetBox.width) / 2;

    // Rola só a faixa: scrollIntoView também deslocava a página no celular. A
    // faixa é invertida, então o deslocamento vai de zero, no fim, a negativo;
    // o navegador limita o valor ao intervalo válido.
    strip.scrollTo({ left, behavior });
  }, []);

  const lastExpandedYear = useRef(expandedYear);
  const firstReveal = useRef(true);

  const handleYearOpened = () => {
    reveal(reduceMotion ? "auto" : "smooth");
  };

  // Se o ano muda com o foco num mês do ano que está fechando, o foco passa ao
  // mês selecionado do ano que abriu assim que o painel dele entra no DOM, ainda
  // sem largura. Esperar o fim da animação não basta: um segundo toque nas setas
  // antes disso já é uma troca dentro do ano novo, e o foco cairia no documento
  // quando o painel que sai fosse desmontado.
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const focused = document.activeElement;

    if (!strip || !(focused instanceof HTMLElement) || !strip.contains(focused)) {
      return;
    }

    const panel = focused.closest("[role='group']");

    if (!panel || panel.closest("[data-expanded]")) {
      return;
    }

    const expanded = strip.querySelector<HTMLElement>("[data-expanded]");
    const target =
      expanded?.querySelector<HTMLElement>("[aria-current='date']") ??
      expanded?.querySelector<HTMLElement>("button");

    target?.focus({ preventScroll: true });
  }, [expandedYear]);

  useEffect(() => {
    const yearChanged = lastExpandedYear.current !== expandedYear;
    lastExpandedYear.current = expandedYear;

    // Ao trocar de ano, a posição final só existe depois da animação; quem
    // centraliza é o painel do ano, quando termina de abrir.
    if (yearChanged) {
      return;
    }

    reveal(firstReveal.current || reduceMotion ? "auto" : "smooth");
    firstReveal.current = false;
  }, [activeMonth, expandedYear, reduceMotion, reveal]);

  const updateEdges = useCallback(() => {
    const strip = stripRef.current;
    const content = strip?.firstElementChild;

    if (!strip || !content) {
      return;
    }

    const stripBox = strip.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    const start = contentBox.left < stripBox.left - 1;
    const end = contentBox.right > stripBox.right + 1;

    setEdges((current) =>
      current.start === start && current.end === end ? current : { start, end },
    );
  }, []);

  useEffect(() => {
    const strip = stripRef.current;

    if (!strip) {
      return;
    }

    const observer = new ResizeObserver(updateEdges);
    observer.observe(strip);

    if (strip.firstElementChild) {
      observer.observe(strip.firstElementChild);
    }

    return () => observer.disconnect();
  }, [updateEdges]);

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

  const expandYear = (year: number) => {
    setBrowsing(year === activeYear ? null : { year, from: activeMonth });
  };

  // As setas do teclado continuam trocando de mês, sem botões na tela.
  useHotkeys("left", () => select(activeIndex - 1), [activeIndex, months, activeMonth]);
  useHotkeys("right", () => select(activeIndex + 1), [activeIndex, months, activeMonth]);

  if (months.length === 0) {
    return null;
  }

  const panelMotion = PANEL_MOTION[reduceMotion ? "reduced" : "full"];
  const fade = `linear-gradient(to right, ${edges.start ? "transparent" : "black"}, black 20px, black calc(100% - 20px), ${edges.end ? "transparent" : "black"})`;

  return (
    // Na tela larga a faixa fica centralizada (spec 030): a coluna do meio
    // encolhe e rola quando falta espaço. À direita, a situação do mês
    // selecionado, aberto ou fechado (spec 034).
    <div className="relative flex items-center gap-2 border-b border-border/70 bg-background/80 px-4 py-2 backdrop-blur-xl sm:px-6 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)]">
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

      {/* Invertida para que, sem rolagem, a faixa mostre o fim, onde fica a
          competência mais recente; assim o celular já abre no lugar certo antes
          de o JavaScript carregar. A ordem dos anos dentro dela não muda. */}
      <nav
        ref={stripRef}
        aria-label="Competências"
        data-hydrated={hydrated || undefined}
        data-scoped={scoped || undefined}
        onScroll={updateEdges}
        className="flex min-w-0 flex-1 flex-row-reverse overflow-x-auto overscroll-x-contain [scrollbar-width:none] xl:col-start-2 [&::-webkit-scrollbar]:hidden"
        style={{ maskImage: fade, WebkitMaskImage: fade }}
      >
        <div className="flex w-max shrink-0 items-center gap-1.5">
          {years.map((group) => (
            <YearCapsule
              key={group.year}
              group={group}
              expanded={group.year === expandedYear}
              scoped={scoped}
              intro={intro && !reduceMotion}
              activeMonth={activeMonth}
              panelMotion={panelMotion}
              onExpand={() => expandYear(group.year)}
              onSelect={goTo}
              onOpened={handleYearOpened}
            />
          ))}
        </div>
      </nav>

      {active ? (
        <div className="ml-auto flex shrink-0 justify-self-end xl:col-start-3">
          <MonthLock month={active} />
        </div>
      ) : null}
    </div>
  );
}

function YearCapsule({
  group,
  expanded,
  scoped,
  intro,
  activeMonth,
  panelMotion,
  onExpand,
  onSelect,
  onOpened,
}: {
  group: YearGroup;
  expanded: boolean;
  scoped: boolean;
  intro: boolean;
  activeMonth: string;
  panelMotion: { enter: Transition; exit: Transition };
  onExpand: () => void;
  onSelect: (month: string) => void;
  onOpened: () => void;
}) {
  const selected = group.months.find((month) => month.month === activeMonth);
  const holdsActive = selected !== undefined;
  const panelId = `competencias-${group.year}`;
  const hintId = `${panelId}-selecionada`;
  // Com outro ano aberto para consulta, o mês selecionado sai da árvore de
  // acessibilidade; a cápsula do ano dele avisa qual é, além da cor.
  const hint =
    selected && !expanded ? `Competência selecionada: ${formatMonth(selected.referenceDate)}` : null;

  return (
    <div
      data-expanded={expanded || undefined}
      className={cn(
        "flex items-center rounded-xl border bg-card/70 p-[3px] transition-colors duration-150",
        holdsActive && !expanded ? "border-primary/35" : scoped && expanded ? "border-primary/30" : "border-border",
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? panelId : undefined}
        aria-describedby={hint ? hintId : undefined}
        aria-disabled={expanded || undefined}
        onClick={expanded ? undefined : onExpand}
        className={cn(
          "flex h-10 shrink-0 flex-col items-center justify-center rounded-lg px-2 font-mono text-[11px] tracking-[0.06em] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/50 sm:h-8 pointer-coarse:h-10",
          expanded
            ? "cursor-default text-foreground"
            : holdsActive
              ? "text-primary hover:bg-white/[0.045]"
              : "text-muted-foreground hover:bg-white/[0.045] hover:text-foreground",
        )}
      >
        <span className="leading-none">{group.year}</span>
        <YearTicks group={group} activeMonth={activeMonth} hidden={expanded} />
      </button>
      {hint ? (
        <span id={hintId} hidden>
          {hint}
        </span>
      ) : null}

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="months"
            id={panelId}
            role="group"
            aria-label={`Meses de ${group.year}`}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1, transition: panelMotion.enter }}
            exit={{ width: 0, opacity: 0, transition: panelMotion.exit }}
            onAnimationComplete={(definition) => {
              const opened =
                typeof definition === "object" && "width" in definition && definition.width === "auto";

              if (opened) {
                onOpened();
              }
            }}
            className="-my-[3px] flex justify-end overflow-hidden"
          >
            <div className="flex w-max shrink-0 items-center gap-0.5 py-[3px] pr-0.5 pl-1">
              {group.months.map((month, index) => (
                <MonthButton
                  key={month.month}
                  month={month}
                  active={month.month === activeMonth}
                  onSelect={onSelect}
                  intro={intro ? Math.min(index, 12) * 0.025 : null}
                />
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function MonthButton({
  month,
  active,
  onSelect,
  intro,
}: {
  month: PortfolioMonthSummary;
  active: boolean;
  onSelect: (month: string) => void;
  /** Atraso da entrada animada, na faixa restrita a uma posição; nulo sem animação. */
  intro: number | null;
}) {
  return (
    <motion.button
      initial={intro === null ? false : { opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 30, delay: intro ?? 0 }}
      type="button"
      aria-label={describeMonth(month)}
      aria-current={active ? "date" : undefined}
      onClick={() => onSelect(month.month)}
      className={cn(
        "flex h-10 min-w-10 shrink-0 flex-col items-center justify-center rounded-lg px-2 text-[11px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/50 sm:h-8 sm:min-w-9 pointer-coarse:h-10 pointer-coarse:min-w-10",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-white/[0.045] hover:text-foreground",
      )}
    >
      <span className="leading-none">{formatMonthLabel(month.referenceDate)}</span>
      <span
        aria-hidden="true"
        className={cn("mt-1 h-0.5 w-4 rounded-full transition-colors", markerClass(month, active))}
      />
    </motion.button>
  );
}

function YearTicks({
  group,
  activeMonth,
  hidden,
}: {
  group: YearGroup;
  activeMonth: string;
  hidden: boolean;
}) {
  const byMonth = new Map(group.months.map((month) => [month.referenceDate.getUTCMonth(), month]));

  // Marcas de 3 px em cor cheia: com 2 px e a opacidade das barras dos meses,
  // verde e vermelho mal se distinguiam numa tela de densidade comum.
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-1 flex gap-px transition-opacity duration-150",
        hidden ? "opacity-0" : "opacity-100",
      )}
    >
      {Array.from({ length: 12 }, (_, index) => {
        const month = byMonth.get(index);

        return (
          <span
            key={index}
            className={cn(
              "size-[3px] rounded-[1px]",
              !month
                ? "bg-muted-foreground/15"
                : month.month === activeMonth
                  ? "bg-foreground"
                  : month.changeBrl === null
                    ? "bg-muted-foreground/45"
                    : month.changeBrl >= 0
                      ? "bg-chart-up"
                      : "bg-chart-down",
            )}
          />
        );
      })}
    </span>
  );
}

// Antes da hidratação os botões da faixa não respondem. `data-hydrated` marca
// o momento em que passam a responder; os testes de interface esperam por ele.
function subscribeNothing() {
  return () => {};
}

function isClient() {
  return true;
}

function isServer() {
  return false;
}

function groupByYear(months: PortfolioMonthSummary[]): YearGroup[] {
  const groups: YearGroup[] = [];

  for (const month of months) {
    const year = month.referenceDate.getUTCFullYear();
    const group = groups.at(-1);

    if (group?.year === year) {
      group.months.push(month);
    } else {
      groups.push({ year, months: [month] });
    }
  }

  return groups;
}

function markerClass(month: PortfolioMonthSummary, active: boolean) {
  if (month.changeBrl === null) {
    return "bg-transparent";
  }

  if (active) {
    return "bg-primary-foreground/50";
  }

  return month.changeBrl >= 0 ? "bg-chart-up/70" : "bg-chart-down/70";
}

function describeMonth(month: PortfolioMonthSummary) {
  const label = formatMonth(month.referenceDate);

  return month.changePercent === null
    ? label
    : `${label}, ${formatPercent(month.changePercent)} no mês`;
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
