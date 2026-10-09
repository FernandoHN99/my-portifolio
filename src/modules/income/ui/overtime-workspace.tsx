"use client";

import { CheckCircleIcon, ClockCountdownIcon, HourglassMediumIcon, PlusIcon, ScalesIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { parseAsInteger, useQueryStates } from "nuqs";
import { useCallback, useRef, useState, useSyncExternalStore, useTransition } from "react";

import type { IncomeActionResult } from "@/app/actions/income";
import { undoOvertimeChangeAction } from "@/app/actions/overtime";
import { Badge } from "@/components/product/badge";
import { TONES } from "@/components/product/finance-parts";
import { KpiCard } from "@/components/product/kpi-card";
import { filterBadge, headerButton } from "@/components/product/page-controls";
import { formatCompetence, formatCompetenceLong } from "@/lib/competence";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { OvertimeMonthView, OvertimeView } from "@/modules/income/application/get-overtime-view";
import { formatHours, formatPeriod, isOverdue, STATUS_LABELS, summarizeOvertime } from "@/modules/income/domain/overtime";
import { OvertimeChart } from "@/modules/income/ui/overtime-chart";
import { OvertimeEntryDialog, type EntryTarget } from "@/modules/income/ui/overtime-entry-dialog";
import { OvertimeRulesDialog } from "@/modules/income/ui/overtime-rules-dialog";
import { STATUS_TONES } from "@/modules/income/ui/overtime-status";
import { headerPrimaryButtonClass } from "@/modules/portfolio/ui/edit-dialogs";
import { EditToast, type EditToastState } from "@/modules/portfolio/ui/edit-toast";

// Horas extras (spec 098), a segunda aba de Recebimentos: os cards, o gráfico e
// a tabela dos meses. Um formulário único cuida de cada mês: declarar as horas,
// anexar a folha e registrar o pagamento, como etapas ao declarar e como abas
// ao abrir uma linha. A conciliação respeita a defasagem de um mês.

type DialogState = { open: boolean; target: EntryTarget | null; key: number };

const yearOf = (month: string) => Number(month.slice(0, 4));

export function OvertimeWorkspace({ view }: { view: OvertimeView }) {
  const [query, setQuery] = useQueryStates({ ano: parseAsInteger }, { clearOnDefault: true });
  const currentYear = yearOf(view.currentCompetence);
  const years = [...new Set([currentYear, ...view.months.map((month) => yearOf(month.month))])].sort((a, b) => b - a);
  const year = query.ano !== null && years.includes(query.ano) ? query.ano : (years.find((option) => view.months.some((month) => yearOf(month.month) === option)) ?? currentYear);
  const months = view.months.filter((month) => yearOf(month.month) === year);
  const summary = summarizeOvertime(months);
  const otherYears = summarizeOvertime(view.months.filter((month) => yearOf(month.month) !== year));

  const [dialog, setDialog] = useState<DialogState>({ open: false, target: null, key: 0 });
  const [rulesOpen, setRulesOpen] = useState(false);
  const [toast, setToast] = useState<EditToastState | null>(null);
  const [isUndoing, startUndo] = useTransition();
  const sequence = useRef(0);
  const hydrated = useSyncExternalStore(subscribeNothing, isClient, isServer);

  const notify = useCallback((result: IncomeActionResult) => {
    setToast({ id: ++sequence.current, tone: result.ok ? "success" : "error", message: result.message, undoToken: result.ok ? result.undoToken : undefined });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);
  const undo = (token: string) => startUndo(async () => notify(await undoOvertimeChangeAction(token)));

  const openMonth = (id: string) => setDialog((current) => ({ open: true, key: current.key + 1, target: { mode: "edit", id } }));
  const openDeclare = () => setDialog((current) => ({ open: true, key: current.key + 1, target: { mode: "create" } }));
  // O formulário lê o mês da página a cada atualização (salvar recalcula tudo).
  const dialogMonth = dialog.target?.mode === "edit" ? (view.months.find((month) => month.id === (dialog.target as { id: string }).id) ?? null) : null;

  const dialogs = (
    <>
      <OvertimeEntryDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        target={dialog.target}
        month={dialogMonth}
        formKey={dialog.key}
        months={view.months}
        rules={view.rules}
        salaries={view.salaries}
        currentCompetence={view.currentCompetence}
        onSaved={notify}
      />
      <OvertimeRulesDialog open={rulesOpen} onOpenChange={setRulesOpen} rules={view.rules} firstMonth={view.months[0]?.month ?? view.currentCompetence} onSaved={notify} />
      <EditToast toast={toast} onDismiss={dismissToast} onUndo={undo} undoing={isUndoing} />
    </>
  );

  const actions = (
    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
      <button type="button" onClick={() => setRulesOpen(true)} className={headerButton({ variant: "secondary" })} data-testid="overtime-rules-button">
        <ScalesIcon aria-hidden="true" className="text-primary" size={16} weight="duotone" />
        Regras
      </button>
      <button type="button" onClick={openDeclare} className={headerPrimaryButtonClass} data-testid="overtime-declare-button">
        <PlusIcon aria-hidden="true" size={14} weight="bold" />
        Declarar horas
      </button>
    </div>
  );

  const shellClass = "relative mx-auto w-full max-w-[1472px] px-5 py-8 sm:px-7 sm:py-10 xl:px-12 xl:py-12";

  if (view.months.length === 0) {
    return (
      <div data-testid="overtime-workspace" data-hydrated={hydrated || undefined} className={shellClass}>
        <div className="flex min-h-[55dvh] flex-col items-center justify-center text-center">
          <span className="grid size-12 place-items-center rounded-2xl border border-border bg-card text-primary">
            <ClockCountdownIcon aria-hidden="true" size={22} weight="duotone" />
          </span>
          <h1 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">Nenhuma hora extra declarada ainda</h1>
          <div className="mt-6">{actions}</div>
        </div>
        {dialogs}
      </div>
    );
  }

  return (
    <div data-testid="overtime-workspace" data-hydrated={hydrated || undefined} className={shellClass}>
      <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[460px] w-[460px]" />

      <header className="flex flex-col gap-6 border-b border-border/70 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">Recebimentos</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-[2.65rem]">Horas extras</h1>
          <p className="mt-3 text-sm text-muted-foreground" data-testid="overtime-count">
            {months.length} {months.length === 1 ? "mês declarado" : "meses declarados"} em {year}
          </p>
        </div>
        {actions}
      </header>

      {years.length > 1 ? (
        <fieldset className="mt-6 min-w-0" data-testid="overtime-year-badges">
          <legend className="mb-2 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Ano de trabalho</legend>
          <div className="flex flex-wrap gap-2">
            {years.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={option === year}
                onClick={() => void setQuery({ ano: option === currentYear ? null : option })}
                className={filterBadge({ active: option === year, class: "font-mono" })}
              >
                {option}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <section aria-label="Resumo das horas extras" className="mt-6 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          dense
          icon={<ClockCountdownIcon aria-hidden="true" size={18} weight="duotone" />}
          label="Declaradas"
          value={formatHours(summary.worked)}
          valueData={{ "data-hours": summary.worked }}
          detail={`≈ ${formatCents(summary.estimatedCents)} pelas regras`}
          testId="overtime-kpi-worked"
        />
        <KpiCard
          dense
          icon={<CheckCircleIcon aria-hidden="true" size={18} weight="duotone" />}
          label="Pagas"
          value={formatHours(summary.paid)}
          valueData={{ "data-hours": summary.paid }}
          detail={`${formatCents(summary.receivedCents)} + ${formatCents(summary.dsrCents)} de DSR`}
          testId="overtime-kpi-paid"
        />
        <KpiCard
          dense
          tone={summary.overdue > 0 ? "spent" : "neutral"}
          emphasis={summary.overdue > 0}
          icon={<WarningCircleIcon aria-hidden="true" size={18} weight="duotone" />}
          label="Vencidas"
          value={formatHours(summary.overdue)}
          valueClassName={summary.overdue > 0 ? "text-chart-spent" : "text-foreground"}
          valueData={{ "data-hours": summary.overdue }}
          detail={
            summary.overdue > 0
              ? `≈ ${formatCents(summary.overdueValueCents)} não pagos em ${summary.overdueMonths} ${summary.overdueMonths === 1 ? "mês" : "meses"}`
              : otherYears.overdue > 0
                ? `${formatHours(otherYears.overdue)} em outros anos`
                : "nada vencido"
          }
          testId="overtime-kpi-overdue"
        />
        <KpiCard
          dense
          icon={<HourglassMediumIcon aria-hidden="true" size={18} weight="duotone" />}
          label="A vencer"
          value={formatHours(summary.awaiting)}
          valueData={{ "data-hours": summary.awaiting }}
          detail={summary.nextDue ? `≈ ${formatCents(summary.awaitingValueCents)} no holerite de ${formatCompetence(summary.nextDue)}` : "nada a vencer"}
          testId="overtime-kpi-awaiting"
        />
      </section>

      <section aria-label="Horas extras por mês" className="premium-panel mt-6 rounded-[24px] p-5 sm:p-7">
        <h2 className="mb-4 text-base font-semibold tracking-[-0.025em]">Declaradas × Pagas</h2>
        <OvertimeChart months={months} />
      </section>

      <section aria-label="Meses" className="premium-panel mt-6 rounded-[24px] p-4 sm:p-6">
        <h2 className="mb-4 flex flex-col gap-1 px-1 text-sm font-semibold tracking-[-0.025em] sm:flex-row sm:items-baseline sm:gap-2">
          Mês a mês
          <span className="text-[11px] font-normal text-muted-foreground">pagas no holerite do mês seguinte</span>
        </h2>
        <WorkTable months={months} onOpen={openMonth} />
      </section>

      {dialogs}
    </div>
  );
}

const cell = "px-1 py-3 sm:px-3";
const head = "px-3 pt-1 pb-2.5 text-[9px] font-semibold tracking-[0.1em] whitespace-nowrap text-muted-foreground/80 uppercase";
/**
 * A coluna do mês fica presa à esquerda quando a tabela completa rola, com o
 * fundo do painel (opaco, para os números passarem por baixo) e uma linha à
 * direita no lugar dos cantos arredondados das linhas.
 */
const stickyCell = "sm:sticky sm:left-0 sm:z-10 sm:bg-[oklch(0.148_0.012_165)] sm:shadow-[inset_-1px_0_0_var(--border)]";

function MonthName({ month }: { month: string }) {
  return (
    <span className="inline-flex items-baseline gap-px text-sm font-semibold text-foreground">
      {formatCompetence(month).split("/")[0]}
      <span className="text-[10px] font-normal text-muted-foreground">/{month.slice(2, 4)}</span>
    </span>
  );
}

function hoursCell(hours: number) {
  return hours === 0 ? <span className="text-muted-foreground/45">—</span> : formatHours(hours, { unit: false });
}

/**
 * Tabela dos meses: o que foi declarado (por faixa), o holerite em que deveria
 * vir, o que foi pago e o que falta, com a situação. A linha abre o formulário
 * do mês (declaração, anexo e pagamento). No celular, só mês, declaradas,
 * pagas e em aberto, com a situação junto do mês, sem rolagem horizontal.
 */
function WorkTable({ months, onOpen }: { months: OvertimeMonthView[]; onOpen: (id: string) => void }) {
  const total = (pick: (month: OvertimeMonthView) => number) => months.reduce((sum, month) => sum + pick(month), 0);
  const rest = (month: OvertimeMonthView) => month.totals.saturday + month.totals.sunday + month.totals.holiday;

  return (
    // `relative`: nada de posição absoluta dentro da tabela alarga a página no celular.
    <div className="relative overflow-x-auto overscroll-x-contain" data-testid="overtime-table-scroll">
      <table className="w-full table-fixed border-separate border-spacing-0 text-right text-xs tabular-nums sm:min-w-[780px] sm:table-auto" data-testid="overtime-table">
        <thead>
          <tr className="text-[9px] font-semibold text-muted-foreground uppercase sm:hidden">
            <th scope="col" className="w-[37%] px-1 pb-2 text-left">Mês</th>
            <th scope="col" className="px-1 pb-2">Declaradas</th>
            <th scope="col" className={cn("px-1 pb-2", TONES.saved.text)}>Pagas</th>
            <th scope="col" className={cn("px-1 pb-2", TONES.spent.text)}>Em aberto</th>
          </tr>
          <tr className="hidden sm:table-row">
            <th rowSpan={2} className={cn(stickyCell, "w-px px-3 pb-2 text-left align-bottom text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase")}>
              Mês
            </th>
            {[
              { label: "Declaradas", span: 4, tone: "neutral" as const },
              { label: "Pagamento", span: 3, tone: "saved" as const },
              { label: "Saldo", span: 2, tone: "spent" as const },
            ].map((group) => (
              <th key={group.label} colSpan={group.span} className="px-1.5 pb-2">
                <span className={cn("flex items-center justify-center gap-2 rounded-lg border-b-2 py-1.5 text-[10px] font-semibold tracking-[0.14em] text-foreground/90 uppercase", TONES[group.tone].tint, TONES[group.tone].rule)}>
                  <span aria-hidden="true" className={cn("size-1.5 rounded-full", TONES[group.tone].dot)} />
                  {group.label}
                </span>
              </th>
            ))}
          </tr>
          <tr className="hidden sm:table-row">
            <th className={cn(head, "border-l border-border/60")} title="Horas além da jornada, até 2 h por dia útil">Úteis ≤ 2 h</th>
            <th className={head} title="Horas além de 2 h extras por dia útil">Úteis &gt; 2 h</th>
            <th className={head} title="Sábados, domingos e feriados">Fds. e feriado</th>
            <th className={cn(head, "text-foreground/80")}>Total</th>
            <th className={cn(head, "border-l border-border/60 text-left")}>Holerite</th>
            <th className={cn(head, TONES.saved.text)}>Pagas</th>
            <th className={head}>Recebido</th>
            <th className={cn(head, "border-l border-border/60", TONES.spent.text)}>Em aberto</th>
            <th className={cn(head, "text-left")}>Situação</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {months.map((month) => (
            <tr
              key={month.id}
              data-testid="overtime-row"
              data-month={month.month}
              data-status={month.status}
              onClick={() => onOpen(month.id)}
              className="group cursor-pointer transition-colors hover:bg-white/[0.035]"
            >
              <td className={cn(cell, stickyCell, "border-t border-border/50 text-left font-sans group-first:border-t-0")}>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(month.id);
                  }}
                  aria-label={`Abrir ${formatCompetenceLong(month.month)}`}
                  className="flex min-h-11 w-full touch-manipulation flex-col items-start justify-center rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <MonthName month={month.month} />
                  <span className="hidden text-[10px] font-normal whitespace-nowrap text-muted-foreground sm:block">{formatPeriod(month.startsOn, month.endsOn).replace(" a ", "–")}</span>
                  <Badge tone={STATUS_TONES[month.status]} className="mt-1 max-w-full whitespace-normal sm:hidden">{STATUS_LABELS[month.status]}</Badge>
                </button>
              </td>
              <td className={cn(cell, "hidden sm:table-cell border-t border-l border-border/50 border-l-border/60 text-foreground/85 group-first:border-t-0")}>{hoursCell(month.totals.weekday)}</td>
              <td className={cn(cell, "hidden sm:table-cell border-t border-border/50 text-foreground/85 group-first:border-t-0")}>{hoursCell(month.totals.weekdayBeyond)}</td>
              <td className={cn(cell, "hidden sm:table-cell border-t border-border/50 text-foreground/85 group-first:border-t-0")}>{hoursCell(rest(month))}</td>
              <td className={cn(cell, "border-t border-border/50 font-semibold text-foreground group-first:border-t-0", TONES.neutral.tint)}>{formatHours(month.worked, { unit: false })}</td>
              <td className={cn(cell, "hidden sm:table-cell border-t border-l border-border/50 border-l-border/60 text-left font-sans whitespace-nowrap text-muted-foreground group-first:border-t-0")}>
                {formatCompetence(month.dueMonth)}
              </td>
              <td className={cn(cell, "border-t border-border/50 font-semibold whitespace-nowrap text-foreground group-first:border-t-0", TONES.saved.tint)}>
                {hoursCell(month.paid)}
                {month.paidLate > 0 ? <span className="hidden text-[10px] font-normal text-muted-foreground sm:block">{formatHours(month.paidLate)} com atraso</span> : null}
              </td>
              <td className={cn(cell, "hidden sm:table-cell border-t border-border/50 whitespace-nowrap text-foreground/85 group-first:border-t-0")}>
                {month.receivedCents ? formatCents(month.receivedCents) : <span className="text-muted-foreground/45">—</span>}
              </td>
              <td className={cn(cell, "border-t border-l border-border/50 border-l-border/60 group-first:border-t-0", TONES.spent.tint, isOverdue(month.status) ? "font-semibold text-chart-spent" : "text-foreground/85")}>
                {hoursCell(month.open)}
              </td>
              <td className={cn(cell, "hidden sm:table-cell rounded-r-xl border-t border-border/50 text-left font-sans group-first:border-t-0")}>
                <Badge tone={STATUS_TONES[month.status]}>{STATUS_LABELS[month.status]}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="font-mono">
          <tr>
            <td className={cn(stickyCell, "border-t-2 border-border px-1 py-3 text-left sm:px-3 font-sans text-[10px] font-semibold tracking-[0.12em] text-foreground uppercase")}>Total</td>
            <td className={cn(cell, "hidden sm:table-cell border-t-2 border-l border-border border-l-border/60")}>{formatHours(total((month) => month.totals.weekday), { unit: false })}</td>
            <td className={cn(cell, "hidden sm:table-cell border-t-2 border-border")}>{formatHours(total((month) => month.totals.weekdayBeyond), { unit: false })}</td>
            <td className={cn(cell, "hidden sm:table-cell border-t-2 border-border")}>{formatHours(total(rest), { unit: false })}</td>
            <td className={cn(cell, "border-t-2 border-border font-semibold", TONES.neutral.tint)} data-testid="overtime-total-worked">
              {formatHours(total((month) => month.worked), { unit: false })}
            </td>
            <td className="hidden border-t-2 border-l border-border border-l-border/60 sm:table-cell" />
            <td className={cn(cell, "border-t-2 border-border font-semibold", TONES.saved.tint)} data-testid="overtime-total-paid">
              {formatHours(total((month) => month.paid), { unit: false })}
            </td>
            <td className={cn(cell, "hidden sm:table-cell border-t-2 border-border whitespace-nowrap")}>{formatCents(total((month) => month.receivedCents ?? 0))}</td>
            <td className={cn(cell, "border-t-2 border-l border-border border-l-border/60 font-semibold", TONES.spent.tint)} data-testid="overtime-total-open">
              {formatHours(total((month) => month.open), { unit: false })}
            </td>
            <td className="hidden rounded-r-xl border-t-2 border-border sm:table-cell" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const subscribeNothing = () => () => {};
const isClient = () => true;
const isServer = () => false;
