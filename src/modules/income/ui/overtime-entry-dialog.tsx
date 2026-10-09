"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import { CircleNotchIcon, TrashIcon, XCircleIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { IncomeActionResult } from "@/app/actions/income";
import { deleteOvertimeMonthAction, saveOvertimeEntryAction } from "@/app/actions/overtime";
import { Badge } from "@/components/product/badge";
import { addCompetenceMonths, formatCompetence, formatCompetenceLong, isCompetence, type Competence } from "@/lib/competence";
import type { OvertimeMonthView } from "@/modules/income/application/get-overtime-view";
import { addDays } from "@/modules/portfolio/domain/business-days";
import {
  dayOvertime,
  formatHours,
  formatHoursInput,
  formatPeriod,
  hourlyRates,
  isOverdue,
  OVERTIME_CATEGORIES,
  OVERTIME_PAY_KINDS,
  payableByCategory,
  paymentTiming,
  paymentValue,
  ruleFor,
  STATUS_LABELS,
  totalsFromDays,
  type DayType,
  type OvertimeRule,
  type OvertimeTotals,
  type PaymentView,
  type PayslipSalary,
} from "@/modules/income/domain/overtime";
import {
  AttachmentSection,
  DeclarationSection,
  draftFilled,
  draftLines,
  emptyHours,
  hoursOfLines,
  invalidHours,
  parseHours,
  PaymentSection,
  postTimesheet,
  type AttachedSheet,
  type DraftValue,
  type FormDay,
  type PaymentDraft,
  type Totals,
} from "@/modules/income/ui/overtime-entry-parts";
import { STATUS_TONES } from "@/modules/income/ui/overtime-status";
import { FlowHeading, FlowSteps } from "@/modules/portfolio/ui/flow-steps";
import { backdropClass, primaryButtonClass, secondaryButtonClass } from "@/modules/portfolio/ui/edit-dialogs";

// O formulário único das Horas extras (spec 098): um mês em três partes, como a
// inclusão de posição em Investimentos. Ao declarar um mês novo são etapas,
// uma depois da outra: a declaração (obrigatória), o anexo da folha .xlsx e o
// pagamento (opcionais). Ao abrir um mês da tabela, as mesmas três partes viram
// abas, todas editáveis, e o Salvar grava tudo de uma vez.

export type EntryTarget = { mode: "create" } | { mode: "edit"; id: string };

