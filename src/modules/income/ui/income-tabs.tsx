"use client";

import { ClockCountdownIcon, WalletIcon } from "@phosphor-icons/react/dist/ssr";

import { SectionTabs } from "@/components/product/section-tabs";

export type IncomeTab = "income" | "overtime";

const TABS = [
  { key: "income", label: "Recebimentos", href: "/recebimentos", icon: WalletIcon },
  { key: "overtime", label: "Horas extras", href: "/recebimentos/horas-extras", icon: ClockCountdownIcon },
] as const;

/** As abas de Recebimentos; o ano escolhido acompanha a troca. */
export function IncomeTabs({ active }: { active: IncomeTab }) {
  return <SectionTabs label="Telas de Recebimentos" tabs={TABS} active={active} keep={["ano"]} indicatorId="income-tab-indicator" />;
}
