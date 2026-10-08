"use client";

import { Drawer } from "@base-ui/react/drawer";
import {
  ChartDonutIcon,
  ChartLineUpIcon,
  CircleNotchIcon,
  ListIcon,
  PiggyBankIcon,
  SidebarSimpleIcon,
  SignOutIcon,
  UserCircleIcon,
  UsersThreeIcon,
  WalletIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react/dist/lib/types";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { showAppToast } from "@/components/product/app-toaster";
import { confirmDiscardChanges } from "@/components/product/unsaved-changes";
import { cn } from "@/lib/utils";
import { SIDEBAR_COOKIE, type AppArea, type AreaKey } from "@/modules/access/domain/areas";
import { authClient } from "@/modules/auth/auth-client";

// Navegação entre as áreas (spec 081): barra lateral no computador (a partir de
// 1024 px), recolhível, e menu hambúrguer no celular. Só aparece para quem tem
// mais de uma área; quem usa só Investimentos continua com o topo de sempre.
// As áreas vêm do servidor, já filtradas pelas concessões do usuário.

const AREA_ICONS: Record<AreaKey, Icon> = {
  investments: ChartLineUpIcon,
  "family-expenses": UsersThreeIcon,
  income: WalletIcon,
  pension: PiggyBankIcon,
};

type AreaNavProps = {
  areas: readonly AppArea[];
  active: AreaKey;
  user: { name: string; email: string };
};

function groupsOf(areas: readonly AppArea[]) {
  const groups = new Map<string, AppArea[]>();

  for (const area of areas) {
    groups.set(area.group, [...(groups.get(area.group) ?? []), area]);
  }

  return [...groups.entries()];
}

/** Investimentos guarda a competência aberta ao voltar para a área. */
function useAreaHref() {
  const month = useSearchParams().get("mes");
  return (area: AppArea) => (area.key === "investments" && month ? `${area.href}?mes=${month}` : area.href);
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className="brand-mark grid size-9 shrink-0 place-items-center rounded-xl text-primary-foreground">
        <ChartDonutIcon aria-hidden="true" size={18} weight="bold" />
      </span>
      <span className={cn("min-w-0 leading-none", compact && "sr-only")}>
        <span className="block truncate text-[13px] font-semibold tracking-[-0.015em] text-foreground">Meu portfólio</span>
        <span className="mt-1 block text-[9px] font-semibold tracking-[0.18em] text-primary/80 uppercase">
          Private workspace
        </span>
      </span>
    </span>
  );
}

