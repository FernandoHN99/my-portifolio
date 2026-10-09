"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { filterBadge } from "@/components/product/page-controls";
import { formatCompetence, formatCompetenceLong } from "@/lib/competence";
import { formatCents } from "@/lib/money";
import type { OvertimeMonthView } from "@/modules/income/application/get-overtime-view";
import { formatHours, STATUS_LABELS } from "@/modules/income/domain/overtime";
import { formatBrl } from "@/modules/portfolio/presentation/portfolio-format";
import { useTouchTooltip } from "@/modules/portfolio/ui/use-touch-tooltip";

type Mode = "hours" | "values";

type Row = {
  month: string;
  label: string;
  onTime: number;
  late: number;
  overdue: number;
  awaiting: number;
  view: OvertimeMonthView;
};

// As séries seguem a linguagem de Recebimentos (guia de estilos): menta para o
// que entrou, violeta para o que falta e já venceu, neutro para o que ainda vai
// vencer. O pago com atraso é o menta mais claro; o nome na legenda e no
// tooltip continua dizendo qual é qual.
const SERIES = [
  { key: "onTime", label: "Pago no prazo", swatch: "bg-chart-saved", fill: "var(--chart-saved)", opacity: 1 },
  { key: "late", label: "Pago com atraso", swatch: "bg-chart-saved/45", fill: "var(--chart-saved)", opacity: 0.45 },
  { key: "overdue", label: "Vencido sem pagamento", swatch: "bg-chart-spent", fill: "var(--chart-spent)", opacity: 1 },
  { key: "awaiting", label: "A vencer", swatch: "bg-muted-foreground/35", fill: "var(--muted-foreground)", opacity: 0.35 },
] as const;

const OVERDUE = new Set(["OVERDUE", "PARTIAL"]);

/**
 * Horas extras por mês de trabalho (spec 098): cada barra é o que o mês deve
 * receber, dividido pelo que já foi pago (no holerite certo ou depois), o que
 * venceu sem pagamento e o que ainda vai vencer. Em valores, a mesma divisão
 * em reais: o recebido e a estimativa pelas regras do que falta.
 */
export function OvertimeChart({ months }: { months: OvertimeMonthView[] }) {
  const [mode, setMode] = useState<Mode>("hours");
  const touch = useTouchTooltip();
  const rows: Row[] = months.map((view) => {
    const late = view.paidLate;
    const onTime = view.paid - late;
    const overdue = OVERDUE.has(view.status) ? view.open : 0;
    const awaiting = OVERDUE.has(view.status) ? 0 : view.open;

    if (mode === "hours") {
      return { month: view.month, label: formatCompetence(view.month), onTime: onTime / 100, late: late / 100, overdue: overdue / 100, awaiting: awaiting / 100, view };
    }

    // Em reais: o recebido se divide pelas horas no prazo e com atraso; o que
    // falta vale a estimativa das horas em aberto.
    const received = view.receivedCents ?? 0;
    const openValue = view.openValueCents ?? 0;
    const share = view.paid === 0 ? 0 : late / view.paid;
    return {
      month: view.month,
      label: formatCompetence(view.month),
      onTime: (received * (1 - share)) / 100,
      late: (received * share) / 100,
      overdue: overdue > 0 ? openValue / 100 : 0,
      awaiting: awaiting > 0 ? openValue / 100 : 0,
      view,
    };
  });
  const byLabel = new Map(rows.map((row) => [row.label, row]));

  if (rows.length === 0) {
    return (
      <div className="grid h-[220px] place-items-center rounded-xl border border-dashed border-border/70 px-6 text-center text-[11px] leading-5 text-muted-foreground">
        Nenhum mês de horas extras neste ano.
      </div>
    );
  }

  return (
    <div data-testid="overtime-chart">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul aria-label="Legenda" className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {SERIES.map((series) => (
            <li key={series.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={`size-2.5 rounded-[3px] ${series.swatch}`} />
              {series.label}
            </li>
          ))}
        </ul>
        <div role="group" aria-label="Unidade do gráfico" className="flex gap-1.5">
          {(["hours", "values"] as const).map((option) => (
            <button key={option} type="button" aria-pressed={mode === option} onClick={() => setMode(option)} className={filterBadge({ active: mode === option })}>
              {option === "hours" ? "Horas" : "Valores"}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[260px] w-full" {...touch.containerProps}>
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <XAxis axisLine={false} dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} minTickGap={8} />
            <YAxis
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickFormatter={(value: number) => (mode === "hours" ? `${value} h` : formatBrl(value, { compact: true }))}
              tickLine={false}
              width={mode === "hours" ? 40 : 62}
            />
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" strokeOpacity={0.55} />
            <Tooltip
              cursor={{ fill: "oklch(1 0 0 / 0.04)" }}
              content={({ active, label }) => {
                const row = byLabel.get(String(label ?? ""));
                if (!active || !row) return null;
                const view = row.view;

                return (
                  <div className="min-w-[220px] rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
                    <p className="text-[11px] font-medium text-foreground">{formatCompetenceLong(view.month)}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {STATUS_LABELS[view.status]} · holerite de {formatCompetence(view.dueMonth)}
                    </p>
                    <div className="mt-2.5 space-y-1 text-[10px]">
                      <TooltipRow label="Trabalhadas">{formatHours(view.worked)}</TooltipRow>
                      {SERIES.map((series) =>
                        row[series.key] > 0 ? (
                          <TooltipRow key={series.key} label={series.label} swatch={series.swatch}>
                            {mode === "hours" ? formatHours(Math.round(row[series.key] * 100)) : formatCents(Math.round(row[series.key] * 100))}
                          </TooltipRow>
                        ) : null,
                      )}
                      {view.estimatedCents !== null ? (
                        <p className="flex items-center justify-between gap-4 border-t border-border/70 pt-1.5 text-muted-foreground">
                          Estimado pelas regras
                          <span className="font-mono text-foreground">{formatCents(view.estimatedCents)}</span>
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              }}
            />
            {SERIES.map((series, index) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                name={series.label}
                stackId="hours"
                fill={series.fill}
                fillOpacity={series.opacity}
                maxBarSize={34}
                radius={index === SERIES.length - 1 ? [4, 4, 0, 0] : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="sr-only">
        <table>
          <caption>Horas extras por mês de trabalho</caption>
          <thead>
            <tr>
              <th>Mês</th>
              {SERIES.map((series) => (
                <th key={series.key}>{series.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.month}>
                <td>{formatCompetenceLong(row.month)}</td>
                {SERIES.map((series) => (
                  <td key={series.key}>
                    {mode === "hours" ? formatHours(Math.round(row[series.key] * 100)) : formatCents(Math.round(row[series.key] * 100))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TooltipRow({ label, swatch, children }: { label: string; swatch?: string; children: React.ReactNode }) {
  return (
    <p className="flex items-center justify-between gap-4 text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        {swatch ? <span aria-hidden="true" className={`size-2 rounded-full ${swatch}`} /> : null}
        {label}
      </span>
      <span className="font-mono text-foreground">{children}</span>
    </p>
  );
}
