import {
  ChartDonutIcon,
  ArrowClockwiseIcon,
  FileSearchIcon,
  HouseIcon,
  LockKeyIcon,
  ScalesIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type NavigationKey = "overview" | "allocation" | "imports" | "refresh";

type AppShellProps = {
  active: NavigationKey;
  children: ReactNode;
};

const navigation = [
  { key: "overview", label: "Visão geral", href: "/", icon: HouseIcon },
  {
    key: "allocation",
    label: "Alocação",
    href: "/alocacao",
    icon: ScalesIcon,
  },
  {
    key: "refresh",
    label: "Atualização",
    href: "/atualizacao",
    icon: ArrowClockwiseIcon,
  },
  {
    key: "imports",
    label: "Revisão de dados",
    href: "/importacao",
    icon: FileSearchIcon,
  },
] as const;

export function AppShell({ active, children }: AppShellProps) {
  return (
    <main className="app-canvas min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto min-h-[100dvh] max-w-[1720px] lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="relative z-20 hidden border-r border-sidebar-border bg-sidebar/90 px-4 py-5 backdrop-blur-xl lg:flex lg:min-h-[100dvh] lg:flex-col lg:py-6">
          <ProductMark />

          <nav aria-label="Navegação principal" className="mt-10 space-y-1">
            <p className="px-3 pb-2 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/70 uppercase">
              Principal
            </p>
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = item.key === active;

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm outline-none transition-[color,background-color,box-shadow] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring/50",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_18%,transparent)]"
                      : "text-muted-foreground hover:bg-white/[0.035] hover:text-foreground",
                  )}
                >
                  {isActive ? (
                    <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" />
                  ) : null}
                  <Icon
                    aria-hidden="true"
                    size={18}
                    weight={isActive ? "fill" : "regular"}
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-2xl border border-white/[0.055] bg-white/[0.025] p-3.5">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <LockKeyIcon aria-hidden="true" size={15} weight="duotone" />
              </span>
              <div>
                <p className="text-xs font-medium text-foreground">Ambiente privado</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Somente neste computador</p>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border/80 bg-background/88 px-5 backdrop-blur-xl sm:px-7 lg:hidden">
            <ProductMark compact />
            <nav aria-label="Navegação móvel" className="flex items-center gap-1 rounded-xl border border-border bg-card/70 p-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = item.key === active;

                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    aria-label={item.label}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "grid size-8 place-items-center rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon aria-hidden="true" size={16} weight={isActive ? "fill" : "regular"} />
                  </Link>
                );
              })}
            </nav>
          </header>

          <div className="relative min-h-[100dvh] overflow-hidden">{children}</div>
        </div>
      </div>
    </main>
  );
}

function ProductMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span className="brand-mark grid size-9 place-items-center rounded-xl text-primary-foreground">
        <ChartDonutIcon aria-hidden="true" size={18} weight="bold" />
      </span>
      <span className={cn("leading-none", compact && "sr-only sm:not-sr-only")}>
        <span className="block text-[13px] font-semibold tracking-[-0.015em] text-foreground">
          Meu portfólio
        </span>
        <span className="mt-1 block text-[9px] font-semibold tracking-[0.18em] text-primary/80 uppercase">
          Private workspace
        </span>
      </span>
    </Link>
  );
}
