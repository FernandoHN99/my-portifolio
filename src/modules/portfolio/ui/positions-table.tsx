import { CalendarBlankIcon, TableIcon } from "@phosphor-icons/react/dist/ssr";

import type { MonthPositions } from "@/modules/portfolio/application/get-month-positions";
import {
  formatBrl,
  formatMonth,
  formatSharePercent,
} from "@/modules/portfolio/presentation/portfolio-format";

export function PositionsTable({ month }: { month: MonthPositions | null }) {
  if (!month || month.positions.length === 0) {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-center justify-center px-5 text-center">
        <span className="grid size-12 place-items-center rounded-2xl border border-border bg-card text-primary">
          <TableIcon aria-hidden="true" size={22} weight="duotone" />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">
          Nenhuma posição nesta competência
        </h1>
      </div>
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-[1472px] px-5 py-8 sm:px-7 sm:py-10 xl:px-12 xl:py-12">
      <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[460px] w-[460px]" />

      <header className="flex flex-col gap-6 border-b border-border/70 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Posições
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-[2.65rem]">
            Carteira do mês
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            {month.positions.length} posições separadas por conta e instituição.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-border bg-card/70 px-3.5 py-2.5 text-xs text-muted-foreground">
            <CalendarBlankIcon aria-hidden="true" className="text-primary" size={15} weight="duotone" />
            <span>{formatMonth(month.referenceDate)}</span>
            {month.status === "DRAFT" ? (
              <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[9px] font-semibold tracking-[0.08em] text-warning-foreground uppercase">
                Rascunho
              </span>
            ) : null}
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {formatBrl(month.totalBrl)}
            {month.usdRate ? ` · US$ ${(month.totalBrl / month.usdRate).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}` : ""}
          </p>
        </div>
      </header>

      <section className="premium-panel mt-6 overflow-hidden rounded-[24px]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border/60 text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
                <th className="px-5 py-3.5 sm:px-6">Ativo</th>
                <th className="hidden px-5 py-3.5 sm:table-cell">Custódia</th>
                <th className="hidden px-5 py-3.5 lg:table-cell">Classe</th>
                <th className="hidden px-5 py-3.5 md:table-cell">Moeda</th>
                <th className="hidden px-5 py-3.5 text-right lg:table-cell">Quantidade</th>
                <th className="hidden px-5 py-3.5 text-right lg:table-cell">Cotação</th>
                <th className="px-5 py-3.5 text-right sm:px-6">Total</th>
                <th className="hidden px-5 py-3.5 text-right md:table-cell">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/55">
              {month.positions.map((position) => (
                <tr key={position.id} className="transition-colors duration-150 hover:bg-white/[0.018]">
                  <td className="px-5 py-4 sm:px-6">
                    <p className="text-sm font-medium text-foreground/90">{position.assetName}</p>
                    <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                      {position.ticker ?? "SALDO"}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground sm:hidden">
                      {position.institutionName}
                    </p>
                  </td>
                  <td className="hidden px-5 py-4 sm:table-cell">
                    <p className="text-xs text-foreground/80">{position.institutionName}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{position.accountName}</p>
                  </td>
                  <td className="hidden px-5 py-4 lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {position.allocations.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      ) : (
                        position.allocations.map((allocation) => (
                          <span
                            key={`${allocation.assetClass}-${allocation.subclass}-${allocation.duration}`}
                            className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {allocation.assetClass}
                            {position.allocations.length > 1
                              ? ` ${allocation.weight.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`
                              : ""}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="hidden px-5 py-4 font-mono text-xs text-muted-foreground md:table-cell">
                    {position.baseCurrency}
                  </td>
                  <td className="hidden px-5 py-4 text-right font-mono text-xs text-muted-foreground lg:table-cell">
                    {position.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 8 })}
                  </td>
                  <td className="hidden px-5 py-4 text-right font-mono text-xs text-muted-foreground lg:table-cell">
                    {position.unitPriceBrl === null ? "—" : formatBrl(position.unitPriceBrl)}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-xs font-medium whitespace-nowrap text-foreground sm:px-6 sm:text-sm">
                    {formatBrl(position.totalBrl)}
                  </td>
                  <td className="hidden px-5 py-4 text-right font-mono text-xs text-muted-foreground md:table-cell">
                    {formatSharePercent(position.share)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/70 text-xs">
                <td className="px-5 py-4 font-medium text-muted-foreground sm:px-6" colSpan={6}>
                  Total da competência
                </td>
                <td className="px-4 py-4 text-right font-mono text-sm font-medium text-foreground sm:px-6">
                  {formatBrl(month.totalBrl)}
                </td>
                <td className="hidden px-5 py-4 text-right font-mono text-muted-foreground md:table-cell">
                  100,0%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
