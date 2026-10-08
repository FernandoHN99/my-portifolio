"use client";

import { ArchiveIcon, PlusIcon, WalletIcon } from "@phosphor-icons/react/dist/ssr";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { undoIncomeChangeAction, type IncomeActionResult } from "@/app/actions/income";
import { formatCompetence, formatCompetenceLong, isCompetence } from "@/lib/competence";
import { formatAmountInput, formatCents, type Cents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { IncomeLedger } from "@/modules/income/application/get-income-ledger";
import { incomeYears, summarizeYear, yearOf, type IncomeMonth, type MonthTotals } from "@/modules/income/domain/income";
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
type Row = IncomeMonth & { totals: MonthTotals };

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

  const launched = summary.months.filter((month) => month.totals.hasValues).length;

  return (
    <div data-testid="income-workspace" data-hydrated={hydrated || undefined} className={shellClass}>
      <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[460px] w-[460px]" />

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
        <SummaryCard label="Entradas" cents={summary.totals.incomeCents} testId="income-kpi-income" />
        <SummaryCard label="Saídas" cents={summary.totals.spendCents} testId="income-kpi-spend" tone="down" />
        <SummaryCard label="Poupado" cents={summary.totals.balanceCents} testId="income-kpi-balance" tone="up" emphasis />
        <SummaryCard label="Salário bruto" cents={summary.totals.grossCents} testId="income-kpi-gross" />
      </section>

      <section aria-label="Gastos e poupado" className="premium-panel mt-6 rounded-[24px] p-5 sm:p-7">
        <h2 className="mb-4 text-sm font-semibold tracking-[-0.01em]">Gastos × Poupado</h2>
        <IncomeChart summary={summary} />
      </section>

      <section aria-label="Meses" className="premium-panel mt-6 rounded-[24px] p-3 sm:p-5">
        {summary.months.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-muted-foreground">Nenhum mês lançado em {year}.</p>
        ) : (
          <>
            <MonthTable rows={summary.months} totals={summary.totals} onOpen={openMonth} />
            <MonthList rows={summary.months} totals={summary.totals} onOpen={openMonth} />
          </>
        )}
      </section>

      {dialogs}
    </div>
  );
}

type YearTotals = { incomeCents: Cents; spendCents: Cents; balanceCents: Cents; grossCents: Cents };

/** Na tabela, só o número, como as colunas do Excel: "20.497,70", "+5.157,67". */
function amount(cents: Cents, { signed = false }: { signed?: boolean } = {}) {
  const text = formatAmountInput(Math.abs(cents));
  return cents < 0 ? `−${text}` : signed && cents > 0 ? `+${text}` : text;
}

const cell = (cents: Cents | null) => (cents === null ? "—" : amount(cents));

