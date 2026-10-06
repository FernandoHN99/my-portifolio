import { PercentIcon } from "@phosphor-icons/react/dist/ssr";

import type { CdiView } from "@/modules/portfolio/application/get-position-history";
import { ratesLabel } from "@/modules/portfolio/presentation/income-rate";
import { formatBrl } from "@/modules/portfolio/presentation/portfolio-format";

const DAY = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

function day(key: string) {
  return DAY.format(new Date(`${key}T00:00:00.000Z`));
}

/**
 * Rendimento automático na competência (specs 060 e 079): o saldo bruto até o
 * último dia que rendeu, pelo CDI ou pela taxa prefixada, separado da
 * projeção. Sem IR nem IOF.
 */
export function CdiPanel({ cdi }: { cdi: CdiView }) {
  return (
    <section className="premium-panel mt-6 rounded-[24px] p-5 sm:p-7" aria-labelledby="cdi-title" data-testid="cdi-panel">
      <div className="flex items-center gap-2">
        <PercentIcon aria-hidden="true" className="text-primary" size={16} weight="bold" />
        <h2 id="cdi-title" className="text-base font-semibold tracking-[-0.025em]">
          {ratesLabel(cdi.parts)}
        </h2>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Item label="Base do mês" value={formatBrl(cdi.baseBrl)} />
        <Item label="Rendimento calculado" value={formatBrl(cdi.incomeBrl)} />
        <Item label="Saldo bruto" value={formatBrl(cdi.balanceBrl)} />
        <Item label="Rendeu até" value={cdi.through ? day(cdi.through) : "—"} />
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
