"use client";

import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatCompetence, formatCompetenceLong } from "@/lib/competence";
import { formatCents } from "@/lib/money";
import type { YearSummary } from "@/modules/income/domain/income";
import { formatBrl } from "@/modules/portfolio/presentation/portfolio-format";
import { useTouchTooltip } from "@/modules/portfolio/ui/use-touch-tooltip";

type ChartRow = { month: string; label: string; spend: number; saved: number; spendCents: number; savedCents: number };

/**
 * Gastos × Poupado de cada mês do ano (spec 088). A paleta acessível do app
 * (spec 038) distingue gastos em laranja e poupado em azul. Um mês
 * que gastou mais do que entrou desce abaixo do zero. Meses só com holerite
 * ficam fora.
 */
export function IncomeChart({ summary, selectedMonth }: { summary: YearSummary; selectedMonth?: string | null }) {
  const touch = useTouchTooltip();
  const rows: ChartRow[] = summary.months
    .filter((month) => month.totals.hasValues)
    .map((month) => ({
      month: month.month,
      label: formatCompetence(month.month),
      spend: month.totals.spendCents / 100,
      saved: month.totals.balanceCents / 100,
      spendCents: month.totals.spendCents,
      savedCents: month.totals.balanceCents,
    }));
  const byLabel = new Map(rows.map((row) => [row.label, row]));

  if (rows.length === 0) {
    return (
      <div className="grid h-[220px] place-items-center rounded-xl border border-dashed border-border/70 px-6 text-center text-[11px] leading-5 text-muted-foreground">
        Nenhum mês com entradas ou saídas em {summary.year}.
      </div>
    );
  }

  return (
    <div data-testid="income-chart">
      <ul aria-label="Legenda" className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <li className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-2.5 rounded-[3px] bg-chart-down" />
          Gastos
        </li>
        <li className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-2.5 rounded-[3px] bg-chart-up" />
          Poupado
        </li>
      </ul>
      <div className="h-[280px] w-full" {...touch.containerProps}>
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={rows} barGap={3} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <XAxis
              axisLine={false}
              dataKey="label"
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickLine={false}
              minTickGap={8}
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
              cursor={{ fill: "oklch(1 0 0 / 0.04)" }}
              content={({ active, label }) => {
                const row = byLabel.get(String(label ?? ""));

                if (!active || !row) {
                  return null;
                }

                return (
                  <div className="min-w-[180px] rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
                    <p className="text-[11px] font-medium text-foreground">{formatCompetenceLong(row.month)}</p>
                    <div className="mt-2 space-y-0.5 text-[10px]">
                      <p className="flex justify-between gap-4 text-muted-foreground">
                        Gastos <span className="font-mono text-chart-down">{formatCents(row.spendCents)}</span>
                      </p>
                      <p className="flex justify-between gap-4 text-muted-foreground">
                        Poupado <span className="font-mono text-chart-up">{formatCents(row.savedCents, { signed: true })}</span>
                      </p>
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="spend" name="Gastos" maxBarSize={30} radius={[4, 4, 0, 0]}>
              {rows.map((row) => (
                <Cell key={row.month} fill="var(--chart-down)" fillOpacity={!selectedMonth || row.month === selectedMonth ? 0.9 : 0.45} />
              ))}
            </Bar>
            <Bar dataKey="saved" name="Poupado" maxBarSize={30} radius={[4, 4, 0, 0]}>
              {rows.map((row) => (
                <Cell key={row.month} fill="var(--chart-up)" fillOpacity={!selectedMonth || row.month === selectedMonth ? 0.95 : 0.45} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="sr-only">
        <table>
          <caption>Gastos e poupado por mês de {summary.year}</caption>
          <thead>
            <tr>
              <th>Mês</th>
              <th>Gastos</th>
              <th>Poupado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.month}>
                <td>{formatCompetenceLong(row.month)}</td>
                <td>{formatCents(row.spendCents)}</td>
                <td>{formatCents(row.savedCents, { signed: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
