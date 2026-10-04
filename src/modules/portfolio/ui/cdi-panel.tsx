import { PercentIcon } from "@phosphor-icons/react/dist/ssr";

import type { CdiView } from "@/modules/portfolio/application/get-position-history";
import { formatBrl } from "@/modules/portfolio/presentation/portfolio-format";

const DAY = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const PERCENT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const RATE = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 });

function day(key: string) {
  return DAY.format(new Date(`${key}T00:00:00.000Z`));
}

/**
 * Renda fixa pelo CDI na competência (spec 060): o saldo bruto acumulado até a
 * última taxa publicada, separado da projeção, que declara a hipótese. Sem IR
 * nem IOF. O rendimento calculado não é uma transação.
 */
export function CdiPanel({ cdi }: { cdi: CdiView }) {
  return (
    <section className="premium-panel mt-6 rounded-[24px] p-5 sm:p-7" aria-labelledby="cdi-title" data-testid="cdi-panel">
      <div className="flex items-center gap-2">
        <PercentIcon aria-hidden="true" className="text-primary" size={16} weight="bold" />
        <h2 id="cdi-title" className="text-base font-semibold tracking-[-0.025em]">
          {PERCENT.format(cdi.percent)}% do CDI
        </h2>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Cálculo bruto, sem IR nem IOF, pelo CDI diário do Banco Central (série 12), desde {day(cdi.start)} neste mês.
        Cada aporte e retirada rende a partir do próprio dia.
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Item label="Base do mês" value={formatBrl(cdi.baseBrl)} />
        <Item label="Rendimento calculado" value={formatBrl(cdi.incomeBrl)} />
        <Item label="Saldo bruto" value={formatBrl(cdi.balanceBrl)} />
        <Item label="Última taxa usada" value={cdi.through ? day(cdi.through) : "—"} />
      </dl>

      {cdi.error ? (
        <p role="status" className="mt-3 text-[11px] text-warning-foreground">
          {cdi.error}
        </p>
      ) : null}

      {cdi.projection ? (
        <div className="mt-4 rounded-xl border border-dashed border-border px-3 py-2.5" data-testid="cdi-projection">
          <p className="text-xs text-foreground">
            Projeção {cdi.projection.toMaturity ? "no vencimento" : "em 12 meses"}, {day(cdi.projection.until)}:{" "}
            <span className="font-mono">{formatBrl(cdi.projection.balanceBrl)}</span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Hipótese: o último CDI diário ({RATE.format(cdi.projection.dailyPercent)}% ao dia) mantido em{" "}
            {cdi.projection.businessDays} dias úteis, de segunda a sexta, sem feriados. Não é o saldo de hoje nem uma
            promessa de rendimento.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 px-3 py-2">
      <dt className="text-[10px] tracking-[0.08em] text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-0.5 font-mono text-xs text-foreground">{value}</dd>
    </div>
  );
}
