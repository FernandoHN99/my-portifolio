"use client";

import { CaretRightIcon, ChartLineUpIcon, CoinsIcon, GearSixIcon } from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion, useReducedMotion, type Transition } from "motion/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { confirmDiscardChanges } from "@/components/product/unsaved-changes";
import { cn } from "@/lib/utils";

export type TabKey = "overview" | "positions";

/**
 * Onde o usuário está dentro de uma aba, para a ilha do topo (spec 046): uma
 * posição ou as cotações, dentro de Posições, ou a configuração, fora das abas.
 */
export type NavContext = { kind: "position" | "quotes" | "settings"; label: string };

export const MAIN_TABS = [
  { key: "overview", label: "Visão Geral", href: "/" },
  { key: "positions", label: "Posições", href: "/posicoes" },
] as const;

const SPRING: Transition = { type: "spring", stiffness: 420, damping: 36 };
const ISLAND_SPRING: Transition = { type: "spring", stiffness: 380, damping: 30, mass: 0.9 };

const ISLAND_ICONS = {
  position: ChartLineUpIcon,
  quotes: CoinsIcon,
  settings: GearSixIcon,
} as const;

export function MainTabs({ active, context }: { active: TabKey | "none"; context?: NavContext }) {
  const searchParams = useSearchParams();
  const month = searchParams.get("mes");
  const reduceMotion = useReducedMotion();

  return (
    <nav
      aria-label="Navegação principal"
      className="flex items-center gap-0.5 rounded-xl border border-border bg-card/70 p-1"
    >
      {MAIN_TABS.map((tab) => {
        const isActive = tab.key === active;

        return (
          <Link
            key={tab.key}
            href={month ? `${tab.href}?mes=${month}` : tab.href}
            aria-current={isActive ? "page" : undefined}
            onClick={(event) => {
              if (!confirmDiscardChanges()) {
                event.preventDefault();
              }
            }}
            className={cn(
              "relative rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/50",
              isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {isActive ? (
              <motion.span layoutId="main-tab-indicator" className="absolute inset-0 rounded-lg bg-primary" transition={SPRING} />
            ) : null}
            <span className="relative z-10">{tab.label}</span>
          </Link>
        );
      })}

      <AnimatePresence initial={!reduceMotion} mode="popLayout">
        {context ? <Island key="island" context={context} reduceMotion={Boolean(reduceMotion)} /> : null}
      </AnimatePresence>
    </nav>
  );
}

/**
 * A ilha: uma cápsula escura que nasce da aba com uma mola, como a ilha
 * dinâmica do iPhone, e troca o rótulo deslizando quando o lugar muda. Dentro
 * de Posições ela vem depois de uma seta, como um caminho; na configuração,
 * sozinha. Abaixo de 420 px ficam só o ponto e o ícone, e a marca do topo
 * sai para a ilha caber; abaixo de 360 px a ilha também sai, e o título da
 * página diz onde se está, sem cortar as abas.
 */
function Island({ context, reduceMotion }: { context: NavContext; reduceMotion: boolean }) {
  const Icon = ISLAND_ICONS[context.kind];
  const nested = context.kind !== "settings";

  return (
    <motion.span
      layout
      data-testid="nav-island"
      data-kind={context.kind}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.6, filter: "blur(4px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.6, filter: "blur(4px)" }}
      transition={ISLAND_SPRING}
      className="flex shrink-0 items-center gap-0.5 max-[359px]:hidden"
    >
      {nested ? (
        <CaretRightIcon
          aria-hidden="true"
          size={11}
          weight="bold"
          className="mx-0.5 hidden shrink-0 text-muted-foreground/60 min-[420px]:block"
        />
      ) : null}
      <motion.span
        layout
        transition={ISLAND_SPRING}
        className="island-capsule relative flex h-[30px] min-w-0 items-center gap-1 overflow-hidden rounded-full px-2 text-[12px] font-medium text-white min-[420px]:gap-1.5 min-[420px]:px-2.5"
      >
        <span aria-hidden="true" className="island-pulse size-1.5 shrink-0 rounded-full bg-primary" />
        <Icon aria-hidden="true" size={13} weight="duotone" className="shrink-0 text-white/80" />
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={`${context.kind}:${context.label}`}
            layout="position"
            initial={reduceMotion ? false : { y: 10, opacity: 0, filter: "blur(3px)" }}
            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            exit={reduceMotion ? { opacity: 0 } : { y: -10, opacity: 0, filter: "blur(3px)" }}
            transition={ISLAND_SPRING}
            aria-hidden="true"
            className="hidden max-w-[9rem] truncate whitespace-nowrap min-[420px]:block lg:max-w-[14rem]"
          >
            {context.label}
          </motion.span>
        </AnimatePresence>
        <span className="sr-only">{`Você está em ${context.label}`}</span>
      </motion.span>
    </motion.span>
  );
}
