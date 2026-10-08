"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatCompetence, formatCompetenceLong } from "@/lib/competence";
import { formatCents } from "@/lib/money";
import { savingsRatePercent, type YearSummary } from "@/modules/income/domain/income";
import { formatBrl } from "@/modules/portfolio/presentation/portfolio-format";
import { useTouchTooltip } from "@/modules/portfolio/ui/use-touch-tooltip";

type ChartRow = {
  month: string;
  label: string;
  spend: number;
  saved: number;
  incomeCents: number;
  spendCents: number;
  savedCents: number;
  rate: number | null;
};

const SAVED_FILL = "income-saved-fill";
const SPENT_FILL = "income-spent-fill";

/**
 * Gastos × Poupado de cada mês do ano (spec 088). Poupado em menta, a cor da
 * marca, e gastos em violeta (revisão de 2026-10-08, no lugar do laranja): o
 * par continua distinguível com daltonismo, como confere o guia de estilos.
 * Um mês que gastou mais do que entrou desce abaixo do zero. Meses só com
 * holerite ficam fora.
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
      incomeCents: month.totals.incomeCents,
      spendCents: month.totals.spendCents,
      savedCents: month.totals.balanceCents,
      rate: savingsRatePercent(month.totals.incomeCents, month.totals.balanceCents),
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
          <span className="size-2.5 rounded-[3px] bg-chart-spent" />
          Gastos
        </li>
        <li className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-2.5 rounded-[3px] bg-chart-saved" />
          Poupado
        </li>
      </ul>
      <div className="h-[280px] w-full" {...touch.containerProps}>
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={rows} barGap={4} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id={SAVED_FILL} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-saved)" stopOpacity={1} />
                <stop offset="100%" stopColor="var(--chart-saved)" stopOpacity={0.55} />
              </linearGradient>
              <linearGradient id={SPENT_FILL} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-spent)" stopOpacity={1} />
                <stop offset="100%" stopColor="var(--chart-spent)" stopOpacity={0.55} />
              </linearGradient>
            </defs>
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
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" strokeOpacity={0.55} />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Tooltip
              cursor={{ fill: "oklch(1 0 0 / 0.04)" }}
              content={({ active, label }) => {
                const row = byLabel.get(String(label ?? ""));

                if (!active || !row) {
                  return null;
                }

                return (
                  <div className="min-w-[200px] rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
                    <p className="text-[11px] font-medium text-foreground">{formatCompetenceLong(row.month)}</p>
                    <div className="mt-2.5 space-y-1 text-[10px]">
                      {/* A cor da série fica na marca; o valor, em texto neutro (guia de estilos). */}
                      <p className="flex items-center justify-between gap-4 text-muted-foreground">
                        Entradas
                        <span className="font-mono text-foreground">{formatCents(row.incomeCents)}</span>
                      </p>
                      <p className="flex items-center justify-between gap-4 text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <span aria-hidden="true" className="size-2 rounded-full bg-chart-spent" />
                          Gastos
                        </span>
                        <span className="font-mono text-foreground">{formatCents(row.spendCents)}</span>
                      </p>
                      <p className="flex items-center justify-between gap-4 text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <span aria-hidden="true" className="size-2 rounded-full bg-chart-saved" />
                          Poupado
                        </span>
                        <span className="font-mono text-foreground">{formatCents(row.savedCents, { signed: true })}</span>
                      </p>
                      {row.rate !== null ? (
                        <p className="flex items-center justify-between gap-4 border-t border-border/70 pt-1.5 text-muted-foreground">
                          Taxa de poupança
                          <span className="font-mono text-foreground">{row.rate}%</span>
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="spend" name="Gastos" maxBarSize={30} radius={[4, 4, 0, 0]}>
              {rows.map((row) => (
                <Cell key={row.month} fill={`url(#${SPENT_FILL})`} fillOpacity={!selectedMonth || row.month === selectedMonth ? 1 : 0.45} />
              ))}
            </Bar>
            <Bar dataKey="saved" name="Poupado" maxBarSize={30} radius={[4, 4, 0, 0]}>
              {rows.map((row) => (
                <Cell key={row.month} fill={`url(#${SAVED_FILL})`} fillOpacity={!selectedMonth || row.month === selectedMonth ? 1 : 0.45} />
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
