import type { AllocationGroupKey } from "@/modules/portfolio/domain/rebalance";

export const TARGET_SCOPES: { scope: AllocationGroupKey; title: string; description: string }[] = [
  { scope: "ASSET_CLASS", title: "Classe de ativos", description: "Sobre o patrimônio total." },
  { scope: "CURRENCY", title: "Moeda", description: "Sobre o patrimônio total." },
  { scope: "STRATEGY", title: "Estratégia", description: "Sobre o patrimônio total." },
  { scope: "CLASS_CURRENCY", title: "Moeda dentro de cada classe", description: "Cada classe soma 100%." },
  { scope: "FIXED_INCOME", title: "Renda fixa: subclasse × resgate", description: "Sobre o total de renda fixa." },
  { scope: "VARIABLE_INCOME", title: "Renda variável", description: "Sobre o total de renda variável." },
];

export function targetGroupKey(scope: string, primaryLabel: string) {
  return scope === "CLASS_CURRENCY" ? `${scope}:${primaryLabel}` : scope;
}
