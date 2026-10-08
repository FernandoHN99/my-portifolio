"use client";

import { ListChecksIcon } from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion, useReducedMotion, type Transition } from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { tv } from "tailwind-variants";

import { cn } from "@/lib/utils";

// A faixa de competências do app: cápsulas de ano e, no ano aberto, os meses.
// Nasceu na Visão Geral (specs 030, 034 e 075) e é a mesma peça em Gastos
// familiares (spec 096), onde aceita vários meses. O componente só desenha e
// responde ao toque; quem decide o que a seleção significa (URL, travas,
// filtros) é a página que o usa. Os átomos usam `tailwind-variants`.
//
// Toque (spec 096): alvos de 44 px e espaço entre os meses em telas de toque,
// `touch-manipulation` (sem atraso nem zoom no toque duplo), retorno ao pressionar
// e o contador de meses no seletor múltiplo; no computador nada muda.

export type MonthStripMarker = "up" | "down" | "pending" | "none";

export type MonthStripItem = {
  /** "AAAA-MM". */
  month: string;
  /** "Fevereiro de 2026". */
  name: string;
  /** Rótulo curto do botão: "Fev". */
  short: string;
  /** Complemento do nome acessível, como "+1,20% no mês". */
  description?: string;
  /** Marca sob o mês: alta, queda, pendência ou nenhuma. */
  marker: MonthStripMarker;
};

type YearGroup = { year: number; months: MonthStripItem[] };

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const PANEL_MOTION: Record<"full" | "reduced", { enter: Transition; exit: Transition }> = {
  full: {
    enter: { width: { duration: 0.22, ease: EASE_OUT }, opacity: { duration: 0.18, ease: EASE_OUT } },
    exit: { width: { duration: 0.22, ease: EASE_OUT }, opacity: { duration: 0.2, ease: EASE_OUT } },
  },
  reduced: {
    enter: { width: { duration: 0 }, opacity: { duration: 0.12 } },
    exit: { width: { duration: 0 }, opacity: { duration: 0.12 } },
  },
};

const strip = tv({
  slots: {
    band: "relative flex items-center gap-2 border-b border-border/70 bg-background/80 px-4 py-2 backdrop-blur-xl sm:px-6 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)]",
    progress: "pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden transition-opacity duration-150",
    nav: "flex min-w-0 flex-1 flex-row-reverse overflow-x-auto overscroll-x-contain [scrollbar-width:none] xl:col-start-2 [&::-webkit-scrollbar]:hidden",
    trail: "ml-auto flex shrink-0 items-center gap-2 justify-self-end xl:col-start-3",
  },
  variants: { pending: { true: { progress: "opacity-100" }, false: { progress: "opacity-0" } } },
  defaultVariants: { pending: false },
});

const yearCapsule = tv({
  slots: {
    root: "flex items-center rounded-xl border bg-card/70 p-[3px] transition-colors duration-150",
    year: "flex h-10 shrink-0 touch-manipulation flex-col items-center justify-center rounded-lg px-2 font-mono text-[11px] tracking-[0.06em] outline-none transition-colors duration-150 select-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:h-8 pointer-coarse:h-11",
    months: "flex w-max shrink-0 items-center gap-0.5 py-[3px] pr-0.5 pl-1 pointer-coarse:gap-1",
  },
  variants: {
    expanded: { true: { year: "cursor-default text-foreground" }, false: {} },
    holdsSelected: { true: {}, false: {} },
    scoped: { true: {}, false: {} },
  },
  compoundVariants: [
    { expanded: false, holdsSelected: true, class: { root: "border-primary/35", year: "text-primary hover:bg-white/[0.045]" } },
    {
      expanded: false,
      holdsSelected: false,
      class: { root: "border-border", year: "text-muted-foreground hover:bg-white/[0.045] hover:text-foreground" },
    },
    { expanded: true, scoped: true, class: { root: "border-primary/30" } },
    { expanded: true, scoped: false, class: { root: "border-border" } },
  ],
  defaultVariants: { expanded: false, holdsSelected: false, scoped: false },
});

const monthButton = tv({
  base: "flex h-10 min-w-10 shrink-0 touch-manipulation flex-col items-center justify-center rounded-lg px-2 text-[11px] font-medium outline-none transition-colors duration-150 select-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:h-8 sm:min-w-9 pointer-coarse:h-11 pointer-coarse:min-w-11",
  variants: {
    selected: {
      true: "bg-primary text-primary-foreground",
      false: "text-muted-foreground hover:bg-white/[0.045] hover:text-foreground pointer-coarse:active:bg-white/[0.09]",
    },
  },
  defaultVariants: { selected: false },
});

