import { cn } from "@/lib/utils";
import type { HistorySlot, PresentSlot } from "@/modules/portfolio/domain/position-history";
import type { RecordedMonth } from "@/modules/portfolio/domain/position-transactions";
import {
  formatBrl,
  formatPercent,
  formatPriceBrl,
  formatSharePercent,
} from "@/modules/portfolio/presentation/portfolio-format";
import {
  formatQuantity,
  formatSignedBrl,
  monthLabel,
  monthRangeLabel,
} from "@/modules/portfolio/presentation/position-page";

type TableRow =
  | { kind: "present"; slot: PresentSlot; first: boolean; cameFrom: string[] }
  | { kind: "absent"; from: string; to: string; count: number; elsewhere: string[]; exitBrl: number | null }
  | { kind: "missing"; from: string; to: string; count: number };

/**
 * Mês a mês, do mais recente para o mais antigo. Meses sem a posição e meses
 * sem competência aparecem como lacunas agrupadas, nunca como zero.
 */
export function PositionMonthsTable({
  slots,
  selectedMonth,
  quoted,
  quoteSymbol,
  ticker,
  scope,
  recorded,
}: {
  slots: HistorySlot[];
  selectedMonth: string;
  quoted: boolean;
  quoteSymbol: string | null;
  ticker: string | null;
  scope: "account" | "all";
  /**
   * Movimentações registradas por mês, na conta ou em todas as contas (spec 058).
   */
  recorded: Map<string, RecordedMonth> | null;
}) {
  const rows = buildTableRows(slots).reverse();
  const presentCount = slots.filter((slot) => slot.kind === "present").length;
  const columnCount = quoted ? 8 : 5;

  return (
    <section className="premium-panel mt-6 overflow-hidden rounded-[24px]" aria-labelledby="months-title">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border/60 px-5 py-4 sm:px-6">
        <h2 id="months-title" className="text-sm font-semibold text-foreground">
          Mês a mês
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {presentCount} {presentCount === 1 ? "competência" : "competências"} com a posição
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left" data-testid="position-months">
          <thead>
            <tr className="border-b border-border/60 text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
              <th className="px-4 py-3 pl-5 sm:pl-6">Competência</th>
              {quoted ? <th className="hidden px-4 py-3 text-right md:table-cell">Quantidade</th> : null}
              {quoted ? <th className="hidden px-4 py-3 text-right lg:table-cell">Cotação</th> : null}
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3 text-right">Variação</th>
              {quoted ? <th className="hidden px-4 py-3 text-right lg:table-cell">Preço</th> : null}
              <th className="hidden px-4 py-3 text-right whitespace-nowrap lg:table-cell">Aportes e resgates</th>
              <th className="hidden px-4 py-3 pr-5 text-right sm:table-cell sm:pr-6">Da carteira</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/55">
            {rows.map((row) =>
              row.kind === "present" ? (
                <PresentRow
                  key={row.slot.month}
                  row={row}
                  selected={row.slot.month === selectedMonth}
                  quoted={quoted}
                  quoteSymbol={quoteSymbol}
                  ticker={ticker}
                  recorded={recorded?.get(row.slot.month) ?? null}
                />
              ) : (
                <tr key={`${row.kind}-${row.from}`} data-gap={row.kind} className="bg-white/[0.012]">
                  <td colSpan={columnCount} className="px-5 py-2.5 sm:px-6">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-[11px] font-medium whitespace-nowrap text-muted-foreground">
                        {monthRangeLabel(row.from, row.to)}
                      </span>
                      <span className="text-[11px] text-muted-foreground/90">
                        {row.kind === "missing"
                          ? row.count === 1
                            ? "Sem competência no histórico"
                            : `${row.count} meses sem competência no histórico`
                          : `${scope === "account" ? "Fora desta conta" : "Fora da carteira"}${
                              row.elsewhere.length > 0 ? ` · em ${row.elsewhere.join(", ")}` : ""
                            }`}
                      </span>
                      {row.kind === "absent" && row.exitBrl !== null ? (
                        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                          saída {formatSignedBrl(row.exitBrl)}
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PresentRow({
  row,
  selected,
  quoted,
  quoteSymbol,
  ticker,
  recorded,
}: {
  row: Extract<TableRow, { kind: "present" }>;
  selected: boolean;
  quoted: boolean;
  quoteSymbol: string | null;
  ticker: string | null;
  recorded: RecordedMonth | null;
}) {
  const { slot } = row;
  const step = slot.step;
  const entry = row.first || slot.entryBrl !== null;

  return (
    <tr
      aria-current={selected ? "date" : undefined}
      className={cn(
        "align-top transition-colors duration-150 hover:bg-white/[0.018]",
        selected && "bg-primary/[0.06] shadow-[inset_2px_0_0_var(--primary)]",
      )}
    >
      <td className="px-4 py-3 pl-5 sm:pl-6">
        <p className={cn("text-xs font-medium whitespace-nowrap", selected ? "text-primary" : "text-foreground/90")}>
          {monthLabel(slot.month)}
        </p>
        {entry ? (
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {row.first ? "Entrada" : "Volta"}
            {row.cameFrom.length > 0 ? ` · de ${row.cameFrom.join(", ")}` : ""}
          </p>
        ) : step?.acrossMissing ? (
          <p className="mt-0.5 text-[10px] text-muted-foreground">desde {monthLabel(step.fromMonth)}</p>
        ) : null}
        {slot.source === "mixed" || step?.source === "mixed" ? <p className="mt-0.5 text-[10px] text-muted-foreground">origem mista</p> : null}
        {step?.unexplainedBrl ? <p className="mt-0.5 text-[10px] text-muted-foreground">sem registro {formatSignedBrl(step.unexplainedBrl)}</p> : null}
      </td>
      {quoted ? (
        <td className="hidden px-4 py-3 text-right font-mono text-xs whitespace-nowrap text-foreground/85 md:table-cell">
          {formatQuantity(slot.quantity, quoteSymbol, ticker)}
        </td>
      ) : null}
      {quoted ? (
        <td className="hidden px-4 py-3 text-right font-mono text-xs whitespace-nowrap text-muted-foreground lg:table-cell">
          {slot.priceBrl === null ? "—" : formatPriceBrl(slot.priceBrl)}
        </td>
      ) : null}
      <td className="px-4 py-3 text-right font-mono text-xs font-medium whitespace-nowrap text-foreground sm:text-sm">
        {formatBrl(slot.valueBrl)}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {step ? (
          <>
            <p
              className={cn(
                "font-mono text-xs",
                step.changeBrl > 0 ? "text-primary" : step.changeBrl < 0 ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {formatSignedBrl(step.changeBrl)}
            </p>
            {step.changePercent !== null ? (
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{formatPercent(step.changePercent)}</p>
            ) : null}
          </>
        ) : (
          <span className="font-mono text-xs text-muted-foreground">—</span>
        )}
      </td>
      {quoted ? (
        <td className="hidden px-4 py-3 text-right whitespace-nowrap lg:table-cell">
          {step?.priceEffectBrl != null ? (
            <>
              <p className="font-mono text-xs text-foreground/85">{formatSignedBrl(step.priceEffectBrl)}</p>
              {step.pricePercent !== null ? (
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  cotação {formatPercent(step.pricePercent)}
                </p>
              ) : null}
            </>
          ) : (
            <span className="font-mono text-xs text-muted-foreground">—</span>
          )}
        </td>
      ) : null}
      <td
        className="hidden px-4 py-3 text-right font-mono text-xs whitespace-nowrap text-foreground/85 lg:table-cell"
        data-testid="month-flows"
      >
        {/* Com movimentações no mês, os valores registrados; sem elas, a
            estimativa pela variação da quantidade, identificada (spec 058). */}
        {recorded ? (
          <>
            <p>{formatSignedBrl(recorded.netFlowBrl)}</p>
            <p className="mt-0.5 text-[10px] text-primary">
              registrado
              {recorded.incomeBrl !== 0 ? ` · rendimento ${formatSignedBrl(recorded.incomeBrl)}` : ""}
              {recorded.openingBrl !== 0 ? " · saldo inicial" : ""}
              {recorded.internalBrl !== 0 ? " · transferência interna" : ""}
            </p>
          </>
        ) : quoted && (slot.entryBrl !== null || step?.flowBrl != null) ? (
          <>
            <p>{formatSignedBrl(slot.entryBrl ?? step!.flowBrl!)}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{step?.source === "mixed" ? "sem movimentos registrados" : "estimado"}</p>
          </>
        ) : (
          "—"
        )}
      </td>
      <td className="hidden px-4 py-3 pr-5 text-right font-mono text-xs text-muted-foreground sm:table-cell sm:pr-6">
        {formatSharePercent(slot.share)}
      </td>
    </tr>
  );
}

function buildTableRows(slots: HistorySlot[]): TableRow[] {
  const firstIndex = slots.findIndex((slot) => slot.kind === "present");

  if (firstIndex === -1) {
    return [];
  }

  const rows: TableRow[] = [];
  let previousExisting: HistorySlot | null = null;

  for (const slot of slots.slice(firstIndex)) {
    const last = rows.at(-1);

    if (slot.kind === "present") {
      rows.push({
        kind: "present",
        slot,
        first: rows.length === 0,
        cameFrom:
          slot.entryBrl !== null && previousExisting?.kind === "absent" ? previousExisting.elsewhere : [],
      });
    } else if (last && last.kind === slot.kind) {
      last.to = slot.month;
      last.count += 1;

      if (last.kind === "absent" && slot.kind === "absent") {
        last.elsewhere = [...new Set([...last.elsewhere, ...slot.elsewhere])];
      }
    } else if (slot.kind === "absent") {
      rows.push({
        kind: "absent",
        from: slot.month,
        to: slot.month,
        count: 1,
        elsewhere: slot.elsewhere,
        exitBrl: slot.exitBrl,
      });
    } else {
      rows.push({ kind: "missing", from: slot.month, to: slot.month, count: 1 });
    }

    if (slot.kind !== "missing") {
      previousExisting = slot;
    }
  }

  return rows;
}
