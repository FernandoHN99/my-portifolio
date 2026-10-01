"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import type { CompositionGroup, CompositionRow } from "@/modules/portfolio/application/get-overview-data";
import { categoryColor } from "@/modules/portfolio/presentation/category-colors";
import { formatSharePercent } from "@/modules/portfolio/presentation/portfolio-format";

export function CompositionDonuts({ groups }: { groups: CompositionGroup[] }) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {groups.map((group) => (
        <section key={group.key} className="premium-panel rounded-[24px] p-5 sm:p-6">
          <h2 className="text-base font-semibold tracking-[-0.025em]">{group.title}</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">Atual contra ideal</p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <Donut rows={group.rows} mode="current" />
            <Donut rows={group.rows} mode="target" />
          </div>

          <div className="mt-5 space-y-2.5">
            {group.rows.map((row) => (
              <div key={row.label} className="flex items-center gap-2.5">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: categoryColor(row.label) }}
                />
                <span className="truncate text-xs text-foreground/80">{row.label}</span>
                <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
                  {formatSharePercent(row.currentShare)}
                  <span className="text-muted-foreground/50">
                    {" / "}
                    {row.targetShare === null ? "—" : formatSharePercent(row.targetShare)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Donut({ rows, mode }: { rows: CompositionRow[]; mode: "current" | "target" }) {
  const data = rows
    .map((row) => ({
      label: row.label,
      value: mode === "current" ? row.currentShare : (row.targetShare ?? 0),
    }))
    .filter((entry) => entry.value > 0);

  return (
    <div>
      <p className="mb-1 text-center text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
        {mode === "current" ? "Atual" : "Ideal"}
      </p>
      <div className="h-[132px] w-full">
        {data.length === 0 ? (
          <div className="grid h-full place-items-center text-[10px] text-muted-foreground">
            sem meta
          </div>
        ) : (
          <ResponsiveContainer height="100%" width="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                innerRadius={34}
                outerRadius={58}
                paddingAngle={1.5}
                stroke="var(--card)"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {data.map((entry) => (
                  <Cell key={entry.label} fill={categoryColor(entry.label)} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
