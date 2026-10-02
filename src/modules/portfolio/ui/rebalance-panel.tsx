"use client";

import { useQueryState } from "nuqs";

import { cn } from "@/lib/utils";
import type {
  AllocationGroup,
  AllocationGroupKey,
  AllocationRow,
} from "@/modules/portfolio/domain/rebalance";
import { categoryColor } from "@/modules/portfolio/presentation/category-colors";
import { formatBrl, formatSharePercent } from "@/modules/portfolio/presentation/portfolio-format";

type SliceDefinition = {
  key: string;
  label: string;
  group: AllocationGroupKey;
  parentClass?: string;
};

const CLASSIFICATIONS: { key: string; label: string; slices: SliceDefinition[] }[] = [
  {
    key: "geral",
    label: "Geral",
    slices: [
      { key: "classe", label: "Classe", group: "ASSET_CLASS" },
      { key: "moeda", label: "Moeda", group: "CURRENCY" },
      { key: "estrategia", label: "Estratégia", group: "STRATEGY" },
    ],
  },
  {
    key: "caixa",
    label: "Caixa",
    slices: [{ key: "moeda", label: "Moeda", group: "CLASS_CURRENCY", parentClass: "Caixa" }],
  },
  {
    key: "renda-fixa",
    label: "Renda Fixa",
    slices: [{ key: "subclasse", label: "Subclasse", group: "FIXED_INCOME" }],
  },
  {
    key: "renda-variavel",
    label: "Renda Variável",
    slices: [{ key: "subclasse", label: "Subclasse", group: "VARIABLE_INCOME" }],
  },
];

