"use client";

import {
  ArchiveIcon,
  ArrowCircleDownIcon,
  ArrowCircleUpIcon,
  BriefcaseIcon,
  PiggyBankIcon,
  PlusIcon,
  WalletIcon,
} from "@phosphor-icons/react/dist/ssr";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { undoIncomeChangeAction, type IncomeActionResult } from "@/app/actions/income";
import { RateBar, SummaryCard, TONES, type Tone } from "@/components/product/finance-parts";
import { formatCompetence, formatCompetenceLong, isCompetence } from "@/lib/competence";
import { formatAmountInput, formatCents, type Cents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { IncomeLedger } from "@/modules/income/application/get-income-ledger";
import {
  incomeYears,
  savingsRatePercent,
  summarizeYear,
  yearOf,
  type IncomeMonth,
  type MonthTotals,
  type YearColumnKey,
  type YearColumns,
} from "@/modules/income/domain/income";
import { IncomeBackupDialog } from "@/modules/income/ui/income-backup-dialog";
import { IncomeChart } from "@/modules/income/ui/income-chart";
import { MonthDialog, type MonthDialogTarget } from "@/modules/income/ui/month-dialog";
import { headerPrimaryButtonClass } from "@/modules/portfolio/ui/edit-dialogs";
import { EditToast, type EditToastState } from "@/modules/portfolio/ui/edit-toast";

// Recebimentos (spec 088): entradas, saídas e o balanço de cada mês do ano,
// com o gráfico Gastos × Poupado e os holerites que alimentam a Previdência.
// O ano fica na URL (`?ano=`); `?mes=` abre um mês, como fazem os links da
// Previdência.

type DialogState = { open: boolean; target: MonthDialogTarget | null; key: number };

export function IncomeWorkspace({ ledger, menu }: { ledger: IncomeLedger; menu?: ReactNode }) {
  const [query, setQuery] = useQueryStates({ ano: parseAsInteger, mes: parseAsString }, { clearOnDefault: true });
  const currentYear = yearOf(ledger.currentCompetence);
  const years = incomeYears(ledger.months, currentYear);
  const year = query.ano !== null && years.includes(query.ano) ? query.ano : currentYear;
  const summary = summarizeYear(ledger.months, year);
  const targetFor = useCallback(
    (month: string): MonthDialogTarget => {
      const existing = ledger.months.find((entry) => entry.month === month);
      return existing ? { mode: "edit", month: existing } : { mode: "create", month };
    },
    [ledger.months],
  );
  // `?mes=AAAA-MM` vem do link da Previdência: a página já abre nesse mês.
  const [dialog, setDialog] = useState<DialogState>(() =>
    query.mes && isCompetence(query.mes)
      ? { open: true, target: targetFor(query.mes), key: 1 }
      : { open: false, target: null, key: 0 },
  );
  const [backupOpen, setBackupOpen] = useState(false);
  const [toast, setToast] = useState<EditToastState | null>(null);
  const [isUndoing, startUndo] = useTransition();
  const sequence = useRef(0);
  // Marca a página hidratada para os testes de interface.
  const hydrated = useSyncExternalStore(subscribeNothing, isClient, isServer);

  const notify = useCallback((result: IncomeActionResult) => {
    setToast({
      id: ++sequence.current,
      tone: result.ok ? "success" : "error",
      message: result.message,
      undoToken: result.ok ? result.undoToken : undefined,
    });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  const undo = (token: string) =>
    startUndo(async () => {
      notify(await undoIncomeChangeAction(token));
    });

  const openMonth = (month: string) =>
    setDialog((current) => ({ open: true, key: current.key + 1, target: targetFor(month) }));

  const openCreate = () => {
    const taken = new Set(ledger.months.map((entry) => entry.month));
    const month = !taken.has(ledger.currentCompetence) ? ledger.currentCompetence : "";
    setDialog((current) => ({ open: true, key: current.key + 1, target: { mode: "create", month } }));
  };

  // O mês aberto pelo link sai da URL, e a tabela mostra o ano dele.
  useEffect(() => {
    if (query.mes) {
      const year = isCompetence(query.mes) ? yearOf(query.mes) : currentYear;
      void setQuery({ mes: null, ano: year === currentYear ? null : year });
    }
  }, [query.mes, setQuery, currentYear]);

  useHotkeys(
    "n",
    (event) => {
      event.preventDefault();
      openCreate();
    },
    // Só com a página livre: nunca por cima de um formulário aberto.
    { enabled: !dialog.open && !backupOpen },
  );

  const dialogs = (
    <>
      <MonthDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        target={dialog.target}
        formKey={dialog.key}
        employers={ledger.employers}
        onSaved={notify}
      />
      <IncomeBackupDialog open={backupOpen} onOpenChange={setBackupOpen} />
      <EditToast toast={toast} onDismiss={dismissToast} onUndo={undo} undoing={isUndoing} />
    </>
  );

  const actions = (
    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
      <button type="button" onClick={() => setBackupOpen(true)} className={secondaryHeaderButtonClass}>
        <ArchiveIcon aria-hidden="true" className="text-primary" size={16} weight="duotone" />
        Backup
      </button>
      <button type="button" onClick={openCreate} className={headerPrimaryButtonClass} aria-keyshortcuts="n">
        <PlusIcon aria-hidden="true" size={14} weight="bold" />
        Novo mês
      </button>
    </div>
  );

  const shellClass = "relative mx-auto w-full max-w-[1472px] px-5 py-8 sm:px-7 sm:py-10 xl:px-12 xl:py-12";

  if (ledger.months.length === 0) {
    return (
      <div data-testid="income-workspace" data-hydrated={hydrated || undefined} className={shellClass}>
        {menu}
        <div className="flex min-h-[55dvh] flex-col items-center justify-center text-center">
          <span className="grid size-12 place-items-center rounded-2xl border border-border bg-card text-primary">
            <WalletIcon aria-hidden="true" size={22} weight="duotone" />
          </span>
          <h1 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">Nenhum mês lançado ainda</h1>
          <div className="mt-6">{actions}</div>
        </div>
        {dialogs}
      </div>
    );
  }

  const launched = summary.launched;
  const { columns } = summary;
  const yearRate = savingsRatePercent(summary.totals.incomeCents, summary.totals.balanceCents);
  const payslipCount = summary.months.reduce((sum, month) => sum + month.payslips.length, 0);

  return (
    <div data-testid="income-workspace" data-hydrated={hydrated || undefined} className={shellClass}>
      <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[460px] w-[460px]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-24 left-0 -z-10 hidden h-[380px] w-[380px] rounded-full bg-chart-spent/[0.06] blur-3xl sm:block"
      />

      <header className="flex flex-col gap-6 border-b border-border/70 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            {menu}
            <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">Finanças</p>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-[2.65rem]">Recebimentos</h1>
          <p className="mt-3 text-sm text-muted-foreground" data-testid="income-count">
            {launched} {launched === 1 ? "mês lançado" : "meses lançados"} em {year}
          </p>
        </div>
        {actions}
      </header>

      <fieldset className="mt-6 min-w-0" data-testid="income-year-badges">
        <legend className="mb-2 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Ano</legend>
        <div className="flex flex-wrap gap-2">
          {years.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === year}
              onClick={() => void setQuery({ ano: option === currentYear ? null : option })}
              className={cn(filterBadgeClass, "font-mono", option === year ? activeFilterBadgeClass : inactiveFilterBadgeClass)}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>

      <section aria-label="Resumo do ano" className="mt-6 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          tone="saved"
          icon={ArrowCircleDownIcon}
          label="Entradas"
          cents={summary.totals.incomeCents}
          detail={columns.income.months > 0 ? `média de ${formatCents(columns.income.averageCents)} por mês` : "sem meses lançados"}
          testId="income-kpi-income"
        />
        <SummaryCard
          tone="spent"
          icon={ArrowCircleUpIcon}
          label="Saídas"
          cents={summary.totals.spendCents}
          detail={columns.spend.months > 0 ? `média de ${formatCents(columns.spend.averageCents)} por mês` : "sem meses lançados"}
          valueClassName="text-chart-spent"
          testId="income-kpi-spend"
        />
        <SummaryCard
          tone="saved"
          icon={PiggyBankIcon}
          label="Poupado"
          cents={summary.totals.balanceCents}
          detail={yearRate === null ? "sem entradas" : `${yearRate}% das entradas`}
          valueClassName={balanceColor(summary.totals.balanceCents)}
          signed
          emphasis
          testId="income-kpi-balance"
        >
          {yearRate !== null ? <RateBar rate={yearRate} className="mt-3 h-1.5 w-full" /> : null}
        </SummaryCard>
        <SummaryCard
          tone="neutral"
          icon={BriefcaseIcon}
          label="Salário bruto"
          cents={summary.totals.grossCents}
          detail={`${payslipCount} ${payslipCount === 1 ? "holerite" : "holerites"} no ano`}
          testId="income-kpi-gross"
        />
      </section>

      <section aria-label="Gastos e poupado" className="premium-panel mt-6 rounded-[24px] p-5 sm:p-7">
        <h2 className="mb-4 text-sm font-semibold tracking-[-0.01em]">Gastos × Poupado</h2>
        <IncomeChart summary={summary} />
      </section>

      <section aria-label="Meses" className="premium-panel mt-6 rounded-[24px] p-4 sm:p-6">
        <h2 className="mb-4 px-1 text-sm font-semibold tracking-[-0.01em]">Mês a mês</h2>
        {summary.months.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-muted-foreground">Nenhum mês lançado em {year}.</p>
        ) : (
          <>
            <MonthTable rows={summary.months} columns={columns} currentMonth={ledger.currentCompetence} onOpen={openMonth} />
            <MonthList rows={summary.months} totals={summary.totals} currentMonth={ledger.currentCompetence} onOpen={openMonth} />
          </>
        )}
      </section>

      {dialogs}
    </div>
  );
}

/** Na tabela, só o número, como as colunas do Excel: "20.497,70", "+5.157,67". */
function amount(cents: Cents, { signed = false }: { signed?: boolean } = {}) {
  const text = formatAmountInput(Math.abs(cents));
  return cents < 0 ? `−${text}` : signed && cents > 0 ? `+${text}` : text;
}

/** Saldo do mês: menta quando sobra, violeta quando falta, neutro no zero. */
function balanceColor(cents: Cents) {
  if (cents === 0) return "text-foreground";
  return cents > 0 ? "text-primary" : "text-chart-spent";
}

type Row = IncomeMonth & { totals: MonthTotals };

type Column = {
  key: YearColumnKey;
  label: string;
  /** Soma do grupo: ganha o tom do grupo e um fundo discreto. */
  total?: boolean;
  /** Referência que não entra no total, como o salário bruto. */
  reference?: boolean;
};

const GROUPS: { key: string; label: string; tone: Tone; columns: Column[] }[] = [
  {
    key: "in",
    label: "Entradas",
    tone: "saved",
    columns: [
      { key: "gross", label: "Bruto", reference: true },
      { key: "net", label: "Líquido + extras" },
      { key: "mealVoucher", label: "VA/VR" },
      { key: "income", label: "Total", total: true },
    ],
  },
  {
    key: "out",
    label: "Saídas",
    tone: "spent",
    columns: [
      { key: "card", label: "Cartão" },
      { key: "pix", label: "PIX" },
      { key: "mealVoucherSpend", label: "VA/VR" },
      { key: "spend", label: "Total", total: true },
    ],
  },
  { key: "sum", label: "Resumo", tone: "neutral", columns: [{ key: "balance", label: "Balanço", total: true }] },
];

/** Valor de uma coluna num mês; nulo é não lançado e aparece como "—". */
function valueOf(row: Row, key: YearColumnKey): Cents | null {
  const hasValues = row.totals.hasValues;

  switch (key) {
    case "gross":
      return row.payslips.length > 0 ? row.totals.grossCents : null;
    case "net":
      return row.netIncomeCents;
    case "mealVoucher":
      return row.mealVoucherCents;
    case "income":
      return hasValues ? row.totals.incomeCents : null;
    case "card":
      return row.cardSpendCents;
    case "pix":
      return row.pixSpendCents;
    case "mealVoucherSpend":
      return row.mealVoucherSpendCents;
    case "spend":
      return hasValues ? row.totals.spendCents : null;
    case "balance":
      return hasValues ? row.totals.balanceCents : null;
  }
}

const cellPadding = "px-3 py-3";

/**
 * Tabela como a do Excel, agora com o bruto nas Entradas (só como referência,
 * fora do total), grupos coloridos e a taxa de poupança no Balanço. O rodapé
 * traz o total e a média de cada coluna.
 */
function MonthTable({
  rows,
  columns,
  currentMonth,
  onOpen,
}: {
  rows: Row[];
  columns: YearColumns;
  currentMonth: string;
  onOpen: (month: string) => void;
}) {
  const balanceRate = (income: Cents, balance: Cents) => savingsRatePercent(income, balance);

  return (
    <div className="hidden overflow-x-auto min-[1420px]:block">
      <table className="w-full border-separate border-spacing-0 text-right text-xs tabular-nums" data-testid="income-table">
        <thead>
          <tr>
            <th rowSpan={2} className="px-3 pb-2 text-left align-bottom text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
              Mês
            </th>
            {GROUPS.map((group) => (
              <th key={group.key} colSpan={group.columns.length} className="px-1.5 pb-2">
                <span
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border-b-2 py-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase",
                    TONES[group.tone].tint,
                    TONES[group.tone].rule,
                    group.tone === "neutral" ? "text-muted-foreground" : "text-foreground/90",
                  )}
                >
                  <span aria-hidden="true" className={cn("size-1.5 rounded-full", TONES[group.tone].dot)} />
                  {group.label}
                </span>
              </th>
            ))}
          </tr>
          <tr className="text-[9px] font-semibold tracking-[0.1em] whitespace-nowrap uppercase">
            {GROUPS.flatMap((group) =>
              group.columns.map((column, index) => (
                <th
                  key={column.key}
                  title={column.reference ? "Salário bruto dos holerites: referência, fora do total" : undefined}
                  className={cn(
                    "px-3 pt-1 pb-2.5",
                    index === 0 && "border-l border-border/60",
                    column.total ? TONES[group.tone].text : "text-muted-foreground/80",
                    column.total && group.tone === "neutral" && "text-foreground/80",
                  )}
                >
                  {column.label}
                  {column.reference ? <span className="ml-1 text-[8px] tracking-normal text-muted-foreground/60 normal-case">ref.</span> : null}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody className="font-mono">
          {rows.map((row) => (
            <tr
              key={row.id}
              data-testid="income-row"
              data-month={row.month}
              onClick={() => onOpen(row.month)}
              className="group cursor-pointer transition-colors hover:bg-white/[0.035]"
            >
              <td className={cn(cellPadding, "rounded-l-xl border-t border-border/50 text-left font-sans group-first:border-t-0")}>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(row.month);
                  }}
                  aria-label={`Abrir ${formatCompetenceLong(row.month)}`}
                  className="inline-flex items-baseline gap-px rounded text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {formatCompetence(row.month).split("/")[0]}
                  <span className="text-[10px] font-normal text-muted-foreground">/{row.month.slice(2, 4)}</span>
                  {row.month === currentMonth ? <span aria-label="mês atual" title="Mês atual" className="ml-1.5 size-1.5 self-center rounded-full bg-primary" /> : null}
                </button>
              </td>
              {GROUPS.flatMap((group) =>
                group.columns.map((column, index) => {
                  const value = valueOf(row, column.key);
                  const border = cn(cellPadding, "border-t border-border/50 group-first:border-t-0", index === 0 && "border-l border-l-border/60");

                  if (column.key === "balance") {
                    const rate = balanceRate(row.totals.incomeCents, row.totals.balanceCents);

                    return (
                      <td key={column.key} className={cn(border, TONES[group.tone].tint, "rounded-r-xl")}>
                        {value === null ? (
                          <span className="text-muted-foreground/50">—</span>
                        ) : (
                          <span className="flex items-center justify-end gap-2.5">
                            {rate !== null ? (
                              <>
                                <span className="w-9 text-[10px] text-muted-foreground">{rate}%</span>
                                <RateBar rate={rate} className="h-1 w-10" />
                              </>
                            ) : null}
                            <span className={cn("min-w-[5.5rem] text-[13px] font-semibold", balanceColor(value))}>{amount(value, { signed: true })}</span>
                          </span>
                        )}
                      </td>
                    );
                  }

                  return (
                    <td
                      key={column.key}
                      className={cn(
                        border,
                        column.total && cn(TONES[group.tone].tint, "font-semibold text-foreground"),
                        column.reference && "text-muted-foreground/75",
                        !column.total && !column.reference && "text-foreground/85",
                      )}
                    >
                      {value === null ? <span className="text-muted-foreground/45">—</span> : amount(value)}
                    </td>
                  );
                }),
              )}
            </tr>
          ))}
        </tbody>
        <tfoot className="font-mono">
          {(["total", "average"] as const).map((kind) => (
            <tr key={kind} className={kind === "total" ? "bg-white/[0.03]" : undefined}>
              <td
                title={kind === "average" ? "Média dos meses com valor em cada coluna" : undefined}
                className={cn(
                  "px-3 py-3 text-left font-sans text-[10px] font-semibold tracking-[0.12em] uppercase",
                  kind === "total" ? "rounded-l-xl border-t-2 border-border text-foreground" : "text-muted-foreground",
                )}
              >
                {kind === "total" ? "Total" : "Média"}
              </td>
              {GROUPS.flatMap((group) =>
                group.columns.map((column, index) => {
                  const stat = columns[column.key];
                  const cents = kind === "total" ? stat.totalCents : stat.averageCents;
                  const rate = column.key === "balance" ? balanceRate(
                    kind === "total" ? columns.income.totalCents : columns.income.averageCents,
                    cents,
                  ) : null;
                  const testId =
                    kind === "total" ? { income: "income-total-income", spend: "income-total-spend", balance: "income-total-balance" }[column.key as string] : undefined;

                  return (
                    <td
                      key={column.key}
                      data-testid={testId}
                      data-cents={testId ? cents : undefined}
                      className={cn(
                        cellPadding,
                        index === 0 && "border-l border-l-border/60",
                        kind === "total" ? "border-t-2 border-border font-semibold" : "text-[11px]",
                        column.total && TONES[group.tone].tint,
                        column.key === "balance" && kind === "total" && "rounded-r-xl",
                        kind === "total"
                          ? column.key === "balance"
                            ? balanceColor(cents)
                            : column.total
                              ? "text-foreground"
                              : "text-foreground/85"
                          : "text-muted-foreground",
                      )}
                    >
                      {stat.months === 0 ? (
                        <span className="text-muted-foreground/45">—</span>
                      ) : column.key === "balance" ? (
                        <span className="flex items-center justify-end gap-2.5">
                          {rate !== null ? (
                            <>
                              <span className="w-9 text-[10px] text-muted-foreground">{rate}%</span>
                              <RateBar rate={rate} className="h-1 w-10" />
                            </>
                          ) : null}
                          <span className="min-w-[5.5rem]">{amount(cents, { signed: true })}</span>
                        </span>
                      ) : (
                        amount(cents)
                      )}
                    </td>
                  );
                }),
              )}
            </tr>
          ))}
        </tfoot>
      </table>
    </div>
  );
}

type YearTotals = { incomeCents: Cents; spendCents: Cents; balanceCents: Cents; grossCents: Cents };

/** Abaixo de 1420 px (onde a tabela cabe inteira), um bloco por mês, sem rolagem lateral. */
function MonthList({
  rows,
  totals,
  currentMonth,
  onOpen,
}: {
  rows: Row[];
  totals: YearTotals;
  currentMonth: string;
  onOpen: (month: string) => void;
}) {
  const yearRate = savingsRatePercent(totals.incomeCents, totals.balanceCents);

  return (
    <div className="min-[1420px]:hidden" data-testid="income-list">
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {rows.map((row) => {
          const rate = savingsRatePercent(row.totals.incomeCents, row.totals.balanceCents);

          return (
            <li key={row.id}>
              <button
                type="button"
                data-testid="income-card"
                data-month={row.month}
                onClick={() => onOpen(row.month)}
                aria-label={`Abrir ${formatCompetenceLong(row.month)}`}
                className="group relative w-full overflow-hidden rounded-2xl border border-border/70 bg-card/50 p-4 pl-5 text-left outline-none transition-colors hover:border-primary/25 hover:bg-white/[0.035] focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-chart-saved to-chart-spent" />
                <span className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {formatCompetenceLong(row.month)}
                    {row.month === currentMonth ? <span aria-label="mês atual" title="Mês atual" className="size-1.5 rounded-full bg-primary" /> : null}
                  </span>
                  {row.totals.hasValues ? (
                    <span className={cn("rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold", row.totals.balanceCents < 0 ? TONES.spent.chip : TONES.saved.chip)}>
                      {formatCents(row.totals.balanceCents, { signed: true })}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </span>
                <span className="mt-3.5 grid grid-cols-1 gap-1.5 min-[360px]:grid-cols-3 min-[360px]:gap-2">
                  <ListValue tone="saved" label="Entradas" value={row.totals.hasValues ? formatCents(row.totals.incomeCents) : "—"} />
                  <ListValue tone="spent" label="Saídas" value={row.totals.hasValues ? formatCents(row.totals.spendCents) : "—"} />
                  <ListValue tone="neutral" label="Bruto" value={row.payslips.length > 0 ? formatCents(row.totals.grossCents) : "—"} />
                </span>
                {rate !== null ? (
                  <span className="mt-3.5 flex items-center gap-2.5 text-[10px] text-muted-foreground">
                    <RateBar rate={rate} className="h-1 flex-1" />
                    <span className="w-24 text-right">{rate}% poupado</span>
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <dl className="mt-4 grid grid-cols-1 gap-1.5 rounded-2xl border border-border bg-white/[0.03] p-4 min-[420px]:grid-cols-3 min-[420px]:gap-2">
        <ListValue wide tone="saved" label="Entradas" value={formatCents(totals.incomeCents)} />
        <ListValue wide tone="spent" label="Saídas" value={formatCents(totals.spendCents)} />
        <ListValue
          wide
          tone="saved"
          label={yearRate === null ? "Poupado" : `Poupado · ${yearRate}%`}
          value={formatCents(totals.balanceCents, { signed: true })}
          valueClassName={balanceColor(totals.balanceCents)}
        />
      </dl>
    </div>
  );
}

/** Rótulo com a marca do tom e o valor: em linha abaixo de 360 px, empilhados acima. */
function ListValue({
  tone,
  label,
  value,
  valueClassName = "text-foreground",
  wide = false,
}: {
  tone: Tone;
  label: string;
  value: string;
  valueClassName?: string;
  /** Valores maiores, como os totais do ano: só viram colunas a partir de 420 px. */
  wide?: boolean;
}) {
  return (
    <span className={cn("flex min-w-0 items-baseline justify-between gap-2", wide ? "min-[420px]:block" : "min-[360px]:block")}>
      <span className="flex items-center gap-1.5 text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
        <span aria-hidden="true" className={cn("size-1.5 rounded-full", TONES[tone].dot)} />
        {label}
      </span>
      <span className={cn("truncate font-mono text-[11px]", wide ? "min-[420px]:mt-1 min-[420px]:block" : "min-[360px]:mt-1 min-[360px]:block", valueClassName)}>
        {value}
      </span>
    </span>
  );
}

const subscribeNothing = () => () => {};
const isClient = () => true;
const isServer = () => false;

const filterBadgeClass =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 sm:h-8";
const activeFilterBadgeClass = "border-primary/30 bg-primary/[0.08] text-primary";
const inactiveFilterBadgeClass = "border-border bg-card/60 text-muted-foreground hover:text-foreground";
const secondaryHeaderButtonClass =
  "inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card/70 px-3.5 text-xs font-semibold text-foreground outline-none transition-colors hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-ring/50";