/** Tabela como a do Excel: Entradas, Saídas e Resumo, com o bruto ao fim. */
function MonthTable({ rows, totals, onOpen }: { rows: Row[]; totals: YearTotals; onOpen: (month: string) => void }) {
  return (
    <table className="hidden w-full text-right text-xs tabular-nums xl:table" data-testid="income-table">
      <thead>
        <tr className="text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
          <th className="px-2.5 pt-2 text-left font-semibold" rowSpan={2}>
            Mês <span className="font-normal tracking-normal normal-case">(R$)</span>
          </th>
          <th className="px-2.5 pt-2 text-center font-semibold" colSpan={3}>
            Entradas
          </th>
          <th className="px-2.5 pt-2 text-center font-semibold" colSpan={4}>
            Saídas
          </th>
          <th className="px-2.5 pt-2 font-semibold" rowSpan={2}>
            Balanço
          </th>
          <th className="px-2.5 pt-2 font-semibold" rowSpan={2}>
            Bruto
          </th>
        </tr>
        <tr className="text-[9px] font-semibold tracking-[0.1em] whitespace-nowrap text-muted-foreground/80 uppercase">
          <th className="px-2.5 pt-1 pb-2 font-medium">Salário + extras</th>
          <th className="px-2.5 pt-1 pb-2 font-medium">VA/VR</th>
          <th className="px-2.5 pt-1 pb-2 font-medium">Total</th>
          <th className="px-2.5 pt-1 pb-2 font-medium">Cartão</th>
          <th className="px-2.5 pt-1 pb-2 font-medium">PIX</th>
          <th className="px-2.5 pt-1 pb-2 font-medium">VA/VR</th>
          <th className="px-2.5 pt-1 pb-2 font-medium">Total</th>
        </tr>
      </thead>
      <tbody className="font-mono">
        {rows.map((row) => (
          <tr
            key={row.id}
            data-testid="income-row"
            data-month={row.month}
            onClick={() => onOpen(row.month)}
            className="cursor-pointer border-t border-border/60 transition-colors hover:bg-white/[0.03]"
          >
            <td className="px-2.5 py-2.5 text-left font-sans">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpen(row.month);
                }}
                aria-label={`Abrir ${formatCompetenceLong(row.month)}`}
                className="rounded font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {formatCompetence(row.month)}
              </button>
            </td>
            <td className="px-2.5 py-2.5 text-foreground/85">{cell(row.netIncomeCents)}</td>
            <td className="px-2.5 py-2.5 text-foreground/85">{cell(row.mealVoucherCents)}</td>
            <td className="px-2.5 py-2.5 text-foreground">{row.totals.hasValues ? amount(row.totals.incomeCents) : "—"}</td>
            <td className="px-2.5 py-2.5 text-foreground/85">{cell(row.cardSpendCents)}</td>
            <td className="px-2.5 py-2.5 text-foreground/85">{cell(row.pixSpendCents)}</td>
            <td className="px-2.5 py-2.5 text-foreground/85">{cell(row.mealVoucherSpendCents)}</td>
            <td className="px-2.5 py-2.5 text-foreground">{row.totals.hasValues ? amount(row.totals.spendCents) : "—"}</td>
            <td className={cn("px-2.5 py-2.5", balanceColor(row.totals.balanceCents))}>
              {row.totals.hasValues ? amount(row.totals.balanceCents, { signed: true }) : "—"}
            </td>
            <td className="px-2.5 py-2.5 text-muted-foreground">{row.payslips.length > 0 ? amount(row.totals.grossCents) : "—"}</td>
          </tr>
        ))}
      </tbody>
      <tfoot className="font-mono">
        <tr className="border-t border-border text-foreground">
          <td className="px-2.5 py-3 text-left font-sans text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Total</td>
          <td colSpan={2} />
          <td className="px-2.5 py-3" data-testid="income-total-income">
            {amount(totals.incomeCents)}
          </td>
          <td colSpan={3} />
          <td className="px-2.5 py-3" data-testid="income-total-spend">
            {amount(totals.spendCents)}
          </td>
          <td className={cn("px-2.5 py-3", balanceColor(totals.balanceCents))} data-testid="income-total-balance">
            {amount(totals.balanceCents, { signed: true })}
          </td>
          <td className="px-2.5 py-3 text-muted-foreground">{amount(totals.grossCents)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

/** No celular e em telas médias, um bloco por mês, sem rolagem lateral. */
function MonthList({ rows, totals, onOpen }: { rows: Row[]; totals: YearTotals; onOpen: (month: string) => void }) {
  return (
    <div className="xl:hidden" data-testid="income-list">
      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              data-testid="income-card"
              data-month={row.month}
              onClick={() => onOpen(row.month)}
              aria-label={`Abrir ${formatCompetenceLong(row.month)}`}
              className="w-full rounded-2xl border border-border/70 bg-card/50 p-3.5 text-left outline-none transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold">{formatCompetenceLong(row.month)}</span>
                <span className={cn("font-mono text-sm", balanceColor(row.totals.balanceCents))}>
                  {row.totals.hasValues ? formatCents(row.totals.balanceCents, { signed: true }) : "—"}
                </span>
              </span>
              <span className="mt-2.5 grid grid-cols-1 gap-1 text-[10px] text-muted-foreground min-[360px]:grid-cols-3 min-[360px]:gap-2">
                <ListValue label="Entradas" value={row.totals.hasValues ? formatCents(row.totals.incomeCents) : "—"} />
                <ListValue label="Saídas" value={row.totals.hasValues ? formatCents(row.totals.spendCents) : "—"} />
                <ListValue label="Bruto" value={row.payslips.length > 0 ? formatCents(row.totals.grossCents) : "—"} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <dl className="mt-3 grid grid-cols-1 gap-1 rounded-2xl border border-border bg-background/30 p-3.5 text-[10px] text-muted-foreground min-[360px]:grid-cols-3 min-[360px]:gap-2">
        <ListValue label="Entradas" value={formatCents(totals.incomeCents)} />
        <ListValue label="Saídas" value={formatCents(totals.spendCents)} />
        <ListValue label="Poupado" value={formatCents(totals.balanceCents, { signed: true })} valueClassName={balanceColor(totals.balanceCents)} />
      </dl>
    </div>
  );
}

/** Rótulo e valor: em linha abaixo de 360 px, empilhados nas colunas acima. */
function ListValue({ label, value, valueClassName = "text-foreground" }: { label: string; value: string; valueClassName?: string }) {
  return (
    <span className="flex min-w-0 items-baseline justify-between gap-2 min-[360px]:block">
      <span className="tracking-[0.08em] uppercase min-[360px]:block">{label}</span>
      <span className={cn("truncate font-mono text-[11px] min-[360px]:mt-0.5 min-[360px]:block", valueClassName)}>{value}</span>
    </span>
  );
}

function balanceColor(cents: Cents) {
  if (cents === 0) return "text-foreground";
  return cents > 0 ? "text-primary" : "text-warning-foreground";
}

function SummaryCard({
  label,
  cents,
  tone,
  emphasis = false,
  testId,
}: {
  label: string;
  cents: Cents;
  /** Valores seguem Gastos familiares; a paleta acessível fica no gráfico. */
  tone?: "up" | "down";
  emphasis?: boolean;
  testId: string;
}) {
  const color =
    cents === 0 ? "text-foreground" : tone === "down" ? "text-warning-foreground" : tone === "up" ? balanceColor(cents) : "text-foreground";

  return (
    <article className={cn("metric-card rounded-2xl p-4 sm:p-5", emphasis && "border-primary/25")}>
      <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p
        data-testid={testId}
        data-cents={cents}
        className={cn("mt-4 font-mono text-xl font-medium tracking-[-0.05em] min-[360px]:text-[15px] min-[400px]:text-base sm:text-xl xl:text-2xl xl:tracking-[-0.04em]", color)}
      >
        {formatCents(cents, { signed: tone === "up" })}
      </p>
    </article>
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
