"use client";

import { CaretRightIcon, ChartLineUpIcon, CoinsIcon, GearSixIcon } from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion, useReducedMotion, type Transition } from "motion/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

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
        <TabLink key={tab.key} href={withMonth(tab.href)} active={tab.key === active}>
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
  children,
}: {
  href: string;
  active: boolean;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      data-testid={testId}
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
 * Trilha abaixo das abas (spec 073): dentro de Posições, a posição ou as
 * cotações abertas, nas cores do projeto, em vez de uma cápsula escura ao lado
 * das abas. Tem a largura da tela inteira, então o nome aparece mesmo no
 * celular.
 */
export function NavTrail({ context }: { context: NavContext }) {
  const reduceMotion = useReducedMotion();
  const Icon = TRAIL_ICONS[context.kind];

  return (
    <div className="flex justify-center px-4 pb-2.5 sm:px-6">
      <motion.p
        key={`${context.kind}:${context.label}`}
        data-testid="nav-trail"
        data-kind={context.kind}
        initial={reduceMotion ? false : { opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={ENTER}
        className="flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 text-[12px]"
      >
        <span className="shrink-0 text-muted-foreground">Posições</span>
        <CaretRightIcon aria-hidden="true" size={10} weight="bold" className="shrink-0 text-muted-foreground/60" />
        <Icon aria-hidden="true" size={13} weight="duotone" className="shrink-0 text-primary" />
        <span className="min-w-0 truncate font-medium text-foreground">
          <span className="sr-only">Você está em </span>
          {context.label}
        </span>
      </motion.p>
    </div>
  );
}
