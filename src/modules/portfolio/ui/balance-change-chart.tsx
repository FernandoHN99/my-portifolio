"use client";

import { useQueryState } from "nuqs";
import { useTransition } from "react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { HistorySlot } from "@/modules/portfolio/domain/position-history";
import { formatBrl, formatPercent } from "@/modules/portfolio/presentation/portfolio-format";
import { formatSignedBrl, monthLabel } from "@/modules/portfolio/presentation/position-page";

type ChangeRow = {
  month: string;
  label: string;
  slot: HistorySlot;
  change: number | null;
};

/**
 * Saldos sem cotação não têm gráfico de preço: no lugar dele, a variação do
 * saldo de uma competência para a anterior, que mistura rendimentos, aportes e
 * resgates. Lacunas ficam sem barra.
 */
export function BalanceChangeChart({
  slots,
  selectedMonth,
  scope,
}: {
  slots: HistorySlot[];
  selectedMonth: string;
  scope: "account" | "all";
}) {
  const [, startTransition] = useTransition();
  const [, setMonth] = useQueryState("mes", { shallow: false, startTransition });
  const firstIndex = slots.findIndex((slot) => slot.kind === "present");
  const rows: ChangeRow[] =
    firstIndex === -1
      ? []
      : slots.slice(firstIndex).map((slot) => ({
          month: slot.month,
          label: monthLabel(slot.month),
          slot,
          change: slot.kind === "present" && slot.step ? slot.step.changeBrl : null,
        }));
  const byLabel = new Map(rows.map((row) => [row.label, row]));

  if (!rows.some((row) => row.change !== null)) {
    return (
      <div className="grid h-[220px] place-items-center rounded-xl border border-dashed border-border/70 px-6 text-center text-[11px] leading-5 text-muted-foreground">
        Ainda não há duas competências seguidas com a posição para comparar o saldo.
      </div>
    );
  }

  return (
    <div className="h-[260px] w-full" data-testid="balance-change-chart">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart
          data={rows}
          margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
          onClick={(state) => {
            const row = byLabel.get(String(state?.activeLabel ?? ""));

            if (row && row.slot.kind !== "missing" && row.month !== selectedMonth) {
              void setMonth(row.month);
            }
          }}
        >
          <XAxis
            axisLine={false}
            dataKey="label"
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            tickLine={false}
            minTickGap={12}
          />
          <YAxis
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            tickFormatter={(value: number) => formatBrl(value, { compact: true })}
            tickLine={false}
            width={62}
          />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Tooltip
            filterNull={false}
            cursor={{ fill: "oklch(1 0 0 / 0.04)" }}
            content={({ active, label }) => {
              const row = byLabel.get(String(label ?? ""));

              if (!active || !row) {
                return null;
              }

              const slot = row.slot;

              return (
                <div className="max-w-[240px] rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
                  <p className="text-[11px] font-medium text-foreground">{row.label}</p>
                  {slot.kind === "missing" ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">Sem competência no histórico</p>
                  ) : slot.kind === "absent" ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {scope === "account" ? "Fora desta conta" : "Fora da carteira"}
                    </p>
                  ) : slot.step ? (
                    <>
                      <p className="mt-1 font-mono text-xs text-foreground">{formatSignedBrl(slot.step.changeBrl)}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {slot.step.changePercent !== null ? `${formatPercent(slot.step.changePercent)} ` : ""}
                        desde {monthLabel(slot.step.fromMonth)} · saldo {formatBrl(slot.valueBrl)}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {slot.entryBrl !== null ? "Volta" : "Entrada"} com {formatBrl(slot.valueBrl)}
                    </p>
                  )}
                </div>
              );
            }}
          />
          <Bar dataKey="change" name="Variação do saldo" radius={[3, 3, 3, 3]} maxBarSize={28}>
            {rows.map((row) => (
              <Cell
                key={row.month}
                fill={(row.change ?? 0) >= 0 ? "var(--chart-up)" : "var(--chart-down)"}
                fillOpacity={row.month === selectedMonth ? 1 : 0.5}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