export function RebalancePanel({
  groups,
  tolerance,
}: {
  groups: AllocationGroup[];
  tolerance: number;
}) {
  const [classification, setClassification] = useQueryState("corte", {
    defaultValue: "geral",
    clearOnDefault: true,
  });
  const [slice, setSlice] = useQueryState("sub", { defaultValue: "", clearOnDefault: true });

  const activeClassification =
    CLASSIFICATIONS.find((entry) => entry.key === classification) ?? CLASSIFICATIONS[0];
  const activeSlice =
    activeClassification.slices.find((entry) => entry.key === slice) ?? activeClassification.slices[0];

  const group = groups.find((entry) => entry.key === activeSlice.group);
  const allRows = group?.rows ?? [];
  const rows = activeSlice.parentClass
    ? allRows.filter((row) => row.label.startsWith(`${activeSlice.parentClass} ·`))
    : allRows;

  const toSell = rows
    .filter((row) => row.direction === "SELL")
    .sort((left, right) => Math.abs(right.differenceBrl ?? 0) - Math.abs(left.differenceBrl ?? 0));
  const toBuy = rows
    .filter((row) => row.direction === "BUY")
    .sort((left, right) => Math.abs(right.differenceBrl ?? 0) - Math.abs(left.differenceBrl ?? 0));
  const balanced = rows.filter((row) => row.direction === "BALANCED" || row.direction === null);
  const maxDifference = Math.max(
    ...rows.map((row) => Math.abs(row.differenceBrl ?? 0)),
    1,
  );

  return (
    <section
      id="rebalanceamento"
      className="premium-panel scroll-mt-32 rounded-[24px] p-5 sm:p-7"
      aria-labelledby="rebalance-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="rebalance-title" className="text-base font-semibold tracking-[-0.025em]">
            Comprar e vender
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Diferença entre o valor atual e o ideal. Itens dentro de ±{tolerance}% ficam equilibrados.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-card/60 p-0.5">
          {CLASSIFICATIONS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              aria-pressed={entry.key === activeClassification.key}
              onClick={() => {
                void setClassification(entry.key);
                void setSlice("");
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                entry.key === activeClassification.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {activeClassification.slices.length > 1 ? (
          <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-card/60 p-0.5">
            {activeClassification.slices.map((entry) => (
              <button
                key={entry.key}
                type="button"
                aria-pressed={entry.key === activeSlice.key}
                onClick={() => void setSlice(entry.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                  entry.key === activeSlice.key
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border/60 text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
              <th className="py-3 pr-3">Item</th>
              <th className="py-3 pr-3 text-right">% atual</th>
              <th className="py-3 pr-3 text-right">% ideal</th>
              <th className="py-3 pr-3 text-right">R$ atual</th>
              <th className="py-3 pr-3 text-right">R$ ideal</th>
              <th className="py-3 text-right">Diferença</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/55">
            {toBuy.length > 0 ? (
              <ActionHeader label="Comprar" tone="buy" count={toBuy.length} />
            ) : null}
            {toBuy.map((row) => (
              <RebalanceRow key={row.key} row={row} maxDifference={maxDifference} />
            ))}

            {toSell.length > 0 ? (
              <ActionHeader label="Vender" tone="sell" count={toSell.length} />
            ) : null}
            {toSell.map((row) => (
              <RebalanceRow key={row.key} row={row} maxDifference={maxDifference} />
            ))}

            {balanced.length > 0 ? (
              <ActionHeader label="Equilibrado" tone="balanced" count={balanced.length} />
            ) : null}
            {balanced.map((row) => (
              <RebalanceRow key={row.key} row={row} maxDifference={maxDifference} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ActionHeader({
  label,
  tone,
  count,
}: {
  label: string;
  tone: "buy" | "sell" | "balanced";
  count: number;
}) {
  return (
    <tr>
      <td colSpan={6} className="pt-5 pb-2">
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] uppercase",
            tone === "sell"
              ? "bg-destructive/10 text-destructive"
              : tone === "buy"
                ? "bg-primary/10 text-primary"
                : "bg-white/[0.05] text-muted-foreground",
          )}
        >
          {label} · {count}
        </span>
      </td>
    </tr>
  );
}

function RebalanceRow({ row, maxDifference }: { row: AllocationRow; maxDifference: number }) {
  const difference = row.differenceBrl ?? 0;
  const width = Math.min((Math.abs(difference) / maxDifference) * 50, 50);

  return (
    <tr className="transition-colors duration-150 hover:bg-white/[0.018]">
      <td className="py-3 pr-3">
        <div className="flex items-center gap-2.5">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: categoryColor(row.label.split(" · ").at(-1) ?? row.label) }}
          />
          <span className="text-xs text-foreground/90">{row.label}</span>
        </div>
      </td>
      <td className="py-3 pr-3 text-right font-mono text-[11px] text-foreground/80">
        {formatSharePercent(row.currentShare)}
      </td>
      <td className="py-3 pr-3 text-right font-mono text-[11px] text-muted-foreground">
        {row.targetShare === null ? "—" : formatSharePercent(row.targetShare)}
      </td>
      <td className="py-3 pr-3 text-right font-mono text-[11px] text-foreground/80">
        {formatBrl(row.currentBrl)}
      </td>
      <td className="py-3 pr-3 text-right font-mono text-[11px] text-muted-foreground">
        {row.targetBrl === null ? "—" : formatBrl(row.targetBrl)}
      </td>
      <td className="py-3">
        <div className="flex items-center justify-end gap-3">
          <div aria-hidden="true" className="relative hidden h-1.5 w-28 sm:block">
            <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
            {row.differenceBrl === null ? null : (
              <span
                className={cn(
                  "absolute inset-y-0 rounded-full",
                  difference > 0 ? "left-1/2 bg-destructive/70" : "right-1/2 bg-primary/70",
                )}
                style={{ width: `${width}%` }}
              />
            )}
          </div>
          <span
            className={cn(
              "w-28 shrink-0 text-right font-mono text-[11px]",
              row.direction === "SELL"
                ? "text-destructive"
                : row.direction === "BUY"
                  ? "text-primary"
                  : "text-muted-foreground",
            )}
          >
            {row.differenceBrl === null ? "sem meta" : formatBrl(difference)}
          </span>
        </div>
      </td>
    </tr>
  );
}
