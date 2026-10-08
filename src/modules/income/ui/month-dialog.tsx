"use client";

import { Dialog } from "@base-ui/react/dialog";
import { PlusIcon, TrashIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { useId, useState, useTransition, type ReactNode } from "react";

import { deleteIncomeMonthAction, saveIncomeMonthAction, type IncomeActionResult } from "@/app/actions/income";
import { DatePicker, MonthPicker } from "@/components/ui/date-picker";
import { Picker } from "@/components/ui/picker";
import { formatCompetenceLong, isCompetence } from "@/lib/competence";
import { formatAmountInput, formatCents, MAX_AMOUNT_CENTS, parseAmountInput, type Cents } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  countsAsTaxable,
  coversWholeMonth,
  daysWorked,
  monthBounds,
  PAYSLIP_KIND_LABELS,
  PAYSLIP_KINDS,
  PAYSLIP_PROBLEMS,
  payslipIncomeCents,
  payslipProblem,
  type IncomeMonth,
  type PayslipKind,
} from "@/modules/income/domain/income";
import { backdropClass, Field, inputClass, primaryButtonClass, secondaryButtonClass } from "@/modules/portfolio/ui/edit-dialogs";

// Formulário do mês de Recebimentos (spec 088): entradas e saídas, como a
// tabela do Excel, e os holerites que alimentam a Previdência (spec 089).

export type MonthDialogTarget = { mode: "create"; month: string } | { mode: "edit"; month: IncomeMonth };

type PayslipDraft = {
  key: string;
  kind: PayslipKind;
  label: string;
  employer: string;
  startsOn: string;
  endsOn: string;
  gross: string;
  prorated: boolean;
};

const VALUE_FIELDS = [
  { key: "netIncome", label: "Salário líquido + extras", group: "Entradas" },
  { key: "mealVoucher", label: "VA/VR", group: "Entradas" },
  { key: "cardSpend", label: "Cartão", group: "Saídas" },
  { key: "pixSpend", label: "PIX", group: "Saídas" },
  { key: "mealVoucherSpend", label: "VA/VR", group: "Saídas" },
] as const;

type ValueKey = (typeof VALUE_FIELDS)[number]["key"];

const popupClass =
  "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-1.5rem)] w-[min(620px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0";

