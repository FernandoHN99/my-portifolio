"use client";

import { ArrowsDownUpIcon, PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";
import type { PositionTransactionView } from "@/modules/portfolio/application/get-position-history";
import { recordedByMonth, TRANSACTION_LABELS } from "@/modules/portfolio/domain/position-transactions";
import { formatDay } from "@/modules/portfolio/presentation/maturity";
import { formatBrl, formatPriceBrl } from "@/modules/portfolio/presentation/portfolio-format";
import { monthLabel } from "@/modules/portfolio/presentation/position-page";

const QUANTITY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 });

function dayLabel(day: string) {
  return formatDay(new Date(`${day}T00:00:00.000Z`));
}

/**
 * Movimentações da posição nesta conta (specs 056 a 059): saldo inicial,
 * aportes, retiradas e rendimentos, com o dia, a quantidade, o preço executado
 * e o valor. Só as do mês aberto podem ser corrigidas ou apagadas; as pernas de
 * uma liquidação aparecem como transferência interna e saem juntas.
 */
export function PositionTransactions({
  transactions,
  quoted,
  dollars,
  editableMonthId,
  firstMonth,
  costSource,
  editableAccountId,
  showAccountLabels = false,
  removing,
  onEdit,
  onRemove,
}: {
  transactions: PositionTransactionView[];
  /** Primeira competência com a posição (AAAA-MM), para apontar o trecho sem movimentações. */
  firstMonth: string | null;
  costSource?: "estimated" | "known" | "opening";
  editableAccountId: string;
  showAccountLabels?: boolean;
  quoted: boolean;
  dollars: boolean;
  /** Competência aberta e selecionada, a única cujas movimentações podem ser apagadas. */
  editableMonthId: string | null;
  removing: boolean;
  onEdit: (entry: PositionTransactionView) => void;
  onRemove: (entry: PositionTransactionView) => void;
}) {
  return (
    <section className="premium-panel mt-6 rounded-[24px] p-5 sm:p-7" aria-labelledby="position-transactions-title">
      <div className="flex items-center gap-2">
        <ArrowsDownUpIcon aria-hidden="true" className="text-primary" size={16} weight="bold" />
        <h2 id="position-transactions-title" className="text-base font-semibold tracking-[-0.025em]">
          Movimentações
        </h2>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Saldo inicial, aportes, retiradas e rendimentos registrados. Só os do mês aberto podem ser corrigidos ou
        apagados; os meses sem movimentações mostram só o saldo de cada mês.
      </p>

      {transactions.length > 0 ? (
        <RecordedTotals transactions={transactions} firstMonth={firstMonth} costSource={costSource} />
      ) : null}

      {transactions.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-[11px] text-muted-foreground">
          Nenhuma movimentação registrada: os valores vêm do saldo de cada mês. Use Movimentar para registrar um
          aporte, uma retirada ou um rendimento.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-xs" data-testid="position-transactions">
            <thead>
              <tr className="text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
                <th className="py-2 pr-3">Dia</th>
                <th className="py-2 pr-3">Tipo</th>
                {quoted ? <th className="py-2 pr-3 text-right">{dollars ? "US$" : "Quantidade"}</th> : null}
                {quoted ? <th className="py-2 pr-3 text-right">{dollars ? "Câmbio" : "Preço"}</th> : null}
                <th className="py-2 pr-3 text-right">Valor</th>
                <th className="py-2 pr-3">Observação</th>
                <th className="py-2" aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {transactions.map((entry) => {
                const negative = entry.kind === "WITHDRAWAL" || entry.amountBrl < 0;
                const editable = editableMonthId !== null && entry.monthId === editableMonthId && entry.accountId === editableAccountId;

                return (
                  <tr key={entry.id} className="border-t border-border/60" data-transaction-kind={entry.kind}>
                    <td className="py-2.5 pr-3 font-mono whitespace-nowrap text-muted-foreground">
                      {dayLabel(entry.occurredOn)}
                      <span className="ml-1.5 text-[10px] text-muted-foreground/70">{monthLabel(entry.month)}</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          entry.kind === "CONTRIBUTION" || (entry.kind === "INCOME" && entry.amountBrl >= 0)
                            ? "bg-chart-up/12 text-chart-up"
                            : entry.kind === "WITHDRAWAL"
                              ? "bg-chart-down/12 text-chart-down"
                              : "bg-white/[0.06] text-muted-foreground",
                        )}
                      >
                        {TRANSACTION_LABELS[entry.kind]}
                      </span>
                      {entry.transferId ? (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">transferência interna</span>
                      ) : null}
                      {showAccountLabels ? (
                        <p className="mt-1 text-[10px] text-muted-foreground">{entry.accountLabel}</p>
                      ) : null}
                    </td>
                    {quoted ? (
                      <td className="py-2.5 pr-3 text-right font-mono">
                        {entry.quantity === 0 ? "—" : QUANTITY.format(entry.quantity)}
                      </td>
                    ) : null}
                    {quoted ? (
                      <td className="py-2.5 pr-3 text-right font-mono text-muted-foreground">
                        {entry.unitPriceBrl ? formatPriceBrl(entry.unitPriceBrl) : "—"}
                      </td>
                    ) : null}
                    <td className={cn("py-2.5 pr-3 text-right font-mono", negative ? "text-chart-down" : "text-foreground")}>
                      {negative ? "−" : ""}
                      {formatBrl(Math.abs(entry.amountBrl))}
                    </td>
                    <td className="max-w-[200px] truncate py-2.5 pr-3 text-muted-foreground">{entry.note ?? ""}</td>
                    <td className="py-2.5 text-right">
                      {editable ? (
                        <span className="flex justify-end gap-0.5">
                          {entry.transferId ? null : (
                            <button
                              type="button"
                              aria-label={`Corrigir ${TRANSACTION_LABELS[entry.kind].toLocaleLowerCase("pt-BR")} de ${dayLabel(entry.occurredOn)}`}
                              disabled={removing}
                              onClick={() => onEdit(entry)}
                              className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-40"
                            >
                              <PencilSimpleIcon aria-hidden="true" size={14} weight="bold" />
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label={`Apagar ${entry.transferId ? "liquidação" : TRANSACTION_LABELS[entry.kind].toLocaleLowerCase("pt-BR")} de ${dayLabel(entry.occurredOn)}`}
                            disabled={removing}
                            onClick={() => onRemove(entry)}
                            className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-40"
                          >
                            <TrashIcon aria-hidden="true" size={14} />
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Totais registrados (spec 058): aportes, retiradas e rendimentos separados, e o
 * saldo inicial, que não é aporte. A transferência interna de uma liquidação
 * aparece à parte. Quando a posição tem meses anteriores às movimentações ou
 * começa por saldo inicial, o custo anterior é desconhecido, e o aviso diz isso.
 */
function RecordedTotals({
  transactions,
  firstMonth,
  costSource,
}: {
  transactions: PositionTransactionView[];
  firstMonth: string | null;
  costSource?: "estimated" | "known" | "opening";
}) {
  const totals = [...recordedByMonth(transactions).values()].reduce(
    (sum, month) => ({
      contributions: sum.contributions + month.contributionsBrl,
      withdrawals: sum.withdrawals + month.withdrawalsBrl,
      income: sum.income + month.incomeBrl,
      opening: sum.opening + month.openingBrl,
      internal: sum.internal + month.internalBrl,
    }),
    { contributions: 0, withdrawals: 0, income: 0, opening: 0, internal: 0 },
  );
  const firstRecorded = transactions.reduce((min, entry) => (entry.month < min ? entry.month : min), transactions[0].month);
  const openingCost = costSource === "opening" || totals.opening > 0 || (firstMonth !== null && firstMonth < firstRecorded);
  const items = [
    { label: "Aportes", value: totals.contributions },
    { label: "Retiradas", value: totals.withdrawals },
    { label: "Rendimentos", value: totals.income },
    ...(totals.opening > 0 ? [{ label: "Saldo inicial", value: totals.opening }] : []),
  ];

  return (
    <div className="mt-4 space-y-2" data-testid="recorded-totals">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="rounded-xl border border-border/70 px-3 py-2">
            <dt className="text-[10px] tracking-[0.08em] text-muted-foreground uppercase">{item.label}</dt>
            <dd className="mt-0.5 font-mono text-xs text-foreground">{formatBrl(item.value)}</dd>
          </div>
        ))}
      </dl>
      {totals.internal !== 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {formatBrl(Math.abs(totals.internal))} em {totals.internal > 0 ? "entrada" : "saída"} por transferência interna
          (liquidação): não é dinheiro novo na carteira.
        </p>
      ) : null}
      {openingCost ? (
        <p className="text-[11px] text-muted-foreground" data-testid="opening-cost">
          O saldo inicial entra no valor aplicado pelo valor de entrada, sem o preço de compra real; o preço médio
          que o inclui é uma estimativa. Os aportes guardam o preço executado de cada operação.
        </p>
      ) : null}
    </div>
  );
}