const monthMarker = tv({
  base: "mt-1 h-0.5 w-4 rounded-full transition-colors",
  variants: {
    marker: { none: "bg-transparent", up: "", down: "", pending: "" },
    selected: { true: "", false: "" },
  },
  compoundVariants: [
    { selected: true, marker: ["up", "down", "pending"], class: "bg-primary-foreground/50" },
    { selected: false, marker: "up", class: "bg-chart-up/70" },
    { selected: false, marker: "down", class: "bg-chart-down/70" },
    { selected: false, marker: "pending", class: "bg-warning-foreground/70" },
  ],
  defaultVariants: { marker: "none", selected: false },
});

const yearTick = tv({
  base: "size-[3px] rounded-[1px]",
  variants: {
    state: {
      absent: "bg-muted-foreground/15",
      selected: "bg-foreground",
      none: "bg-muted-foreground/45",
      up: "bg-chart-up",
      down: "bg-chart-down",
      pending: "bg-warning-foreground",
    },
  },
});

const multiToggle = tv({
  base: "relative inline-flex h-10 shrink-0 touch-manipulation items-center justify-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-medium outline-none transition-colors select-none focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:h-11 pointer-coarse:min-w-11 sm:px-3",
  variants: {
    active: {
      true: "border-primary/30 bg-primary/[0.08] text-primary",
      false: "border-border bg-card/70 text-muted-foreground hover:text-foreground pointer-coarse:active:bg-white/[0.09]",
    },
  },
  defaultVariants: { active: false },
});

type MonthStripProps = {
  /** Do mais antigo ao mais recente. */
  items: readonly MonthStripItem[];
  /** Meses selecionados; o último é o que a faixa mantém à vista. */
  selected: readonly string[];
  /** Vários meses: os botões viram marcações (`aria-pressed`) e a faixa não troca de ano sozinha. */
  multiple?: boolean;
  onSelect: (month: string) => void;
  /** Mostra a barra de progresso enquanto a página carrega a competência. */
  pending?: boolean;
  /** Faixa restrita aos meses de uma posição (specs 075 e 077): destaque da trilha e entrada animada. */
  scoped?: boolean;
  /** À direita da faixa: a situação do mês, o seletor de vários meses. */
  trailing?: ReactNode;
};

