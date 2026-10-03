"use client";

import { useState, type ReactNode } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { cn } from "@/lib/utils";
import type { PositionSummary } from "@/modules/portfolio/domain/position-history";
import { formatBrl } from "@/modules/portfolio/presentation/portfolio-format";
import { formatSignedBrl, monthLabel } from "@/modules/portfolio/presentation/position-page";

type Mode = "since-entry" | "month";
type Tone = "total" | "price" | "flow" | "change";

type WaterfallBar = {
  key: string;
  label: string;
  description: string;
  value: number;
  range: [number, number];
  tone: Tone;
  signed: boolean;
};

// Aportes e resgates em roxo, longe do azul e do laranja de alta e queda
// (spec 038).
const FLOW_COLOR = "#cc79a7";

/**
 * Decomposição da variação em cascata: valor de partida, ganho de preço,
 * aportes e resgates e valor de chegada. Em saldos sem cotação, só a variação.
 */
export function PositionAttribution({
  summary,
  quoted,
  dollarBalance,
  scope,
  hasOtherAccounts,
}: {
  summary: PositionSummary;
  quoted: boolean;
  /** Saldo em dólar: a cotação é o câmbio. */
  dollarBalance: boolean;
  scope: "account" | "all";
  hasOtherAccounts: boolean;
}) {
  const [mode, setMode] = useState<Mode>("since-entry");
  const bars = mode === "since-entry" ? sinceEntryBars(summary, quoted) : monthBars(summary, quoted);
  const emptyText =
    mode === "month"
      ? monthEmptyText(summary)
      : summary.startValueBrl === null
        ? "A posição ainda não existia nesta competência."
        : "A posição tem uma única competência até aqui.";

  return (
    <section className="premium-panel rounded-[24px] p-5 sm:p-7" aria-labelledby="attribution-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="attribution-title" className="text-base font-semibold tracking-[-0.025em]">
            De onde veio a variação
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {quoted ? "Preço contra aportes e resgates, estimados pelas competências." : "Variação do saldo informado."}
          </p>
        </div>
        <div role="group" aria-label="Período da decomposição" className="flex items-center gap-0.5 rounded-lg border border-border bg-card/60 p-0.5">
          {(
            [
              { key: "since-entry", label: summary.firstMonth ? `Desde ${monthLabel(summary.firstMonth)}` : "Desde a entrada" },
              { key: "month", label: "No mês" },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={mode === option.key}
              onClick={() => setMode(option.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                mode === option.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {bars === null ? (
        <div className="mt-6 grid h-[200px] place-items-center rounded-xl border border-dashed border-border/70 px-6 text-center text-[11px] text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(220px,1fr)] lg:items-center">
          <div className="h-[220px] w-full" data-testid="attribution-chart">
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={bars} margin={{ top: 22, right: 4, bottom: 0, left: 4 }} barCategoryGap="22%">
                <XAxis
                  axisLine={false}
                  dataKey="label"
                  interval={0}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  domain={[(min: number) => Math.min(0, min), "auto"]}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  tickFormatter={(value: number) => formatBrl(value, { compact: true })}
                  tickLine={false}
                  width={62}
                />
                <Tooltip
                  cursor={{ fill: "oklch(1 0 0 / 0.04)" }}
                  content={({ active, payload }) => {
                    const bar = payload?.[0]?.payload as WaterfallBar | undefined;

                    if (!active || !bar) {
                      return null;
                    }

                    return (
                      <div className="max-w-[240px] rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
                        <p className="text-[11px] font-medium text-foreground">{bar.description}</p>
                        <p className="mt-1 font-mono text-xs text-foreground">
                          {bar.signed ? formatSignedBrl(bar.value) : formatBrl(bar.value)}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="range" radius={[4, 4, 4, 4]} maxBarSize={56} isAnimationActive={false}>
                  {bars.map((bar) => (
                    <Cell key={bar.key} fill={barColor(bar)} fillOpacity={bar.tone === "total" ? 0.42 : 0.9} />
                  ))}
                  {/* Barras de altura zero não recebem rótulo, então o índice
                      do rótulo não é o da barra; a chave identifica a barra. */}
                  <LabelList
                    dataKey="key"
                    content={(props) => {
                      const bar = bars.find((entry) => entry.key === props.value);
                      const box = props.viewBox;

                      if (!bar || !box || !("width" in box)) {
                        return null;
                      }

                      const x = Number(box.x ?? 0) + Number(box.width ?? 0) / 2;
                      const top = Math.min(Number(box.y ?? 0), Number(box.y ?? 0) + Number(box.height ?? 0));

                      return (
                        <text
                          x={x}
                          y={top - 6}
                          className="font-mono"
                          fill="var(--foreground)"
                          fillOpacity={0.8}
                          fontSize={10}
                          textAnchor="middle"
                        >
                          {compactValue(bar)}
                        </text>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <dl className="space-y-2.5" data-testid="attribution-values">
            {bars.map((bar) => (
              <div key={bar.key} className="flex items-center gap-2.5">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: barColor(bar), opacity: bar.tone === "total" ? 0.6 : 1 }} />
                <dt className="text-xs text-foreground/80">{bar.description}</dt>
                <dd
                  className={cn(
                    "ml-auto shrink-0 font-mono text-xs",
                    bar.signed && bar.value > 0
                      ? "text-primary"
                      : bar.signed && bar.value < 0
                        ? "text-destructive"
                        : "text-foreground",
                  )}
                >
                  {bar.signed ? formatSignedBrl(bar.value) : formatBrl(bar.value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="mt-5 space-y-1.5 border-t border-border/60 pt-4 text-[11px] leading-5 text-muted-foreground">
        {quoted ? (
          <p>
            Ganho de preço é a quantidade do mês anterior vezes a variação da cotação. Aportes e resgates é o
            restante: a variação da quantidade valorizada pela cotação do mês em que aparece. É uma estimativa,
            porque o histórico guarda a posição de cada mês, sem as compras e vendas.
            {dollarBalance ? " Num saldo em dólar, o preço é o câmbio, e rendimentos creditados contam como aporte." : ""}
          </p>
        ) : (
          <p>
            Saldo em reais, sem cotação: o histórico guarda só o valor de cada mês, então rendimentos, aportes e
            resgates aparecem juntos na variação.
          </p>
        )}
        {summary.segments > 1 || summary.state === "absent" ? (
          <p>
            {scope === "account"
              ? "Quando a posição sai desta conta, a saída conta como resgate do último valor conhecido e a volta, como aporte do primeiro valor."
              : "Quando o ativo sai da carteira, a saída conta como resgate do último valor conhecido e a volta, como aporte do primeiro valor."}
            {scope === "account" && hasOtherAccounts
              ? " Em “Todas as contas”, uma transferência entre contas não aparece como resgate e aporte."
              : ""}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function sinceEntryBars(summary: PositionSummary, quoted: boolean): WaterfallBar[] | null {
  const start = summary.startValueBrl;
  const end = summary.endValueBrl;

  if (start === null || end === null || !summary.firstMonth || (summary.stepCount === 0 && summary.segments <= 1 && summary.state === "present")) {
    return null;
  }

  const endLabel = monthLabel(summary.selectedMonth);
  const startLabel = monthLabel(summary.firstMonth);

  if (quoted && summary.priceGainBrl !== null && summary.flowsBrl !== null) {
    return cascade([
      { key: "start", label: startLabel, description: `Entrada em ${startLabel}`, value: start, tone: "total" },
      { key: "price", label: "Preço", description: "Ganho de preço", value: summary.priceGainBrl, tone: "price" },
      { key: "flow", label: "Aportes", description: "Aportes e resgates", value: summary.flowsBrl, tone: "flow" },
      { key: "end", label: endLabel, description: `Valor em ${endLabel}`, value: end, tone: "total" },
    ]);
  }

  return cascade([
    { key: "start", label: startLabel, description: `Entrada em ${startLabel}`, value: start, tone: "total" },
    { key: "change", label: "Variação", description: "Variação do saldo", value: end - start, tone: "change" },
    { key: "end", label: endLabel, description: `Valor em ${endLabel}`, value: end, tone: "total" },
  ]);
}

function monthBars(summary: PositionSummary, quoted: boolean): WaterfallBar[] | null {
  const step = summary.monthStep;
  const current = summary.current;

  if (!step || !current) {
    return null;
  }

  const fromLabel = monthLabel(step.fromMonth);
  const toLabel = monthLabel(step.month);
  const start = current.valueBrl - step.changeBrl;

  if (quoted && step.priceEffectBrl !== null && step.flowBrl !== null) {
    return cascade([
      { key: "start", label: fromLabel, description: `Valor em ${fromLabel}`, value: start, tone: "total" },
      { key: "price", label: "Preço", description: "Ganho de preço", value: step.priceEffectBrl, tone: "price" },
      { key: "flow", label: "Aportes", description: "Aportes e resgates", value: step.flowBrl, tone: "flow" },
      { key: "end", label: toLabel, description: `Valor em ${toLabel}`, value: current.valueBrl, tone: "total" },
    ]);
  }

  return cascade([
    { key: "start", label: fromLabel, description: `Valor em ${fromLabel}`, value: start, tone: "total" },
    { key: "change", label: "Variação", description: "Variação do saldo", value: step.changeBrl, tone: "change" },
    { key: "end", label: toLabel, description: `Valor em ${toLabel}`, value: current.valueBrl, tone: "total" },
  ]);
}

function cascade(entries: Omit<WaterfallBar, "range" | "signed">[]): WaterfallBar[] {
  let running = 0;

  return entries.map((entry) => {
    if (entry.tone === "total") {
      running = entry.value;
      return { ...entry, range: [0, entry.value], signed: false };
    }

    const from = running;
    running += entry.value;
    return { ...entry, range: [Math.min(from, running), Math.max(from, running)], signed: true };
  });
}

function monthEmptyText(summary: PositionSummary) {
  if (summary.state !== "present") {
    return "Sem a posição nesta competência.";
  }

  if (!summary.previousMonth) {
    return "Primeira competência do histórico.";
  }

  return `Sem a posição em ${monthLabel(summary.previousMonth)}: ela entrou nesta competência.`;
}

function barColor(bar: WaterfallBar) {
  if (bar.tone === "total") {
    return "var(--muted-foreground)";
  }

  if (bar.tone === "flow") {
    return FLOW_COLOR;
  }

  return bar.value >= 0 ? "var(--chart-up)" : "var(--chart-down)";
}

// Rótulo curto sobre a barra, sem o símbolo da moeda, que já está no eixo: com
// ele, "+R$ 135,6 mil" invadia a barra vizinha no celular.
function compactValue(bar: WaterfallBar) {
  const formatted = new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
    signDisplay: bar.signed ? "exceptZero" : "auto",
  }).format(bar.value);

  return formatted;
}

export function HighlightRow({ label, value, detail, tone = "neutral", testId }: { label: string; value: ReactNode; detail?: ReactNode; tone?: "up" | "down" | "neutral"; testId?: string }) {
  return (
    <div data-testid={testId} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{label}</p>
        {detail ? <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p> : null}
      </div>
      <p
        className={cn(
          "shrink-0 text-right font-mono text-sm",
          tone === "up" ? "text-primary" : tone === "down" ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}
