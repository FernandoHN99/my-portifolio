"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

export type TabKey = "overview" | "positions";

export const MAIN_TABS = [
  { key: "overview", label: "Visão Geral", href: "/" },
  { key: "positions", label: "Posições", href: "/posicoes" },
] as const;

export function MainTabs({ active }: { active: TabKey | "none" }) {
  const searchParams = useSearchParams();
  const month = searchParams.get("mes");

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
            className={cn(
              "relative rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/50",
              isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {isActive ? (
              <motion.span
                layoutId="main-tab-indicator"
                className="absolute inset-0 rounded-lg bg-primary"
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
              />
            ) : null}
            <span className="relative z-10">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
