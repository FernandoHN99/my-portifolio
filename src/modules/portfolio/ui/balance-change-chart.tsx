"use client";

import { useState } from "react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { cn } from "@/lib/utils";
import type { HistorySlot } from "@/modules/portfolio/domain/position-history";
import { formatBrl, formatPercent } from "@/modules/portfolio/presentation/portfolio-format";
import { formatSignedBrl, monthLabel } from "@/modules/portfolio/presentation/position-page";
import { useTouchTooltip } from "@/modules/portfolio/ui/use-touch-tooltip";

type ChangeRow = {
  month: string;
  label: string;
  slot: HistorySlot;
  change: number | null;
  /** Aportes menos retiradas do mês, quando conhecidos. */
  flow: number | null;
  /** O restante da variação: rendimento e, nos cotados, o efeito de preço. */
  income: number | null;
  /** Variação sem separação, no legado de saldos sem cotação. */
  mixed: number | null;
};

type Period = "6m" | "12m" | "ytd" | "all";

const PERIODS: { key: Period; label: string }[] = [
  { key: "6m", label: "6M" },
  { key: "12m", label: "12M" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "Tudo" },
];

/**
 * Variação do saldo de uma competência para a anterior, em todas as posições
 * (spec 073): cada barra separa aportes e retiradas do rendimento do mês, que
 * nos ativos cotados inclui a variação da cotação. No legado sem movimentações
 * de um saldo em reais, a variação fica numa barra só. Lacunas ficam sem barra.
 * O período (spec 075) termina na competência selecionada; "Tudo" mostra o
 * histórico inteiro.
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
  const touch = useTouchTooltip();
  const [period, setPeriod] = useState<Period>("12m");
  const firstIndex = slots.findIndex((slot) => slot.kind === "present");
  const allRows: ChangeRow[] =
    firstIndex === -1
      ? []
      : slots.slice(firstIndex).map((slot) => {
          const step = slot.kind === "present" ? slot.step : null;
          const change = step ? step.changeBrl : null;
          const known = step && (step.source !== "estimated" || step.priceEffectBrl !== null);
          const flow = step && known ? roundCents((step.flowBrl ?? 0) + (step.internalBrl ?? 0)) : null;

          return {
            month: slot.month,
            label: monthLabel(slot.month),
            slot,
            change,
            flow,
            income: change !== null && flow !== null ? roundCents(change - flow) : null,
            mixed: change !== null && flow === null ? change : null,
          };
        });
  const rows = periodRows(allRows, selectedMonth, period);
  const byLabel = new Map(rows.map((row) => [row.label, row]));

  const hasMixed = rows.some((row) => row.mixed !== null);

  if (!allRows.some((row) => row.change !== null)) {
    return (
      <div className="grid h-[220px] place-items-center rounded-xl border border-dashed border-border/70 px-6 text-center text-[11px] leading-5 text-muted-foreground">
        Sem competências seguidas para comparar.
      </div>
    );
  }

  return (
    <div data-testid="balance-change-chart">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <ul aria-label="Legenda" className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <li className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-2.5 rounded-[3px] bg-chart-up" />
          Rendimento
        </li>
        <li className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-2.5 rounded-[3px] bg-chart-down" />
          Rendimento negativo
        </li>
        <li className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-2.5 rounded-[3px] bg-foreground/30" />
          Aportes e retiradas
        </li>
        {hasMixed ? (
          <li className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="size-2.5 rounded-[3px] bg-foreground/60" />
            Variação sem movimentações registradas
          </li>
        ) : null}
      </ul>
      <div role="group" aria-label="Período da variação mensal" className="flex items-center gap-0.5 rounded-lg border border-border bg-card/60 p-0.5">
        {PERIODS.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={period === option.key}
            onClick={() => setPeriod(option.key)}
            className={cn(
              "rounded-md px-2.5 py-1 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
              period === option.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      </div>
      <div className="h-[260px] w-full" {...touch.containerProps}>
      <ResponsiveContainer height="100%" width="100%">
        <BarChart
          data={rows}
          stackOffset="sign"
          margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
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
                      {row.flow !== null ? (
                        <div className="mt-2 space-y-0.5 text-[10px]">
                          <p className="flex justify-between gap-4 text-muted-foreground">
                            Aportes e retiradas <span className="font-mono text-foreground">{formatSignedBrl(row.flow)}</span>
                          </p>
                          <p className="flex justify-between gap-4 text-muted-foreground">
                            Rendimento <span className="font-mono text-foreground">{formatSignedBrl(row.income ?? 0)}</span>
                          </p>
                        </div>
                      ) : null}
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
          <Bar dataKey="flow" name="Aportes e retiradas" stackId="change" maxBarSize={28}>
            {rows.map((row) => (
              <Cell key={row.month} fill="var(--foreground)" fillOpacity={row.month === selectedMonth ? 0.42 : 0.2} />
            ))}
          </Bar>
          <Bar dataKey="income" name="Rendimento" stackId="change" maxBarSize={28}>
            {rows.map((row) => (
              <Cell
                key={row.month}
                fill={(row.income ?? 0) >= 0 ? "var(--chart-up)" : "var(--chart-down)"}
                fillOpacity={row.month === selectedMonth ? 1 : 0.55}
              />
            ))}
          </Bar>
          <Bar dataKey="mixed" name="Variação do saldo" stackId="change" maxBarSize={28}>
            {rows.map((row) => (
              <Cell key={row.month} fill="var(--foreground)" fillOpacity={row.month === selectedMonth ? 0.75 : 0.45} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Meses do período, terminando na competência selecionada. */
function periodRows(rows: ChangeRow[], selectedMonth: string, period: Period) {
  if (period === "all" || rows.length === 0) {
    return rows;
  }

  const selectedIndex = rows.findIndex((row) => row.month === selectedMonth);
  const end = selectedIndex === -1 ? rows.length - 1 : selectedIndex;

  if (period === "ytd") {
    const year = rows[end].month.slice(0, 4);
    return rows.slice(0, end + 1).filter((row) => row.month.startsWith(`${year}-`));
  }

  const size = period === "6m" ? 6 : 12;
  return rows.slice(Math.max(end - size + 1, 0), end + 1);
}

function roundCents(value: number) {
  return Math.round(value * 100) / 100;
}
