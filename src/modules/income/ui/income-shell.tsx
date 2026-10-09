import type { ReactNode } from "react";

import { AppFrame } from "@/components/product/app-frame";
import { IncomeTabs, type IncomeTab } from "@/modules/income/ui/income-tabs";

/**
 * Recebimentos tem duas abas (spec 098): o mês a mês e as Horas extras. As
 * abas ficam numa barra fixa no topo, como em Investimentos, e o botão do menu
 * das áreas entra nela no celular, à esquerda.
 */
export function IncomeShell({ tab, children }: { tab: IncomeTab; children: ReactNode }) {
  return (
    <AppFrame
      area="income"
      header={(menu) => (
        <header className="sticky top-0 z-30 border-b border-border/70 bg-background/88 backdrop-blur-xl">
          <div className="grid h-16 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-4 sm:px-6">
            <div className="flex min-w-0 items-center">{menu}</div>
            <div className="min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <IncomeTabs active={tab} />
            </div>
            <div />
          </div>
        </header>
      )}
    >
      {children}
    </AppFrame>
  );
}