export function MonthDialog({
  open,
  onOpenChange,
  target,
  formKey,
  employers,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: MonthDialogTarget | null;
  formKey: number;
  employers: string[];
  onSaved: (result: IncomeActionResult) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup className={popupClass} data-testid="income-month-form">
          {target ? (
            <MonthForm
              key={formKey}
              target={target}
              employers={employers}
              onDone={(result) => {
                onSaved(result);
                if (result.ok) {
                  onOpenChange(false);
                }
              }}
            />
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function amountText(cents: Cents | null) {
  return cents === null ? "" : formatAmountInput(cents);
}

function wholeMonthDraft(month: string, employer: string, key: string): PayslipDraft {
  const bounds = isCompetence(month) ? monthBounds(month) : { first: "", last: "" };
  return { key, kind: "SALARY", label: "", employer, startsOn: bounds.first, endsOn: bounds.last, gross: "", prorated: false };
}

function MonthForm({
  target,
  employers,
  onDone,
}: {
  target: MonthDialogTarget;
  employers: string[];
  onDone: (result: IncomeActionResult) => void;
}) {
  const editing = target.mode === "edit" ? target.month : null;
  const [month, setMonth] = useState(editing ? editing.month : target.mode === "create" ? target.month : "");
  const [values, setValues] = useState<Record<ValueKey, string>>({
    netIncome: amountText(editing?.netIncomeCents ?? null),
    mealVoucher: amountText(editing?.mealVoucherCents ?? null),
    cardSpend: amountText(editing?.cardSpendCents ?? null),
    pixSpend: amountText(editing?.pixSpendCents ?? null),
    mealVoucherSpend: amountText(editing?.mealVoucherSpendCents ?? null),
  });
  const [payslips, setPayslips] = useState<PayslipDraft[]>(
    () =>
      editing?.payslips.map((payslip) => ({
        key: payslip.id,
        kind: payslip.kind,
        label: payslip.label ?? "",
        employer: payslip.employer,
        startsOn: payslip.startsOn,
        endsOn: payslip.endsOn,
        gross: formatAmountInput(payslip.grossCents),
        prorated: payslip.prorated,
      })) ?? [],
  );
  const [requestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const formId = useId();

  const parsedValues = Object.fromEntries(
    VALUE_FIELDS.map(({ key }) => {
      const text = values[key].trim();
      return [key, text === "" ? null : parseAmountInput(text)];
    }),
  ) as Record<ValueKey, Cents | null>;
  const invalidValue = (key: ValueKey) =>
    values[key].trim() !== "" && (parsedValues[key] === null || parsedValues[key]! > MAX_AMOUNT_CENTS);

  const checked = payslips.map((draft) => {
    const grossCents = parseAmountInput(draft.gross);
    const payslip = {
      kind: draft.kind,
      label: draft.label,
      employer: draft.employer,
      startsOn: draft.startsOn,
      endsOn: draft.endsOn,
      grossCents: grossCents ?? 0,
      prorated: draft.prorated,
    };
    const problem = isCompetence(month) ? payslipProblem(month, payslip) : "dates";
    return { draft, payslip, problem: grossCents !== null && grossCents > MAX_AMOUNT_CENTS ? "gross" : problem };
  });

  const valuesValid = VALUE_FIELDS.every(({ key }) => !invalidValue(key));
  const valid = isCompetence(month) && valuesValid && checked.every((item) => item.problem === null);

  const value = (key: ValueKey) => parsedValues[key] ?? 0;
  const incomeCents = value("netIncome") + value("mealVoucher");
  const spendCents = value("cardSpend") + value("pixSpend") + value("mealVoucherSpend");
  const grossCents = checked.reduce((sum, item) => sum + (item.problem ? 0 : payslipIncomeCents(item.payslip)), 0);

  const changeMonth = (next: string) => {
    // Os holerites do mês inteiro acompanham a troca de mês.
    if (isCompetence(month) && isCompetence(next)) {
      setPayslips((current) =>
        current.map((draft) =>
          coversWholeMonth(month, draft.startsOn, draft.endsOn)
            ? { ...draft, startsOn: monthBounds(next).first, endsOn: monthBounds(next).last }
            : draft,
        ),
      );
    }

    setMonth(next);
  };

  const updatePayslip = (key: string, patch: Partial<PayslipDraft>) =>
    setPayslips((current) =>
      current.map((draft) => {
        if (draft.key !== key) return draft;
        const next = { ...draft, ...patch };

        // Período parcial pede o cálculo proporcional; o mês inteiro, não.
        if ((patch.startsOn !== undefined || patch.endsOn !== undefined) && isCompetence(month) && next.startsOn && next.endsOn) {
          next.prorated = !coversWholeMonth(month, next.startsOn, next.endsOn);
        }

        return next;
      }),
    );

  const addPayslip = () =>
    setPayslips((current) => [
      ...current,
      wholeMonthDraft(month, current.at(-1)?.employer ?? employers[0] ?? "", crypto.randomUUID()),
    ]);

  const submit = () => {
    setTouched(true);

    if (!valid) {
      const firstProblem = checked.find((item) => item.problem)?.problem;
      setError(
        !isCompetence(month)
          ? "Escolha o mês."
          : !valuesValid
            ? "Revise os valores destacados."
            : firstProblem
              ? PAYSLIP_PROBLEMS[firstProblem]
              : "Revise os campos do mês.",
      );
      return;
    }

    setError(null);
    const payload = {
      month,
      ...values,
      payslips: payslips.map((draft) => ({
        kind: draft.kind,
        label: draft.kind === "OTHER" ? draft.label.trim() : null,
        employer: draft.employer.trim(),
        startsOn: draft.startsOn,
        endsOn: draft.endsOn,
        gross: draft.gross,
        prorated: draft.prorated,
      })),
    };

    startSaving(async () => {
      const result = editing
        ? await saveIncomeMonthAction({ ...payload, id: editing.id })
        : await saveIncomeMonthAction({ ...payload, requestId });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      onDone(result);
    });
  };

  const remove = () =>
    startDeleting(async () => {
      const result = await deleteIncomeMonthAction({ id: editing!.id });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      onDone(result);
    });

  const employerOptions = (current: string) =>
    [...new Set([current, ...employers].filter((employer) => employer.trim() !== ""))].map((employer) => ({ value: employer, label: employer }));
  const bounds = isCompetence(month) ? monthBounds(month) : null;

  return (
    <form
      id={formId}
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <header className="flex items-start gap-4 border-b border-border/70 px-5 pt-5 pb-4 sm:px-6">
        <div className="min-w-0">
          <Dialog.Title className="truncate text-base font-semibold tracking-[-0.02em]">
            {editing ? formatCompetenceLong(editing.month) : "Novo mês"}
          </Dialog.Title>
        </div>
        <Dialog.Close
          aria-label="Fechar"
          className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <XIcon aria-hidden="true" size={14} weight="bold" />
        </Dialog.Close>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 sm:px-6">
        <div className="max-w-[220px]">
          <Field label="Mês">
            <MonthPicker aria-label="Mês" value={month} onChange={changeMonth} invalid={touched && !isCompetence(month)} />
          </Field>
        </div>

        {(["Entradas", "Saídas"] as const).map((group) => (
          <fieldset key={group} className="min-w-0">
            <legend className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{group}</legend>
            <div className={cn("grid gap-3", group === "Entradas" ? "grid-cols-1 min-[420px]:grid-cols-2" : "grid-cols-1 min-[420px]:grid-cols-3")}>
              {VALUE_FIELDS.filter((field) => field.group === group).map((field) => (
                <Field key={field.key} label={field.label}>
                  <MoneyInput
                    label={`${group}: ${field.label}`}
                    value={values[field.key]}
                    invalid={touched && invalidValue(field.key)}
                    onChange={(text) => setValues((current) => ({ ...current, [field.key]: text }))}
                  />
                </Field>
              ))}
            </div>
          </fieldset>
        ))}

        <fieldset className="min-w-0" data-testid="income-payslips">
          <legend className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Holerites</legend>
          <div className="space-y-3">
            {checked.map(({ draft, payslip, problem }, index) => {
              const days = bounds && draft.startsOn && draft.endsOn && !problem ? daysWorked(draft.startsOn, draft.endsOn) : null;
              const income = problem ? null : payslipIncomeCents(payslip);

              return (
                <div key={draft.key} data-testid="income-payslip" className="rounded-xl border border-border bg-background/30 p-3">
                  <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                    <Field label="Nome">
                      <Picker
                        aria-label={`Holerite ${index + 1}: tipo`}
                        options={PAYSLIP_KINDS.map((kind) => ({ value: kind, label: PAYSLIP_KIND_LABELS[kind] }))}
                        value={draft.kind}
                        onValueChange={(kind) => updatePayslip(draft.key, { kind: kind as PayslipKind })}
                        searchable={false}
                      />
                    </Field>
                    <Field label="Empresa">
                      <EmployerPicker
                        index={index}
                        value={draft.employer}
                        options={employerOptions(draft.employer)}
                        invalid={touched && problem === "employer"}
                        onChange={(employer) => updatePayslip(draft.key, { employer })}
                      />
                    </Field>
                    {draft.kind === "OTHER" ? (
                      <div className="min-[420px]:col-span-2">
                        <Field label="Nome livre">
                          <input
                            aria-label={`Holerite ${index + 1}: nome`}
                            value={draft.label}
                            maxLength={60}
                            autoComplete="off"
                            onChange={(event) => updatePayslip(draft.key, { label: event.target.value })}
                            placeholder="Ex.: Bônus, Rescisão"
                            aria-invalid={(touched && problem === "label") || undefined}
                            className={cn(inputClass, touched && problem === "label" && "border-destructive")}
                          />
                        </Field>
                      </div>
                    ) : null}
                    <Field label="Início">
                      <DatePicker
                        aria-label={`Holerite ${index + 1}: início`}
                        value={draft.startsOn}
                        min={bounds?.first}
                        max={bounds?.last}
                        invalid={touched && (problem === "dates" || problem === "order" || problem === "outside")}
                        onChange={(startsOn) => updatePayslip(draft.key, { startsOn })}
                      />
                    </Field>
                    <Field label="Fim">
                      <DatePicker
                        aria-label={`Holerite ${index + 1}: fim`}
                        value={draft.endsOn}
                        min={bounds?.first}
                        max={bounds?.last}
                        invalid={touched && (problem === "dates" || problem === "order" || problem === "outside")}
                        onChange={(endsOn) => updatePayslip(draft.key, { endsOn })}
                      />
                    </Field>
                    <Field label="Salário bruto">
                      <MoneyInput
                        label={`Holerite ${index + 1}: salário bruto`}
                        value={draft.gross}
                        invalid={touched && problem === "gross"}
                        onChange={(gross) => updatePayslip(draft.key, { gross })}
                      />
                    </Field>
                    <label className="flex min-h-9 items-center gap-2 self-end text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={draft.prorated}
                        onChange={(event) => updatePayslip(draft.key, { prorated: event.target.checked })}
                        className="size-4 accent-[var(--primary)]"
                      />
                      Proporcional aos dias
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-[11px]">
                    <span className="text-muted-foreground">
                      {days !== null ? `${days} ${days === 1 ? "dia" : "dias"}` : "—"}
                      {income !== null ? (
                        <>
                          {" · "}
                          <span className={cn("font-mono", countsAsTaxable(draft.kind) ? "text-foreground" : "text-muted-foreground line-through")}>
                            {formatCents(income)}
                          </span>
                          {countsAsTaxable(draft.kind) ? null : " fora do cálculo"}
                        </>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPayslips((current) => current.filter((item) => item.key !== draft.key))}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <TrashIcon aria-hidden="true" size={13} />
                      Remover
                    </button>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={addPayslip}
              disabled={!isCompetence(month)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-border px-3 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-40"
            >
              <PlusIcon aria-hidden="true" size={13} weight="bold" />
              Adicionar holerite
            </button>
          </div>
        </fieldset>

        <dl data-testid="income-month-preview" className="space-y-1.5 rounded-xl border border-border bg-background/30 px-3 py-2.5 text-xs">
          <PreviewRow label="Entradas">{formatCents(incomeCents)}</PreviewRow>
          <PreviewRow label="Saídas">{formatCents(spendCents)}</PreviewRow>
          <PreviewRow label="Balanço">
            <span className={incomeCents === spendCents ? "text-foreground" : incomeCents > spendCents ? "text-primary" : "text-warning-foreground"}>
              {formatCents(incomeCents - spendCents, { signed: true })}
            </span>
          </PreviewRow>
          {payslips.length > 0 ? <PreviewRow label="Salário bruto">{formatCents(grossCents)}</PreviewRow> : null}
        </dl>

        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <footer className="flex items-center gap-2 border-t border-border/70 px-5 py-4 sm:px-6">
        {editing ? (
          <button
            type="button"
            onClick={remove}
            disabled={saving || deleting}
            className="mr-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-40"
          >
            <TrashIcon aria-hidden="true" size={14} />
            Excluir mês
          </button>
        ) : null}
        <Dialog.Close className={cn(secondaryButtonClass, !editing && "ml-auto")}>Cancelar</Dialog.Close>
        <button type="submit" disabled={saving || deleting} className={primaryButtonClass}>
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </footer>
    </form>
  );
}

function MoneyInput({
  label,
  value,
  invalid,
  onChange,
}: {
  label: string;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <span className="relative block">
      <span className="pointer-events-none absolute inset-y-0 left-2.5 grid place-items-center text-[11px] text-muted-foreground">R$</span>
      <input
        aria-label={label}
        value={value}
        inputMode="decimal"
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          const cents = parseAmountInput(value);
          if (cents !== null && cents <= MAX_AMOUNT_CENTS) onChange(formatAmountInput(cents));
        }}
        placeholder="0,00"
        aria-invalid={invalid || undefined}
        className={cn(inputClass, "pl-8 font-mono tabular-nums", invalid && "border-destructive")}
      />
    </span>
  );
}

function EmployerPicker({
  index,
  value,
  options,
  invalid,
  onChange,
}: {
  index: number;
  value: string;
  options: { value: string; label: string }[];
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Picker
      aria-label={`Holerite ${index + 1}: empresa`}
      options={options}
      value={value.trim() === "" ? null : value}
      placeholder="Escolha ou digite"
      invalid={invalid}
      onValueChange={onChange}
      onCreate={(text) => onChange(text.trim().replace(/\s+/g, " ").slice(0, 80))}
      createLabel={(text) => `Usar “${text}”`}
      emptyMessage="Digite o nome da empresa"
    />
  );
}

function PreviewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-mono text-foreground">{children}</dd>
    </div>
  );
}
