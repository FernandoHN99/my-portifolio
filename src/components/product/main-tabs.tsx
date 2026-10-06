"use client";

import { ChartLineUpIcon, CoinsIcon, GearSixIcon } from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion, useReducedMotion, type Transition } from "motion/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { confirmDiscardChanges } from "@/components/product/unsaved-changes";
import { cn } from "@/lib/utils";

export type TabKey = "overview" | "positions" | "settings";

/**
 * Onde o usuário está dentro de Posições, para a trilha abaixo das abas (spec
 * 073, que substituiu a ilha escura da spec 046): uma posição ou as cotações.
 */
export type NavContext = { kind: "position" | "quotes"; label: string };

export const MAIN_TABS = [
  { key: "overview", label: "Visão Geral", href: "/" },
  { key: "positions", label: "Posições", href: "/posicoes" },
] as const;

const SPRING: Transition = { type: "spring", stiffness: 420, damping: 36 };
const ENTER: Transition = { type: "spring", stiffness: 380, damping: 30, mass: 0.9 };

const TRAIL_ICONS = {
  position: ChartLineUpIcon,
  quotes: CoinsIcon,
} as const;

/**
 * Abas do topo. A Configuração vira uma aba com o mesmo destaque das outras
 * quando está aberta: o botão da engrenagem some do canto e reaparece aqui,
 * como se migrasse para o estado selecionado.
 */