const STEPS = [
  { key: "declaracao", label: "Declaração" },
  { key: "anexo", label: "Anexo" },
  { key: "pagamento", label: "Pagamento" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

const HEADINGS: Record<StepKey, { title: string; description: string }> = {
  declaracao: { title: "Declare as horas do mês", description: "O mês, o período da folha e as horas a mais de cada faixa." },
  anexo: { title: "Anexe a folha, se quiser", description: "A folha .xlsx que você envia à empresa preenche o período e as horas." },
  pagamento: { title: "Registre o pagamento, se já recebeu", description: "Quantas horas deste mês o holerite pagou em cada adicional." },
};

const popupClass =
  "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-1.5rem)] w-[min(640px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0";

type Shared = {
  months: OvertimeMonthView[];
  rules: OvertimeRule[];
  salaries: Record<Competence, PayslipSalary>;
  currentCompetence: Competence;
};

export function OvertimeEntryDialog({
  open,
  onOpenChange,
  target,
  month,
  formKey,
  onSaved,
  ...shared
}: Shared & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: EntryTarget | null;
  month: OvertimeMonthView | null;
  formKey: number;
  onSaved: (result: IncomeActionResult) => void;
}) {
  const onDone = (result: IncomeActionResult) => {
    onSaved(result);
    if (result.ok) onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup className={popupClass} data-testid="overtime-entry-form">
          {target?.mode === "create" ? (
            <EntryForm key={formKey} month={null} onDone={onDone} {...shared} />
          ) : month ? (
            <EntryForm key={formKey} month={month} onDone={onDone} {...shared} />
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const textOf = (totals: Pick<OvertimeTotals, (typeof OVERTIME_CATEGORIES)[number]>): Totals =>
  Object.fromEntries(OVERTIME_CATEGORIES.map((category) => [category, totals[category] > 0 ? formatHoursInput(totals[category]) : ""])) as Totals;

const hoursOf = (totals: Totals) => Object.fromEntries(OVERTIME_CATEGORIES.map((category) => [category, parseHours(totals[category])])) as Record<(typeof OVERTIME_CATEGORIES)[number], number>;

const declaredOf = (totals: Totals) => OVERTIME_CATEGORIES.reduce((sum, category) => sum + parseHours(totals[category]), 0);

/** Período sugerido: do dia seguinte ao fim do mês declarado antes até o dia 20. */
function suggestedPeriod(month: string, months: OvertimeMonthView[]) {
  if (!isCompetence(month)) return { startsOn: "", endsOn: "" };
  const previous = months.find((entry) => entry.month === addCompetenceMonths(month, -1));
  return { startsOn: previous ? addDays(previous.endsOn, 1) : `${addCompetenceMonths(month, -1)}-21`, endsOn: `${month}-20` };
}

const newDraft = (paymentMonth: string): PaymentDraft => ({ key: crypto.randomUUID(), id: null, paymentMonth, hours: emptyHours(), note: "" });

const draftOf = (payment: PaymentView): PaymentDraft => ({ key: payment.id, id: payment.id, paymentMonth: payment.paymentMonth, hours: hoursOfLines(payment.lines), note: payment.note ?? "" });

/** O holerite do próximo pagamento: o esperado, ou o seguinte ao último já no formulário. */
function nextPayslip(competence: string, drafts: readonly PaymentDraft[]) {
  const used = new Set(drafts.map((draft) => draft.paymentMonth));
  const last = drafts.map((draft) => draft.paymentMonth).filter(isCompetence).sort().at(-1);
  if (!isCompetence(competence) && !last) return "";
  let month = last ? addCompetenceMonths(last, 1) : addCompetenceMonths(competence, 1);
  while (used.has(month)) month = addCompetenceMonths(month, 1);
  return month;
}

function EntryForm({ month, months, rules, salaries, currentCompetence, onDone }: Shared & { month: OvertimeMonthView | null; onDone: (result: IncomeActionResult) => void }) {
  const router = useRouter();
  const editing = month !== null;
  const taken = new Set(months.filter((entry) => entry.id !== month?.id).map((entry) => entry.month));
  const firstFree = [currentCompetence, addCompetenceMonths(currentCompetence, -1)].find((option) => !taken.has(option)) ?? "";
  const initialPeriod = month ? { startsOn: month.startsOn, endsOn: month.endsOn } : suggestedPeriod(firstFree, months);

  const [step, setStep] = useState<StepKey>("declaracao");
  const [competence, setCompetence] = useState(month?.month ?? firstFree);
  const [period, setPeriod] = useState(initialPeriod);
  const [typed, setTyped] = useState<Totals>(() => textOf(month?.totals ?? { weekday: 0, weekdayBeyond: 0, saturday: 0, sunday: 0, holiday: 0 }));
  const [compensated, setCompensated] = useState(month && month.compensated > 0 ? formatHoursInput(month.compensated) : "");
  const [note, setNote] = useState(month?.note ?? "");
  const [attached, setAttached] = useState<AttachedSheet | null>(null);
  // O que a declaração tinha antes de anexar a folha, para voltar ao remover.
  const [beforeAttach, setBeforeAttach] = useState<{ typed: Totals; period: typeof initialPeriod } | null>(null);
  const [dayTypes, setDayTypes] = useState<Record<string, DayType>>({});
  const [drafts, setDrafts] = useState<PaymentDraft[]>(() =>
    month && month.payments.length > 0 ? month.payments.map(draftOf) : [newDraft(nextPayslip(month?.month ?? firstFree, []))],
  );
  const [draftMonthTouched, setDraftMonthTouched] = useState(editing);
  const [requestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();

  const rule = ruleFor(isCompetence(competence) ? competence : currentCompetence, rules);
  const match = attached?.months.find((entry) => entry.month === competence) ?? null;
  const importing = match !== null && (match.state === "new" || match.state === "replace");

  // Os dias da folha gravada, com os tipos trocados neste formulário.
  const days: FormDay[] = (month?.days ?? []).map((day) => {
    const dayType = dayTypes[day.id] ?? day.dayType;
    return { ...day, dayType, ...dayOvertime({ ...day, dayType }, rule.dailyHours) };
  });
  const sheetTotals = match ? match.totals : days.length > 0 ? totalsFromDays(days, rule.dailyHours) : null;
  const typedHours = hoursOf(typed);
  const differsFromSheet = sheetTotals !== null && OVERTIME_CATEGORIES.some((category) => sheetTotals[category] !== typedHours[category]);
  const declared = declaredOf(typed);
  const payable = Object.values(
    payableByCategory({ ...typedHours, shortfall: sheetTotals?.shortfall ?? month?.totals.shortfall ?? 0 }, parseHours(compensated), rule),
  ).reduce((sum, hours) => sum + hours, 0);

  // Os valores saem do salário do holerite, com os pagamentos como estão nos campos.
  const filled = drafts.filter(draftFilled);
  const formPayments = filled.filter((draft) => isCompetence(draft.paymentMonth)).map((draft) => ({ paymentMonth: draft.paymentMonth, lines: draftLines(draft) }));
  const rateFor = hourlyRates({ salaries, rules, payments: [...months.filter((entry) => entry.id !== month?.id).flatMap((entry) => entry.payments), ...formPayments] });
  const values: Record<string, DraftValue> = Object.fromEntries(
    drafts.map((draft) => {
      if (!isCompetence(draft.paymentMonth)) return [draft.key, { timing: null, rate: null, value: null }];
      const rate = rateFor(draft.paymentMonth);
      return [
        draft.key,
        {
          timing: isCompetence(competence) ? paymentTiming(competence, draft.paymentMonth) : null,
          rate,
          value: paymentValue(draftLines(draft), draft.paymentMonth, rate),
        },
      ];
    }),
  );

  const declarationProblem = !isCompetence(competence)
    ? "Escolha o mês."
    : taken.has(competence)
      ? `${formatCompetenceLong(competence)} já foi declarado: abra o mês na tabela.`
      : !period.startsOn || !period.endsOn
        ? "Informe o período da folha."
        : Object.values(typed).some(invalidHours)
          ? "Revise as horas destacadas."
          : invalidHours(compensated)
            ? "Revise as horas compensadas."
            : parseHours(compensated) > declared
              ? "As horas compensadas passam das declaradas."
              : null;
  const attachmentProblem = !attached
    ? null
    : !match
      ? "A folha anexada não tem este mês: remova-a ou anexe a folha certa."
      : match.state === "conflict"
        ? `O arquivo tem duas folhas diferentes de ${formatCompetence(competence)}.`
        : editing && importing && competence !== month.month
          ? "Troque o mês ou anexe a folha: um de cada vez."
          : null;
  const payslips = filled.map((draft) => draft.paymentMonth);
  const repeated = payslips.find((payslip, index) => payslips.indexOf(payslip) !== index);
  const paymentProblem = filled.some((draft) => !isCompetence(draft.paymentMonth))
    ? "Escolha o holerite que pagou."
    : filled.some((draft) => OVERTIME_PAY_KINDS.some((kind) => invalidHours(draft.hours[kind])))
      ? "Revise as horas pagas."
      : repeated
        ? `Dois pagamentos do holerite de ${formatCompetence(repeated)}: junte as horas num só.`
        : null;

  const changeCompetence = (next: string) => {
    setCompetence(next);
    if (isCompetence(next) && !period.endsOn.startsWith(next) && !importing) setPeriod(suggestedPeriod(next, months.filter((entry) => entry.id !== month?.id)));
    if (!draftMonthTouched && isCompetence(next)) setDrafts((current) => current.map((draft, index) => (index === 0 && draft.id === null ? { ...draft, paymentMonth: addCompetenceMonths(next, 1) } : draft)));
  };

  const attach = (sheet: AttachedSheet) => {
    const found = sheet.months.find((entry) => entry.month === competence);
    if (!beforeAttach) setBeforeAttach({ typed, period });
    setAttached(sheet);
    if (found) {
      setTyped(textOf(found.totals));
      setPeriod({ startsOn: found.startsOn, endsOn: found.endsOn });
    }
  };

  const clearAttachment = () => {
    setAttached(null);
    if (beforeAttach) {
      setTyped(beforeAttach.typed);
      setPeriod(beforeAttach.period);
      setBeforeAttach(null);
    }
  };

  // Trocar o tipo de um dia refaz as horas pela folha.
  const changeDayType = (day: FormDay, dayType: DayType) => {
    const next = { ...dayTypes, [day.id]: dayType };
    setDayTypes(next);
    setTyped(textOf(totalsFromDays(days.map((entry) => ({ ...entry, dayType: next[entry.id] ?? entry.dayType })), rule.dailyHours)));
  };

  const go = (target: StepKey) => {
    setError(null);
    setStep(target);
  };

  const next = () => {
    setTouched(true);
    const problem = step === "declaracao" ? declarationProblem : attachmentProblem;
    if (problem) {
      setError(problem);
      return;
    }
    go(STEPS[STEPS.findIndex((entry) => entry.key === step) + 1].key);
  };

  const save = () => {
    setTouched(true);
    const problem = declarationProblem ?? attachmentProblem ?? paymentProblem;

    if (problem) {
      setError(problem);
      setStep(declarationProblem ? "declaracao" : attachmentProblem ? "anexo" : "pagamento");
      return;
    }

    setError(null);
    startSaving(async () => {
      if (importing && attached) {
        const applied = await postTimesheet({ mode: "apply", files: [attached.file], months: [competence] });
        if (applied.state !== "imported" || !applied.months.includes(competence)) {
          setError(applied.state === "invalid" ? applied.message : "Não foi possível gravar a folha.");
          return;
        }
      }

      const result = await saveOvertimeEntryAction({
        id: month?.id,
        requestId,
        attached: importing,
        month: competence,
        ...period,
        ...typed,
        compensated,
        note: note.trim() === "" ? null : note,
        dayTypes: importing ? [] : Object.entries(dayTypes).map(([dayId, dayType]) => ({ dayId, dayType })),
        payments: filled.map((draft) => ({
          id: draft.id ?? undefined,
          paymentMonth: draft.paymentMonth,
          lines: OVERTIME_PAY_KINDS.map((kind) => ({ kind, hours: draft.hours[kind] })),
          note: draft.note.trim() === "" ? null : draft.note,
        })),
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      router.refresh();
      onDone(
        editing
          ? result
          : { ...result, message: `${formatCompetenceLong(competence)}: ${formatHours(declared)} declaradas${filled.length > 0 ? " e o pagamento registrado" : ""}.` },
      );
    });
  };

  const removeMonth = () =>
    startDeleting(async () => {
      const result = await deleteOvertimeMonthAction({ id: month!.id });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onDone(result);
    });

  const sections: Record<StepKey, React.ReactNode> = {
    declaracao: (
      <DeclarationSection
        competence={competence}
        onCompetence={changeCompetence}
        period={period}
        onPeriod={(patch) => setPeriod((current) => ({ ...current, ...patch }))}
        totals={typed}
        onTotals={(category, value) => setTyped((current) => ({ ...current, [category]: value }))}
        sheetHours={differsFromSheet ? OVERTIME_CATEGORIES.reduce((sum, category) => sum + sheetTotals![category], 0) : null}
        onUseSheet={() => sheetTotals && setTyped(textOf(sheetTotals))}
        compensated={compensated}
        onCompensated={setCompensated}
        note={note}
        onNote={setNote}
        showCompensated={editing}
        touched={touched}
      />
    ),
    anexo: <AttachmentSection competence={competence} attached={attached} onAttach={attach} onClear={clearAttachment} month={month} days={days} onDayType={changeDayType} />,
    pagamento: (
      <PaymentSection
        payable={payable}
        overdue={editing && isOverdue(month.status)}
        drafts={drafts}
        values={values}
        onChange={(key, patch) => {
          if (patch.paymentMonth !== undefined) setDraftMonthTouched(true);
          setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
        }}
        onAdd={() => setDrafts((current) => [...current, newDraft(nextPayslip(competence, current))])}
        onRemove={(key) => setDrafts((current) => current.filter((draft) => draft.key !== key))}
        touched={touched}
      />
    ),
  };

  const stepIndex = STEPS.findIndex((entry) => entry.key === step);

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (editing || step === "pagamento") save();
        else next();
      }}
    >
      <header className="flex items-start gap-4 border-b border-border/70 px-5 pt-5 pb-4 sm:px-6">
        <div className="min-w-0">
          <Dialog.Title className="flex flex-wrap items-center gap-2 text-base font-semibold tracking-[-0.02em]">
            {editing ? formatCompetenceLong(month.month) : "Declarar horas"}
            {editing ? <Badge tone={STATUS_TONES[month.status]}>{STATUS_LABELS[month.status]}</Badge> : null}
          </Dialog.Title>
          <p className="mt-1 text-[11px] text-muted-foreground" data-testid="overtime-entry-subtitle">
            {editing
              ? `Folha de ${formatPeriod(month.startsOn, month.endsOn)} · holerite esperado ${formatCompetence(month.dueMonth)} · ${formatHours(month.paid)} pagas de ${formatHours(month.payable)}`
              : "Declare o mês; o anexo e o pagamento são opcionais."}
          </p>
        </div>
        <Dialog.Close
          aria-label="Fechar"
          className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <XIcon aria-hidden="true" size={14} weight="bold" />
        </Dialog.Close>
      </header>

      {editing ? (
        <Tabs.Root value={step} onValueChange={(value) => go(value as StepKey)} className="flex min-h-0 flex-1 flex-col">
          <Tabs.List aria-label="Partes do mês" className="relative mx-5 mt-4 grid shrink-0 grid-cols-3 rounded-xl border border-border bg-background/40 p-1 sm:mx-6">
            <Tabs.Indicator className="absolute top-1 bottom-1 left-[var(--active-tab-left)] w-[var(--active-tab-width)] rounded-lg bg-white/[0.07] transition-[left,width] duration-200 ease-out" />
            {STEPS.map((entry) => (
              <Tabs.Tab
                key={entry.key}
                value={entry.key}
                className="relative z-10 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-active:text-foreground"
              >
                {entry.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <div className="min-h-[min(19rem,40dvh)] flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
            {STEPS.map((entry) => (
              <Tabs.Panel key={entry.key} value={entry.key} className="outline-none">
                {sections[entry.key]}
              </Tabs.Panel>
            ))}
          </div>
        </Tabs.Root>
      ) : (
        <>
          <FlowSteps steps={STEPS.map((entry) => (entry.key === "declaracao" ? entry.label : `${entry.label} (opcional)`))} current={stepIndex} />
          <div className="min-h-[min(19rem,40dvh)] flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
            <FlowHeading title={HEADINGS[step].title} description={HEADINGS[step].description} />
            {sections[step]}
          </div>
        </>
      )}

      <footer className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/70 px-5 py-4 sm:px-6">
        <div className="min-w-0 flex-1 basis-56" aria-live="polite">
          {error ? (
            <p role="alert" className="flex items-start gap-1.5 text-[11px] leading-snug text-destructive">
              <XCircleIcon aria-hidden="true" className="mt-px shrink-0" size={13} weight="fill" />
              {error}
            </p>
          ) : editing ? (
            <button
              type="button"
              onClick={removeMonth}
              disabled={saving || deleting}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-40"
            >
              <TrashIcon aria-hidden="true" size={14} />
              Excluir mês
            </button>
          ) : null}
        </div>
        <div className="ml-auto flex gap-2">
          {editing || stepIndex === 0 ? (
            <Dialog.Close className={secondaryButtonClass} disabled={saving}>
              Cancelar
            </Dialog.Close>
          ) : (
            <button type="button" onClick={() => go(STEPS[stepIndex - 1].key)} disabled={saving} className={secondaryButtonClass}>
              Voltar
            </button>
          )}
          {!editing && step !== "pagamento" ? (
            <button type="submit" className={primaryButtonClass}>
              Continuar
            </button>
          ) : (
            <button type="submit" disabled={saving || deleting} className={primaryButtonClass}>
              {saving ? <CircleNotchIcon aria-hidden="true" className="animate-spin" size={14} weight="bold" /> : null}
              {saving ? "Salvando…" : editing ? "Salvar" : "Declarar"}
            </button>
          )}
        </div>
      </footer>
    </form>
  );
}