export function MonthStrip({ items, selected, multiple = false, onSelect, pending = false, scoped = false, trailing }: MonthStripProps) {
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

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const anchor = selected.at(-1) ?? items.at(-1)?.month ?? null;
  const anchorYear = anchor ? Number(anchor.slice(0, 4)) : null;

  // O ano aberto para consulta só vale para a seleção em que foi aberto. Com um
  // mês só, qualquer troca (clique, teclado, URL) devolve a faixa ao ano dele; sem
  // limpar aqui, o ano consultado reabriria sozinho se a seleção voltasse à de
  // antes. Com vários meses, a faixa fica no ano em que o usuário está marcando.
  const selectionKey = multiple ? "multiple" : (selected[0] ?? "");
  if (browsing !== null && browsing.from !== selectionKey) {
    setBrowsing(null);
  }

  const expandedYear = browsing?.year ?? anchorYear;
  const hydrated = useSyncExternalStore(subscribeNothing, isClient, isServer);
  const years = useMemo(() => groupByYear(items), [items]);

  const reveal = useCallback((behavior: ScrollBehavior) => {
    const element = stripRef.current;
    // O painel do ano que está fechando continua no DOM até a saída terminar;
    // por isso a busca parte do ano aberto, e não da faixa inteira.
    const expanded = element?.querySelector<HTMLElement>("[data-expanded]");
    const target = expanded?.querySelector<HTMLElement>("[data-anchor]") ?? expanded;

    if (!element || !target) {
      return;
    }

    const stripBox = element.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();

    // Marcando vários meses seguidos, a faixa só anda quando o mês sai da vista;
    // recentralizar a cada toque faria os botões fugirem do dedo.
    if (multiple && targetBox.left >= stripBox.left + 20 && targetBox.right <= stripBox.right - 20) {
      return;
    }

    const offset = targetBox.left - stripBox.left + element.scrollLeft;
    const left = targetBox.width >= element.clientWidth ? offset : offset - (element.clientWidth - targetBox.width) / 2;

    // Rola só a faixa: scrollIntoView também deslocava a página no celular. A
    // faixa é invertida, então o deslocamento vai de zero, no fim, a negativo;
    // o navegador limita o valor ao intervalo válido.
    element.scrollTo({ left, behavior });
  }, [multiple]);

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
    const element = stripRef.current;
    const focused = document.activeElement;

    if (!element || !(focused instanceof HTMLElement) || !element.contains(focused)) {
      return;
    }

    const panel = focused.closest("[role='group']");

    if (!panel || panel.closest("[data-expanded]")) {
      return;
    }

    const expanded = element.querySelector<HTMLElement>("[data-expanded]");
    const target = expanded?.querySelector<HTMLElement>("[data-anchor]") ?? expanded?.querySelector<HTMLElement>("button");

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
  }, [anchor, expandedYear, reduceMotion, reveal]);

  const updateEdges = useCallback(() => {
    const element = stripRef.current;
    const content = element?.firstElementChild;

    if (!element || !content) {
      return;
    }

    const stripBox = element.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    const start = contentBox.left < stripBox.left - 1;
    const end = contentBox.right > stripBox.right + 1;

    setEdges((current) => (current.start === start && current.end === end ? current : { start, end }));
  }, []);

  useEffect(() => {
    const element = stripRef.current;

    if (!element) {
      return;
    }

    const observer = new ResizeObserver(updateEdges);
    observer.observe(element);

    if (element.firstElementChild) {
      observer.observe(element.firstElementChild);
    }

    return () => observer.disconnect();
  }, [updateEdges]);

  const choose = (month: string) => {
    // Marcando vários meses, a faixa fica no ano do último toque, mesmo que a
    // marcação seguinte mude o último mês para outro ano.
    if (multiple) {
      setBrowsing({ year: Number(month.slice(0, 4)), from: "multiple" });
    }

    onSelect(month);
  };

  const expandYear = (year: number) => {
    setBrowsing(year === anchorYear && !multiple ? null : { year, from: selectionKey });
  };

  if (items.length === 0) {
    return null;
  }

  const slots = strip({ pending });
  const panelMotion = PANEL_MOTION[reduceMotion ? "reduced" : "full"];
  const fade = `linear-gradient(to right, ${edges.start ? "transparent" : "black"}, black 20px, black calc(100% - 20px), ${edges.end ? "transparent" : "black"})`;

  return (
    // Na tela larga a faixa fica centralizada (spec 030): a coluna do meio
    // encolhe e rola quando falta espaço. À direita, o que a página põe em
    // `trailing`: a situação do mês na Visão Geral (spec 034), o seletor de
    // vários meses em Gastos familiares.
    <div className={slots.band()}>
      <span aria-hidden="true" className={slots.progress()}>
        <span className="month-progress block h-full w-1/3 bg-primary" />
      </span>
      <span aria-live="polite" className="sr-only">
        {pending ? "Carregando competência" : ""}
      </span>

      {/* Invertida para que, sem rolagem, a faixa mostre o fim, onde fica a
          competência mais recente; assim o celular já abre no lugar certo antes
          de o JavaScript carregar. A ordem dos anos dentro dela não muda. */}
      <nav
        ref={stripRef}
        aria-label="Competências"
        data-hydrated={hydrated || undefined}
        data-scoped={scoped || undefined}
        data-multiple={multiple || undefined}
        onScroll={updateEdges}
        className={slots.nav()}
        style={{ maskImage: fade, WebkitMaskImage: fade }}
      >
        <div className="flex w-max shrink-0 items-center gap-1.5">
          {years.map((group) => (
            <YearCapsule
              key={group.year}
              group={group}
              expanded={group.year === expandedYear}
              scoped={scoped}
              multiple={multiple}
              intro={intro && !reduceMotion}
              selected={selectedSet}
              anchor={anchor}
              panelMotion={panelMotion}
              onExpand={() => expandYear(group.year)}
              onSelect={choose}
              onOpened={handleYearOpened}
            />
          ))}
        </div>
      </nav>

      {trailing ? <div className={slots.trail()}>{trailing}</div> : null}
    </div>
  );
}

/**
 * Seletor de vários meses, para o `trailing` da faixa. Com vários meses
 * marcados mostra quantos são, para o usuário que está com a faixa rolada e não
 * vê todos.
 */
