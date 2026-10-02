"use client";

import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { AllocationGroup } from "@/modules/portfolio/domain/rebalance";
import { categoryColor } from "@/modules/portfolio/presentation/category-colors";
import { formatSharePercent } from "@/modules/portfolio/presentation/portfolio-format";

const DURATION_ORDER = ["Curto", "Médio", "Longo"];

export function FixedIncomeDurationChart({ group }: { group: AllocationGroup | undefined }) {
  if (!group || group.rows.length === 0) {
    return null;
  }

  const subclasses = [...new Set(group.rows.map((row) => row.label.split(" · ")[0]))];
  const data = DURATION_ORDER.map((duration) => {
    const entry: Record<string, string | number> = { duration };

    for (const subclass of subclasses) {
      const row = group.rows.find((candidate) => candidate.label === `${subclass} · ${duration}`);
      entry[`${subclass} atual`] = row?.currentShare ?? 0;
      entry[`${subclass} ideal`] = row?.targetShare ?? 0;
    }

    return entry;
  });

  const palette = Object.fromEntries(
    subclasses.map((subclass) => [subclass, categoryColor(subclass)]),
  );

  return (
    <section className="premium-panel rounded-[24px] p-5 sm:p-6" aria-labelledby="duration-title">
      <h2 id="duration-title" className="text-base font-semibold tracking-[-0.025em]">
        Renda fixa por duração
      </h2>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Percentual sobre o total de renda fixa, atual contra ideal.
      </p>

      <div className="mt-5 h-[260px] w-full">
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <XAxis
              axisLine={false}
              dataKey="duration"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickFormatter={(value: number) => `${value.toFixed(0)}%`}
              tickLine={false}
              width={40}
            />
            <Tooltip
              cursor={{ fill: "oklch(1 0 0 / 0.04)" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) {
                  return null;
                }

                return (
                  <div className="rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
                    <p className="text-[11px] font-medium text-foreground">{label}</p>
                    <div className="mt-2 space-y-1">
                      {payload.map((item) => (
                        <div key={item.name} className="flex items-center gap-2">
                          <span
                            className="size-1.5 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-[10px] text-muted-foreground">{item.name}</span>
                          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                            {formatSharePercent(Number(item.value))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }}
            />
            <Legend
              formatter={(value) => (
                <span className="text-[10px] text-muted-foreground">{value}</span>
              )}
              iconSize={8}
              wrapperStyle={{ paddingTop: 8 }}
            />
            {subclasses.map((subclass) => (
              <Bar
                key={`${subclass}-atual`}
                dataKey={`${subclass} atual`}
                fill={palette[subclass]}
                radius={[3, 3, 0, 0]}
              />
            ))}
            {subclasses.map((subclass) => (
              <Bar
                key={`${subclass}-ideal`}
                dataKey={`${subclass} ideal`}
                fill={palette[subclass]}
                fillOpacity={0.3}
                radius={[3, 3, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
