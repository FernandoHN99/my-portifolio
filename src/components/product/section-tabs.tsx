"use client";

import type { Icon } from "@phosphor-icons/react/dist/lib/types";
import { motion, type Transition } from "motion/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { confirmDiscardChanges } from "@/components/product/unsaved-changes";
import { cn } from "@/lib/utils";

// Abas do topo de uma área (specs 046, 073 e 098): a pílula com o destaque
// deslizante das abas de Investimentos, que também servem às áreas com mais
// de uma tela, como Recebimentos e as Horas extras. As abas só trocam pelo
// toque (spec 077), sem arraste lateral.

const SPRING: Transition = { type: "spring", stiffness: 420, damping: 36 };

export type SectionTab = { key: string; label: string; href: string; icon: Icon };

/** Uma aba: link com o destaque animado quando é a página aberta. */
export function TabLink({
  href,
  active,
  testId,
  indicatorId = "main-tab-indicator",
  children,
}: {
  href: string;
  active: boolean;
  testId?: string;
  /** Nome do destaque animado, único por barra de abas. */
  indicatorId?: string;
  children: ReactNode;
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
        // Destaque discreto, como o item ativo da barra lateral: fundo verde
        // translúcido, contorno fino e o ícone na cor primária.
        active ? "text-foreground [&_svg]:text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {active ? (
        <motion.span layoutId={indicatorId} className="absolute inset-0 rounded-lg bg-primary/12 ring-1 ring-primary/25 ring-inset" transition={SPRING} />
      ) : null}
      <span className="relative z-10 flex items-center gap-1.5">{children}</span>
    </Link>
  );
}

/**
 * Barra de abas de uma área. `keep` lista os parâmetros da URL que acompanham a
 * troca de aba, como o ano de Recebimentos.
 */
export function SectionTabs({
  label,
  tabs,
  active,
  keep = [],
  indicatorId,
}: {
  label: string;
  tabs: readonly SectionTab[];
  active: string;
  keep?: readonly string[];
  indicatorId: string;
}) {
  const searchParams = useSearchParams();
  const hrefOf = (href: string) => {
    const params = new URLSearchParams();
    for (const key of keep) {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    }
    const query = params.toString();
    return query ? `${href}?${query}` : href;
  };

  return (
    <nav aria-label={label} className="flex items-center gap-0.5 rounded-xl border border-border bg-card/70 p-1">
      {tabs.map((tab) => (
        <TabLink key={tab.key} href={hrefOf(tab.href)} active={tab.key === active} indicatorId={indicatorId} testId={`tab-${tab.key}`}>
          <tab.icon aria-hidden="true" size={14} weight="duotone" className="shrink-0 max-[419px]:hidden" />
          {tab.label}
        </TabLink>
      ))}
    </nav>
  );
}
