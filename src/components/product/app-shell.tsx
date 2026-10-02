import { ChartDonutIcon, GearSixIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";

import { MainTabs, type TabKey } from "@/components/product/main-tabs";
import { MonthTimeline } from "@/components/product/month-timeline";
import { QuoteRefreshIndicator } from "@/components/product/quote-refresh-indicator";
import { TabViewport } from "@/components/product/tab-viewport";
import type { PortfolioMonthSummary } from "@/modules/portfolio/application/get-portfolio-months";
import { getRequestQuoteRefreshSummary } from "@/modules/quotes/application/refresh-quotes";

type AppShellProps = {
  active: TabKey | "none";
  months: PortfolioMonthSummary[];
  selectedMonth: string | null;
  children: ReactNode;
};

export async function AppShell({ active, months, selectedMonth, children }: AppShellProps) {
  const quoteRefresh = await getRequestQuoteRefreshSummary();

  return (
    <main className="app-canvas min-h-[100dvh] bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/88 backdrop-blur-xl">
        {/* Abaixo de 360 px a marca sai para as abas, a hora das cotações e a
            configuração caberem sem cortar "Posições"; a aba Visão Geral
            leva ao mesmo endereço. */}
        <div className="flex h-16 items-center justify-between gap-2 px-4 sm:gap-3 sm:px-6">
          <Link
            href="/"
            className="inline-flex shrink-0 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50 max-[359px]:hidden"
          >
            <span className="brand-mark grid size-9 place-items-center rounded-xl text-primary-foreground">
              <ChartDonutIcon aria-hidden="true" size={18} weight="bold" />
            </span>
            <span className="hidden leading-none sm:block">
              <span className="block text-[13px] font-semibold tracking-[-0.015em] text-foreground">
                Meu portfólio
              </span>
              <span className="mt-1 block text-[9px] font-semibold tracking-[0.18em] text-primary/80 uppercase">
                Private workspace
              </span>
            </span>
          </Link>

          <div className="min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <MainTabs active={active} />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <QuoteRefreshIndicator summary={quoteRefresh} />
            <Link
              href="/configuracao"
              aria-label="Configuração da carteira"
              className="grid size-9 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <GearSixIcon aria-hidden="true" size={17} weight="duotone" />
            </Link>
          </div>
        </div>

        {selectedMonth ? (
          <MonthTimeline months={months} selectedMonth={selectedMonth} />
        ) : null}
      </header>

      <TabViewport active={active}>{children}</TabViewport>
    </main>
  );
}
