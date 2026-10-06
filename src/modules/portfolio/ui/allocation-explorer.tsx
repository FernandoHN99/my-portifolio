"use client";

import { motion, useReducedMotion, type Transition } from "motion/react";
import { useQueryState } from "nuqs";

import { cn } from "@/lib/utils";
import type { FixedIncomeDuration } from "@/modules/portfolio/domain/fixed-income-duration";
import type { AllocationGroup, AllocationGroupKey } from "@/modules/portfolio/domain/rebalance";
import { AllocationBars } from "@/modules/portfolio/ui/allocation-bars";
import { FixedIncomeDurationChart } from "@/modules/portfolio/ui/fixed-income-duration-chart";
import { RebalancePanel } from "@/modules/portfolio/ui/rebalance-panel";

type SliceDefinition = {
  key: string;
  label: string;
  group: AllocationGroupKey;
  /** Título do gráfico do recorte. */
  chartTitle: string;
  /** Linhas de uma classe só, como as moedas do caixa. */
  parentClass?: string;
};

const CLASSIFICATIONS: { key: string; label: string; slices: SliceDefinition[] }[] = [
  {
    key: "geral",
    label: "Geral",
    slices: [
      { key: "classe", label: "Classe", group: "ASSET_CLASS", chartTitle: "Classe de ativos" },
      { key: "moeda", label: "Moeda", group: "CURRENCY", chartTitle: "Moeda" },
      { key: "estrategia", label: "Estratégia", group: "STRATEGY", chartTitle: "Estratégia" },
    ],
  },
  {
    key: "caixa",
    label: "Caixa",
    slices: [{ key: "moeda", label: "Moeda", group: "CLASS_CURRENCY", parentClass: "Caixa", chartTitle: "Caixa por moeda" }],
  },
  {
    key: "renda-fixa",
    label: "Renda Fixa",
    slices: [{ key: "subclasse", label: "Subclasse", group: "FIXED_INCOME", chartTitle: "Renda fixa por resgate" }],
  },
  {
    key: "renda-variavel",
    label: "Renda Variável",
    slices: [{ key: "subclasse", label: "Subclasse", group: "VARIABLE_INCOME", chartTitle: "Renda variável por subclasse" }],
  },
];

const SPRING: Transition = { type: "spring", stiffness: 420, damping: 36 };

/**
 * Alocação da Visão geral (spec 078): as abas Geral, Caixa, Renda Fixa e Renda
 * Variável ficam fora de comprar e vender e escolhem, juntas, o gráfico de cima
 * e as linhas de comprar e vender de baixo. A evolução e o tipo de ativo ficam
 * sempre à vista, fora deste bloco.
 */
export function AllocationExplorer({
  groups,
  fixedIncomeDuration,
}: {
  groups: AllocationGroup[];
  fixedIncomeDuration: FixedIncomeDuration;
}) {
  const [classification, setClassification] = useQueryState("corte", { defaultValue: "geral", clearOnDefault: true });
  const [slice, setSlice] = useQueryState("sub", { defaultValue: "", clearOnDefault: true });

  const activeClassification = CLASSIFICATIONS.find((entry) => entry.key === classification) ?? CLASSIFICATIONS[0];
  const activeSlice = activeClassification.slices.find((entry) => entry.key === slice) ?? activeClassification.slices[0];
  const allRows = groups.find((entry) => entry.key === activeSlice.group)?.rows ?? [];
  const rows = activeSlice.parentClass
    ? allRows.filter((row) => row.label.startsWith(`${activeSlice.parentClass} ·`))
    : allRows;
  const prefix = activeSlice.parentClass ? `${activeSlice.parentClass} · ` : "";
  const reduceMotion = useReducedMotion();

  return (
    <section id="alocacao" aria-label="Alocação" className="mt-6 scroll-mt-32 space-y-4">
      {/* Abas em dois níveis, uma embaixo da outra (spec 078): o recorte em cima
          e a divisão dele embaixo, menor, cada uma do tamanho do conteúdo. */}
      <div className="flex flex-col items-start gap-2">
        <div
          role="group"
          aria-label="Recorte da alocação"
          className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-border bg-card/70 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {CLASSIFICATIONS.map((entry) => {
            const active = entry.key === activeClassification.key;

            return (
              <button
                key={entry.key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  void setClassification(entry.key);
                  void setSlice("");
                }}
                className={cn(
                  "relative h-8 shrink-0 rounded-lg px-3 text-[12px] font-semibold whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 sm:px-3.5",
                  active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="allocation-tab"
                    className="absolute inset-0 rounded-lg bg-primary"
                    transition={reduceMotion ? { duration: 0 } : SPRING}
                  />
                ) : null}
                <span className="relative z-10">{entry.label}</span>
              </button>
            );
          })}
        </div>

        <div
          role="group"
          aria-label="Divisão do recorte"
          className="flex max-w-full items-center gap-0.5 overflow-x-auto pl-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {activeClassification.slices.map((entry) => {
            const active = entry.key === activeSlice.key;

            return (
              <button
                key={entry.key}
                type="button"
                aria-pressed={active}
                onClick={() => void setSlice(entry.key)}
                className={cn(
                  "relative h-7 shrink-0 rounded-md px-2.5 text-[11px] font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="allocation-slice"
                    className="absolute inset-0 rounded-md bg-white/[0.07] ring-1 ring-border"
                    transition={reduceMotion ? { duration: 0 } : SPRING}
                  />
                ) : null}
                <span className="relative z-10">{entry.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeSlice.group === "FIXED_INCOME" ? (
        <FixedIncomeDurationChart duration={fixedIncomeDuration} />
      ) : (
        <AllocationBars
          title={activeSlice.chartTitle}
          rows={rows.map((row) => ({
            label: row.label.startsWith(prefix) ? row.label.slice(prefix.length) : row.label,
            currentShare: row.currentShare,
            targetShare: row.targetShare,
          }))}
        />
      )}

      <RebalancePanel rows={rows} />
    </section>
  );
}