export function MultiMonthToggle({ active, count, onToggle }: { active: boolean; count: number; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label="Selecionar vários meses"
      aria-pressed={active}
      title={active ? "Usar seleção única de mês" : "Selecionar vários meses"}
      onClick={onToggle}
      className={multiToggle({ active })}
    >
      <ListChecksIcon aria-hidden="true" size={16} weight={active ? "bold" : "regular"} />
      <span className="hidden sm:inline">Vários meses</span>
      {active && count > 1 ? (
        <span aria-hidden="true" data-testid="multi-month-count" className="font-mono text-[10px] font-semibold">
          {count}
        </span>
      ) : null}
    </button>
  );
}

function YearCapsule({
  group,
  expanded,
  scoped,
  multiple,
  intro,
  selected,
  anchor,
  panelMotion,
  onExpand,
  onSelect,
  onOpened,
}: {
  group: YearGroup;
  expanded: boolean;
  scoped: boolean;
  multiple: boolean;
  intro: boolean;
  selected: ReadonlySet<string>;
  anchor: string | null;
  panelMotion: { enter: Transition; exit: Transition };
  onExpand: () => void;
  onSelect: (month: string) => void;
  onOpened: () => void;
}) {
  const chosen = group.months.filter((month) => selected.has(month.month));
  const holdsSelected = chosen.length > 0;
  const panelId = `competencias-${group.year}`;
  const hintId = `${panelId}-selecionada`;
  // Com outro ano aberto para consulta, os meses selecionados saem da árvore de
  // acessibilidade; a cápsula do ano deles avisa quais são, além da cor.
  const hint =
    holdsSelected && !expanded
      ? `${multiple ? "Competências selecionadas" : "Competência selecionada"}: ${chosen.map((month) => month.name).join(", ")}`
      : null;
  const slots = yearCapsule({ expanded, holdsSelected, scoped });

  return (
    <div data-expanded={expanded || undefined} className={slots.root()}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? panelId : undefined}
        aria-describedby={hint ? hintId : undefined}
        aria-disabled={expanded || undefined}
        onClick={expanded ? undefined : onExpand}
        className={slots.year()}
      >
        <span className="leading-none">{group.year}</span>
        <YearTicks group={group} selected={selected} hidden={expanded} />
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
              const opened = typeof definition === "object" && "width" in definition && definition.width === "auto";

              if (opened) {
                onOpened();
              }
            }}
            className="-my-[3px] flex justify-end overflow-hidden"
          >
            <div className={slots.months()}>
              {group.months.map((month, index) => (
                <MonthButton
                  key={month.month}
                  item={month}
                  selected={selected.has(month.month)}
                  anchor={month.month === anchor}
                  multiple={multiple}
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
  item,
  selected,
  anchor,
  multiple,
  onSelect,
  intro,
}: {
  item: MonthStripItem;
  selected: boolean;
  anchor: boolean;
  multiple: boolean;
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
      aria-label={item.description ? `${item.name}, ${item.description}` : item.name}
      aria-current={!multiple && selected ? "date" : undefined}
      aria-pressed={multiple ? selected : undefined}
      data-anchor={anchor && selected ? true : undefined}
      data-competence={item.month}
      onClick={() => onSelect(item.month)}
      className={monthButton({ selected })}
    >
      <span className="leading-none">{item.short}</span>
      <span aria-hidden="true" className={monthMarker({ marker: item.marker, selected })} />
    </motion.button>
  );
}

function YearTicks({ group, selected, hidden }: { group: YearGroup; selected: ReadonlySet<string>; hidden: boolean }) {
  const byMonth = new Map(group.months.map((month) => [Number(month.month.slice(5, 7)) - 1, month]));

  // Marcas de 3 px em cor cheia: com 2 px e a opacidade das barras dos meses,
  // verde e vermelho mal se distinguiam numa tela de densidade comum.
  return (
    <span aria-hidden="true" className={cn("mt-1 flex gap-px transition-opacity duration-150", hidden ? "opacity-0" : "opacity-100")}>
      {Array.from({ length: 12 }, (_, index) => {
        const month = byMonth.get(index);

        return (
          <span
            key={index}
            className={yearTick({ state: !month ? "absent" : selected.has(month.month) ? "selected" : month.marker })}
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

function groupByYear(items: readonly MonthStripItem[]): YearGroup[] {
  const groups: YearGroup[] = [];

  for (const item of items) {
    const year = Number(item.month.slice(0, 4));
    const group = groups.at(-1);

    if (group?.year === year) {
      group.months.push(item);
    } else {
      groups.push({ year, months: [item] });
    }
  }

  return groups;
}
