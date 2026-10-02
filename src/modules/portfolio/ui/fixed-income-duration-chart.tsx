"use client";

import {
  Bar,
  BarChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type LabelProps,
} from "recharts";

import { cn } from "@/lib/utils";
import type {
  FixedIncomeDuration,
  FixedIncomeDurationRow,
} from "@/modules/portfolio/domain/fixed-income-duration";
import { categoryColor } from "@/modules/portfolio/presentation/category-colors";
import { formatSharePercent } from "@/modules/portfolio/presentation/portfolio-format";

type Mode = "current" | "target";

type ChartDatum = { subclass: string; row: FixedIncomeDurationRow } & Record<string, unknown>;

const BAR_GAP = 4;
// Na Geist Mono todo caractere avança 0,6 em.
const BAR_LABEL_CHAR_EM = 0.6;
const BAR_LABEL_MIN_DROP = 14;
const BAR_LABEL_SEPARATION = 2;

export function FixedIncomeDurationChart({ duration }: { duration: FixedIncomeDuration }) {
  const { durations, rows, hasCurrent, hasTarget } = duration;

  if (!hasCurrent && !hasTarget) {
    return null;
  }

  const scale = shareScale(
    Math.max(0, ...rows.flatMap((row) => [...Object.values(row.current), ...Object.values(row.target)])),
  );

  return (
    <section className="premium-panel rounded-[24px] p-5 sm:p-6" aria-labelledby="duration-title">
      <h2 id="duration-title" className="text-base font-semibold tracking-[-0.025em]">
        Renda fixa por duração
      </h2>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Percentual sobre o total de renda fixa, atual e ideal na mesma escala.
      </p>

      <ul aria-label="Prazos" className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {durations.map((entry) => (
          <li key={entry} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="size-2 rounded-full" style={{ backgroundColor: categoryColor(entry) }} />
            {durationLabel(entry)}
          </li>
        ))}
      </ul>

      <div className="mt-5 space-y-5">
        <DurationBars
          mode="current"
          title="Atual"
          empty={!hasCurrent}
          emptyText="Sem renda fixa nesta competência"
          durations={durations}
          rows={rows}
          scale={scale}
        />
        <div aria-hidden="true" className="h-px bg-border/60" />
        <DurationBars
          mode="target"
          title="Ideal"
          empty={!hasTarget}
          emptyText="Sem metas de renda fixa"
          durations={durations}
          rows={rows}
          scale={scale}
        />
      </div>

      <table className="sr-only">
        <caption>Renda fixa por duração, atual e ideal</caption>
        <thead>
          <tr>
            <th scope="col">Subclasse</th>
            <th scope="col">Prazo</th>
            <th scope="col">Atual</th>
            <th scope="col">Ideal</th>
          </tr>
        </thead>
        <tbody>
          {rows.flatMap((row) =>
            durations
              .filter((entry) => (row.current[entry] ?? 0) > 0 || (row.target[entry] ?? 0) > 0)
              .map((entry) => (
                <tr key={`${row.subclass}-${entry}`}>
                  <th scope="row">{row.subclass}</th>
                  <td>{durationLabel(entry)}</td>
                  <td>{formatSharePercent(row.current[entry] ?? 0)}</td>
                  <td>{formatSharePercent(row.target[entry] ?? 0)}</td>
                </tr>
              )),
          )}
        </tbody>
      </table>
    </section>
  );
}