export function MainTabs({ active }: { active: TabKey | "none" }) {
  const searchParams = useSearchParams();
  const month = searchParams.get("mes");
  const reduceMotion = useReducedMotion();
  const withMonth = (href: string) => (month ? `${href}?mes=${month}` : href);

  return (
    <nav aria-label="Navegação principal" className="flex items-center gap-0.5 rounded-xl border border-border bg-card/70 p-1">
      {MAIN_TABS.map((tab) => (
        <TabLink key={tab.key} href={withMonth(tab.href)} active={tab.key === active} tabKey={tab.key}>
          {tab.label}
        </TabLink>
      ))}

      <AnimatePresence initial={false} mode="popLayout">
        {active === "settings" ? (
          <motion.span
            key="settings"
            layout
            initial={reduceMotion ? false : { opacity: 0, scale: 0.7, filter: "blur(3px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.7, filter: "blur(3px)" }}
            transition={ENTER}
            className="flex"
          >
            <TabLink href={withMonth("/configuracao")} active testId="settings-tab">
              <GearSixIcon aria-hidden="true" size={14} weight="duotone" className="shrink-0" />
              <span className="max-[419px]:sr-only">Configuração</span>
            </TabLink>
          </motion.span>
        ) : null}
      </AnimatePresence>
    </nav>
  );
}

function TabLink({
  href,
  active,
  testId,
  tabKey,
  children,
}: {
  href: string;
  active: boolean;
  testId?: string;
  /** Ponto de partida das setas da trilha (spec 077). */
  tabKey?: TabKey;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      data-testid={testId}
      data-nav-tab={tabKey}
      onClick={(event) => {
        if (!confirmDiscardChanges()) {
          event.preventDefault();
        }
      }}
      className={cn(
        "relative rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/50",
        active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {active ? (
        <motion.span layoutId="main-tab-indicator" className="absolute inset-0 rounded-lg bg-primary" transition={SPRING} />
      ) : null}
      <span className="relative z-10 flex items-center gap-1.5">{children}</span>
    </Link>
  );
}

/**
 * Trilha abaixo das abas (specs 073 e 077): dentro de Posições, a posição ou as
 * cotações abertas, sem repetir "Posições". Setas ligam a aba à trilha e, numa
 * posição, a trilha à faixa de competências, que mostra só os meses dela.
 */
export function NavTrail({ context }: { context: NavContext }) {
  const reduceMotion = useReducedMotion();
  const Icon = TRAIL_ICONS[context.kind];
  const chipRef = useRef<HTMLParagraphElement>(null);

  return (
    <div className="flex justify-center px-4 pb-3 sm:px-6">
      <motion.p
        ref={chipRef}
        key={`${context.kind}:${context.label}`}
        data-testid="nav-trail"
        data-kind={context.kind}
        initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={ENTER}
        className="relative z-10 flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-full border border-primary/30 bg-card px-3 text-[12px]"
      >
        <Icon aria-hidden="true" size={13} weight="duotone" className="shrink-0 text-primary" />
        <span className="min-w-0 truncate font-medium text-foreground">
          <span className="sr-only">Você está em </span>
          {context.label}
        </span>
      </motion.p>
      <TrailConnectors chipRef={chipRef} toMonths={context.kind === "position"} contextKey={`${context.kind}:${context.label}`} />
    </div>
  );
}

type Paths = { width: number; height: number; fromTab: string | null; toMonths: string | null; arrow: string | null };

/**
 * Setas da trilha, desenhadas sobre o topo inteiro: da aba Posições até a
 * trilha e, numa posição, da trilha até a faixa de competências. As posições
 * vêm do próprio layout e são recalculadas quando ele muda de tamanho.
 */
function TrailConnectors({
  chipRef,
  toMonths,
  contextKey,
}: {
  chipRef: React.RefObject<HTMLParagraphElement | null>;
  toMonths: boolean;
  contextKey: string;
}) {
  const reduceMotion = useReducedMotion();
  const svgRef = useRef<SVGSVGElement>(null);
  const [paths, setPaths] = useState<Paths | null>(null);

  const measure = useCallback(() => {
    const svg = svgRef.current;
    const header = svg?.closest("header");
    const chip = chipRef.current;
    const tab = header?.querySelector<HTMLElement>("[data-nav-tab='positions']");

    if (!svg || !header || !chip || !tab) {
      setPaths(null);
      return;
    }

    const box = header.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    // A seta sai da borda de baixo da barra de abas, sob o centro da aba.
    const barBottom = (tab.closest("nav") ?? tab).getBoundingClientRect().bottom;
    const chipBox = chip.getBoundingClientRect();
    const x = (value: number) => Math.round((value - box.left) * 10) / 10;
    const y = (value: number) => Math.round((value - box.top) * 10) / 10;
    const startX = x(tabBox.left + tabBox.width / 2);
    const startY = y(barBottom);
    const chipX = x(chipBox.left + chipBox.width / 2);
    const chipTop = y(chipBox.top);
    const middle = (startY + chipTop) / 2;
    const next: Paths = {
      width: box.width,
      height: box.height,
      fromTab: `M ${startX} ${startY} C ${startX} ${middle}, ${chipX} ${middle}, ${chipX} ${chipTop}`,
      toMonths: null,
      arrow: null,
    };

    const strip = toMonths ? header.querySelector<HTMLElement>("nav[aria-label='Competências']") : null;

    if (strip) {
      const stripBox = strip.getBoundingClientRect();
      const endX = Math.min(Math.max(chipX, x(stripBox.left) + 16), x(stripBox.right) - 16);
      const fromY = y(chipBox.bottom) + 1;
      const endY = y(stripBox.top) - 2;
      const half = (fromY + endY) / 2;
      next.toMonths = `M ${chipX} ${fromY} C ${chipX} ${half}, ${endX} ${half}, ${endX} ${endY}`;
      next.arrow = `M ${endX - 3.5} ${endY - 4} L ${endX} ${endY} L ${endX + 3.5} ${endY - 4}`;
    }

    setPaths(next);
  }, [chipRef, toMonths]);

  useLayoutEffect(() => {
    const header = svgRef.current?.closest("header");

    if (!header) {
      return;
    }

    measure();
    // A trilha entra animada e a faixa se ajusta depois; mede de novo quando
    // as duas assentam.
    const settle = window.setTimeout(measure, 450);
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    window.addEventListener("resize", measure);

    return () => {
      window.clearTimeout(settle);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, contextKey]);

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      data-testid="nav-trail-connectors"
      data-to-months={paths?.toMonths ? "true" : undefined}
      className="pointer-events-none absolute top-0 left-0 z-[5] overflow-visible"
      width={paths?.width ?? 0}
      height={paths?.height ?? 0}
    >
      {paths ? (
        <g fill="none" stroke="var(--primary)" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round">
          {paths.fromTab ? (
            <motion.path
              key={`tab:${contextKey}`}
              d={paths.fromTab}
              strokeOpacity={0.55}
              initial={reduceMotion ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
            />
          ) : null}
          {paths.toMonths ? (
            <motion.path
              key={`months:${contextKey}`}
              d={paths.toMonths}
              strokeOpacity={0.55}
              initial={reduceMotion ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.35, delay: reduceMotion ? 0 : 0.2, ease: [0.23, 1, 0.32, 1] }}
            />
          ) : null}
          {paths.arrow ? (
            <motion.path
              key={`arrow:${contextKey}`}
              d={paths.arrow}
              strokeOpacity={0.8}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: reduceMotion ? 0 : 0.45 }}
            />
          ) : null}
        </g>
      ) : null}
    </svg>
  );
}