function AreaLinks({
  areas,
  active,
  compact = false,
  onNavigate,
}: {
  areas: readonly AppArea[];
  active: AreaKey;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const hrefOf = useAreaHref();

  return (
    <div className="space-y-6">
      {groupsOf(areas).map(([group, items]) => (
        <div key={group}>
          <p
            className={cn(
              "mb-2 px-3 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/80 uppercase",
              compact && "sr-only",
            )}
          >
            {group}
          </p>
          <ul className="space-y-1">
            {items.map((area) => {
              const Icon = AREA_ICONS[area.key];
              const current = area.key === active;

              return (
                <li key={area.key}>
                  <Link
                    href={hrefOf(area)}
                    aria-current={current ? "page" : undefined}
                    title={compact ? area.label : undefined}
                    data-testid={`area-link-${area.key}`}
                    onClick={(event) => {
                      if (!confirmDiscardChanges()) {
                        event.preventDefault();
                        return;
                      }
                      onNavigate?.();
                    }}
                    className={cn(
                      "group/area relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/50",
                      compact && "justify-center px-0",
                      current
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                    )}
                  >
                    {current ? (
                      <span aria-hidden="true" className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-r-full bg-primary" />
                    ) : null}
                    <Icon
                      aria-hidden="true"
                      size={18}
                      weight="duotone"
                      className={cn("shrink-0", current ? "text-primary" : "text-muted-foreground group-hover/area:text-foreground")}
                    />
                    <span className={cn("truncate", compact && "sr-only")}>{area.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function useSignOut() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  const signOut = async () => {
    setLeaving(true);
    const result = await authClient.signOut();

    if (result.error) {
      setLeaving(false);
      showAppToast({ tone: "error", title: "Não foi possível sair agora. Tente de novo." });
      return;
    }

    router.replace("/entrar");
    router.refresh();
  };

  return { leaving, signOut };
}

function AccountFooter({ user, compact = false }: { user: AreaNavProps["user"]; compact?: boolean }) {
  const { leaving, signOut } = useSignOut();

  return (
    <div className={cn("flex items-center gap-2.5 rounded-xl border border-sidebar-border bg-white/[0.02] p-2", compact && "flex-col p-1.5")}>
      <UserCircleIcon aria-hidden="true" size={26} weight="duotone" className="shrink-0 text-primary" />
      <div className={cn("min-w-0 flex-1", compact && "sr-only")}>
        <p className="truncate text-xs font-medium text-foreground">{user.name}</p>
        <p className="truncate text-[10px] text-muted-foreground">{user.email}</p>
      </div>
      <button
        type="button"
        onClick={signOut}
        disabled={leaving}
        aria-label="Sair"
        title="Sair"
        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
      >
        {leaving ? (
          <CircleNotchIcon aria-hidden="true" size={15} className="animate-spin" />
        ) : (
          <SignOutIcon aria-hidden="true" size={15} />
        )}
      </button>
    </div>
  );
}

/**
 * Barra lateral do computador. Recolhida, fica só com os ícones; a escolha
 * fica num cookie, para a página já vir do servidor na largura certa.
 */
export function AreaSidebar({ areas, active, user, collapsed: initiallyCollapsed }: AreaNavProps & { collapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <aside
      data-testid="area-sidebar"
      data-collapsed={collapsed || undefined}
      className={cn(
        "sticky top-0 hidden h-[100dvh] shrink-0 flex-col border-r border-sidebar-border bg-sidebar pt-[env(safe-area-inset-top,0px)] transition-[width] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] lg:flex",
        collapsed ? "w-[72px]" : "w-[248px]",
      )}
    >
      {/* O recolher fica no topo, só o ícone, no lugar do X da gaveta do celular. */}
      <div
        className={cn(
          "flex shrink-0 items-center",
          collapsed ? "flex-col gap-2 pt-3.5 pb-1.5" : "h-16 justify-between gap-2 pr-3 pl-4",
        )}
      >
        <Link
          href="/"
          aria-label={collapsed ? "Meu portfólio" : undefined}
          className="min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Brand compact={collapsed} />
        </Link>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expandir o menu" : "Recolher o menu"}
          title={collapsed ? "Expandir o menu" : "Recolher o menu"}
          data-testid="area-sidebar-toggle"
          className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-white/[0.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <SidebarSimpleIcon aria-hidden="true" size={17} weight="bold" />
        </button>
      </div>

      <nav aria-label="Áreas" className={cn("min-h-0 flex-1 overflow-y-auto px-3 pt-4", collapsed && "px-2.5 pt-2")}>
        <AreaLinks areas={areas} active={active} compact={collapsed} />
      </nav>

      <div className={cn("shrink-0 p-3", collapsed && "px-2.5")}>
        <AccountFooter user={user} compact={collapsed} />
      </div>
    </aside>
  );
}

/**
 * Menu hambúrguer do celular e dos tablets: abre uma gaveta pela esquerda,
 * com o foco preso nela, fecha no Esc, no fundo, no X, ao arrastar para a
 * esquerda e ao escolher uma área, e devolve o foco ao botão.
 */
export function AreaMenuButton({ areas, active, user, className }: AreaNavProps & { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} swipeDirection="left">
      <Drawer.Trigger
        aria-label="Abrir o menu das áreas"
        data-testid="area-menu-button"
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-card/70 text-foreground outline-none transition-colors hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-ring/50",
          className,
        )}
      >
        <ListIcon aria-hidden="true" size={18} weight="bold" />
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-black/60 opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-[350ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:duration-0 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Drawer.Viewport className="fixed inset-0 z-50 flex justify-start">
          <Drawer.Popup
            data-testid="area-menu"
            className="flex h-full w-[min(300px,calc(100vw-3.5rem))] flex-col border-r border-sidebar-border bg-sidebar pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] text-foreground shadow-2xl outline-none [transform:translateX(var(--drawer-swipe-movement-x))] transition-transform duration-[350ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:select-none data-ending-style:[transform:translateX(-100%)] data-starting-style:[transform:translateX(-100%)]"
          >
            <div className="flex h-16 shrink-0 items-center justify-between gap-3 px-4">
              <Drawer.Title className="min-w-0">
                <Brand />
              </Drawer.Title>
              <Drawer.Close
                aria-label="Fechar o menu"
                className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <XIcon aria-hidden="true" size={16} weight="bold" />
              </Drawer.Close>
            </div>
            <Drawer.Content className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-4">
              <nav aria-label="Áreas">
                <AreaLinks areas={areas} active={active} onNavigate={() => setOpen(false)} />
              </nav>
            </Drawer.Content>
            <div className="shrink-0 p-3">
              <AccountFooter user={user} />
            </div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