function DurationBars({
  mode,
  title,
  empty,
  emptyText,
  durations,
  rows,
  scale,
}: {
  mode: Mode;
  title: string;
  empty: boolean;
  emptyText: string;
  durations: string[];
  rows: FixedIncomeDurationRow[];
  scale: { top: number; ticks: number[] };
}) {
  const sharesOf = (row: FixedIncomeDurationRow) => (mode === "current" ? row.current : row.target);
  // Os dois gráficos usam as mesmas séries, inclusive prazos fora do padrão que só ocorrem num
  // deles, para que cada subclasse e prazo fique na mesma posição e largura no atual e no ideal.
  const data: ChartDatum[] = rows.map((row) => ({
    subclass: row.subclass,
    row,
    ...Object.fromEntries(durations.map((entry, index) => [seriesKey(index), sharesOf(row)[entry] ?? 0])),
  }));

  return (
    <figure aria-label={`Renda fixa por duração, ${title.toLowerCase()}`} data-testid={`duration-${mode}`}>
      <figcaption className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {title}
      </figcaption>

      <div className="mt-2 h-[184px] w-full">
        {empty ? (
          <div className="grid h-full place-items-center rounded-xl border border-dashed border-border/70 text-[11px] text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          <ResponsiveContainer height="100%" width="100%">
            <BarChart
              data={data}
              barCategoryGap="6%"
              barGap={BAR_GAP}
              margin={{ top: 18, right: 4, bottom: 0, left: 0 }}
            >
              <XAxis
                axisLine={false}
                dataKey="subclass"
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                domain={[0, scale.top]}
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                tickFormatter={(value: number) => `${value}%`}
                tickLine={false}
                ticks={scale.ticks}
                width={36}
              />
              <Tooltip
                cursor={{ fill: "oklch(1 0 0 / 0.04)" }}
                content={({ active, payload }) => {
                  const datum = payload?.[0]?.payload as ChartDatum | undefined;

                  if (!active || !datum) {
                    return null;
                  }

                  return <DurationTooltip mode={mode} durations={durations} row={datum.row} />;
                }}
              />
              {durations.map((entry, index) => (
                <Bar
                  key={entry}
                  dataKey={seriesKey(index)}
                  name={durationLabel(entry)}
                  fill={categoryColor(entry)}
                  maxBarSize={32}
                  radius={[3, 3, 0, 0]}
                >
                  <LabelList
                    dataKey="subclass"
                    content={(props) => (
                      <BarValueLabel
                        viewBox={props.viewBox}
                        datum={data.find((datum) => datum.subclass === props.value)}
                        seriesIndex={index}
                      />
                    )}
                  />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </figure>
  );
}

function DurationTooltip({
  mode,
  durations,
  row,
}: {
  mode: Mode;
  durations: string[];
  row: FixedIncomeDurationRow;
}) {
  const entries = durations.filter(
    (entry) => (row.current[entry] ?? 0) > 0 || (row.target[entry] ?? 0) > 0,
  );

  return (
    <div className="rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[11px] font-medium text-foreground">{row.subclass}</p>
        <p className="text-[9px] tracking-[0.1em] text-muted-foreground uppercase">Atual / ideal</p>
      </div>
      <div className="mt-2 space-y-1">
        {entries.map((entry) => (
          <div key={entry} className="flex items-center gap-2">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: categoryColor(entry) }} />
            <span className="text-[10px] text-muted-foreground">{durationLabel(entry)}</span>
            <span className="ml-auto pl-3 font-mono text-[10px]">
              <span className={cn(mode === "current" ? "text-foreground" : "text-muted-foreground")}>
                {formatSharePercent(row.current[entry] ?? 0)}
              </span>
              <span className="text-muted-foreground/50"> / </span>
              <span className={cn(mode === "target" ? "text-foreground" : "text-muted-foreground")}>
                {formatSharePercent(row.target[entry] ?? 0)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarValueLabel({
  viewBox,
  datum,
  seriesIndex,
}: {
  viewBox: LabelProps["viewBox"];
  datum: ChartDatum | undefined;
  seriesIndex: number;
}) {
  const shareAt = (index: number) => {
    const value = datum?.[seriesKey(index)];
    return typeof value === "number" ? value : null;
  };
  const share = shareAt(seriesIndex) ?? 0;

  if (!viewBox || !("width" in viewBox) || share <= 0) {
    return null;
  }

  const x = Number(viewBox.x ?? 0);
  const y = Number(viewBox.y ?? 0);
  const width = Number(viewBox.width ?? 0);
  const pixelsPerPoint = Number(viewBox.height ?? 0) / share;
  const { precise, fontSize } = barLabelStyle(width);
  const text = precise ? formatSharePercent(share) : formatRoundedShare(share);
  const halfText = (text.length * BAR_LABEL_CHAR_EM * fontSize) / 2;
  const ownRoom = (width + BAR_GAP - BAR_LABEL_SEPARATION) / 2;

  // O rótulo pode avançar sobre o vizinho vazio, de fora do grupo ou bem mais baixo; ao lado de
  // um vizinho bem mais alto, cujo rótulo fica acima, ocupa o vão até a barra dele; ao lado de um
  // vizinho de altura parecida, divide o vão com o rótulo dele.
  const room = (neighbor: number | null) => {
    const drop = neighbor === null || neighbor <= 0 ? Infinity : (share - neighbor) * pixelsPerPoint;

    if (drop >= BAR_LABEL_MIN_DROP) {
      return ownRoom + width;
    }

    if (drop <= -BAR_LABEL_MIN_DROP) {
      return width / 2 + BAR_GAP - BAR_LABEL_SEPARATION;
    }

    return ownRoom;
  };

  // Sem espaço, o valor fica só no tooltip e na tabela acessível.
  if (halfText > Math.min(room(shareAt(seriesIndex - 1)), room(shareAt(seriesIndex + 1)))) {
    return null;
  }

  return (
    <text
      x={x + width / 2}
      y={y - 6}
      className="font-mono"
      fill="var(--foreground)"
      fillOpacity={0.8}
      fontSize={fontSize}
      textAnchor="middle"
    >
      {text}
    </text>
  );
}

/**
 * Todas as barras dos dois gráficos têm a mesma largura, então todos os rótulos usam o mesmo
 * estilo: a precisão do tooltip e da tabela quando "25,6%" cabe na faixa da barra; senão o
 * percentual inteiro em 10 px e, em barras muito estreitas, em 9 px.
 */
function barLabelStyle(width: number) {
  const fits = (chars: number, fontSize: number) =>
    chars * BAR_LABEL_CHAR_EM * fontSize <= width + BAR_GAP - BAR_LABEL_SEPARATION;

  if (fits(5, 10)) {
    return { precise: true, fontSize: 10 };
  }

  return { precise: false, fontSize: fits(3, 10) ? 10 : 9 };
}

function shareScale(max: number) {
  const padded = max * 1.1;
  const step = padded <= 40 ? 10 : padded <= 60 ? 20 : 25;
  const top = Math.min(100, Math.max(step, Math.ceil(padded / step) * step));

  return {
    top,
    ticks: Array.from({ length: Math.floor(top / step) + 1 }, (_, index) => index * step),
  };
}

function seriesKey(index: number) {
  return `d${index}`;
}

function durationLabel(duration: string) {
  return duration === "-" ? "Sem prazo" : duration;
}

function formatRoundedShare(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value / 100);
}
