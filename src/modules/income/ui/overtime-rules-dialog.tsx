"use client";

import { Dialog } from "@base-ui/react/dialog";
import { PlusIcon, TrashIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { useState, useTransition } from "react";

import type { IncomeActionResult } from "@/app/actions/income";
import { saveOvertimeRulesAction } from "@/app/actions/overtime";
import { MonthPicker } from "@/components/ui/date-picker";
import { addCompetenceMonths, isCompetence } from "@/lib/competence";
import { cn } from "@/lib/utils";
import { CLT_FLOOR_RULE, formatHoursInput, MAX_PERCENT, parseHoursInput, type OvertimeRule } from "@/modules/income/domain/overtime";
import { backdropClass, Field, inputClass, primaryButtonClass, secondaryButtonClass } from "@/modules/portfolio/ui/edit-dialogs";

// Regras das horas extras (spec 098). Cada versão vale a partir de um mês de
// trabalho: jornada, adicionais por situação e os limites diários que a
// empresa informou. Sem regra, vale o piso da CLT. Os limites só geram avisos;
// nenhuma hora trabalhada é descartada por passar deles.

const popupClass =
  "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-1.5rem)] w-[min(680px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0";

type Draft = {
  key: string;
  effectiveFrom: string;
  dailyHours: string;
  weekdayPercent: string;
  weekdayBeyondPercent: string;
  saturdayPercent: string;
  sundayPercent: string;
  holidayPercent: string;
  usualDailyLimit: string;
  exceptionalDailyLimit: string;
  netShortfall: boolean;
  note: string;
};

const PERCENTS = [
  { key: "weekdayPercent", label: "Útil ≤ 2 h", name: "dia útil, até 2 h" },
  { key: "weekdayBeyondPercent", label: "Útil > 2 h", name: "dia útil, além de 2 h" },
  { key: "saturdayPercent", label: "Sábado", name: "sábado" },
  { key: "sundayPercent", label: "Domingo", name: "domingo" },
  { key: "holidayPercent", label: "Feriado", name: "feriado" },
] as const;

function draftOf(rule: OvertimeRule, effectiveFrom: string): Draft {
  return {
    key: rule.id ?? crypto.randomUUID(),
    effectiveFrom: rule.effectiveFrom ?? effectiveFrom,
    dailyHours: formatHoursInput(rule.dailyHours),
    weekdayPercent: String(rule.weekdayPercent),
    weekdayBeyondPercent: String(rule.weekdayBeyondPercent),
    saturdayPercent: String(rule.saturdayPercent),
    sundayPercent: String(rule.sundayPercent),
    holidayPercent: String(rule.holidayPercent),
    usualDailyLimit: rule.usualDailyLimit === null ? "" : formatHoursInput(rule.usualDailyLimit),
    exceptionalDailyLimit: rule.exceptionalDailyLimit === null ? "" : formatHoursInput(rule.exceptionalDailyLimit),
    netShortfall: rule.netShortfall,
    note: rule.note ?? "",
  };
}

const percentInvalid = (text: string) => !/^\d{1,3}$/.test(text.trim()) || Number(text) > MAX_PERCENT;
const hoursInvalid = (text: string, required: boolean) => {
  const hours = parseHoursInput(text);
  return hours === null ? required : Number.isNaN(hours) || hours > 1600;
};

export function OvertimeRulesDialog({
  open,
  onOpenChange,
  rules,
  firstMonth,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: OvertimeRule[];
  firstMonth: string;
  onSaved: (result: IncomeActionResult) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup className={popupClass} data-testid="overtime-rules-dialog">
          {open ? (
            <RulesForm
              rules={rules}
              firstMonth={firstMonth}
              onDone={(result) => {
                onSaved(result);
                if (result.ok) onOpenChange(false);
              }}
            />
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RulesForm({ rules, firstMonth, onDone }: { rules: OvertimeRule[]; firstMonth: string; onDone: (result: IncomeActionResult) => void }) {
  const [drafts, setDrafts] = useState<Draft[]>(() => (rules.length > 0 ? rules.map((rule) => draftOf(rule, firstMonth)) : [draftOf(CLT_FLOOR_RULE, firstMonth)]));
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, startSaving] = useTransition();

  const update = (key: string, patch: Partial<Draft>) => setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
  const invalid = (draft: Draft) =>
    !isCompetence(draft.effectiveFrom) ||
    hoursInvalid(draft.dailyHours, true) ||
    PERCENTS.some(({ key }) => percentInvalid(draft[key])) ||
    hoursInvalid(draft.usualDailyLimit, false) ||
    hoursInvalid(draft.exceptionalDailyLimit, false);

  const add = () =>
    setDrafts((current) => {
      const last = [...current].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)).at(-1);
      const next = last && isCompetence(last.effectiveFrom) ? addCompetenceMonths(last.effectiveFrom, 1) : firstMonth;
      return [...current, { ...(last ?? draftOf(CLT_FLOOR_RULE, next)), key: crypto.randomUUID(), effectiveFrom: next, note: "" }];
    });

  const submit = () => {
    setTouched(true);

    if (drafts.some(invalid)) {
      setError("Revise os campos destacados.");
      return;
    }

    setError(null);
    const payload = drafts.map((draft) => ({
      effectiveFrom: draft.effectiveFrom,
      dailyHours: draft.dailyHours,
      weekdayPercent: Number(draft.weekdayPercent),
      weekdayBeyondPercent: Number(draft.weekdayBeyondPercent),
      saturdayPercent: Number(draft.saturdayPercent),
      sundayPercent: Number(draft.sundayPercent),
      holidayPercent: Number(draft.holidayPercent),
      usualDailyLimit: draft.usualDailyLimit,
      exceptionalDailyLimit: draft.exceptionalDailyLimit,
      netShortfall: draft.netShortfall,
      note: draft.note.trim() === "" ? null : draft.note,
    }));

    startSaving(async () => {
      const result = await saveOvertimeRulesAction({ rules: payload });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onDone(result);
    });
  };

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <header className="flex items-start gap-4 border-b border-border/70 px-5 pt-5 pb-4 sm:px-6">
        <div className="min-w-0">
          <Dialog.Title className="text-base font-semibold tracking-[-0.02em]">Regras das horas extras</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs leading-5 text-muted-foreground">
            Cada versão vale a partir do mês de trabalho escolhido. O padrão é o piso da CLT, até a empresa e a convenção confirmarem os adicionais.
          </Dialog.Description>
        </div>
        <Dialog.Close
          aria-label="Fechar"
          className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <XIcon aria-hidden="true" size={14} weight="bold" />
        </Dialog.Close>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 sm:px-6">
        {[...drafts]
          .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
          .map((draft) => (
            <fieldset key={draft.key} className="rounded-xl border border-border bg-background/30 p-3" data-testid="overtime-rule">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="A partir de">
                  <MonthPicker aria-label="A partir de" value={draft.effectiveFrom} onChange={(effectiveFrom) => update(draft.key, { effectiveFrom })} invalid={touched && !isCompetence(draft.effectiveFrom)} />
                </Field>
                <Field label="Jornada (h/dia)">
                  <input
                    aria-label="Jornada diária"
                    value={draft.dailyHours}
                    inputMode="decimal"
                    onChange={(event) => update(draft.key, { dailyHours: event.target.value })}
                    className={cn(inputClass, "font-mono", touched && hoursInvalid(draft.dailyHours, true) && "border-destructive")}
                  />
                </Field>
                <Field label="Extras/dia habitual">
                  <input
                    aria-label="Limite habitual de horas extras por dia"
                    value={draft.usualDailyLimit}
                    inputMode="decimal"
                    placeholder="—"
                    onChange={(event) => update(draft.key, { usualDailyLimit: event.target.value })}
                    className={cn(inputClass, "font-mono", touched && hoursInvalid(draft.usualDailyLimit, false) && "border-destructive")}
                  />
                </Field>
                <Field label="Extras/dia exceção">
                  <input
                    aria-label="Limite excepcional de horas extras por dia"
                    value={draft.exceptionalDailyLimit}
                    inputMode="decimal"
                    placeholder="—"
                    onChange={(event) => update(draft.key, { exceptionalDailyLimit: event.target.value })}
                    className={cn(inputClass, "font-mono", touched && hoursInvalid(draft.exceptionalDailyLimit, false) && "border-destructive")}
                  />
                </Field>
              </div>
              <p className="mt-3 mb-1 text-[10px] tracking-[0.08em] text-muted-foreground uppercase">Adicional (%)</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {PERCENTS.map(({ key, label, name }) => (
                  <Field key={key} label={label}>
                    <input
                      aria-label={`Adicional: ${name}`}
                      value={draft[key]}
                      inputMode="numeric"
                      onChange={(event) => update(draft.key, { [key]: event.target.value })}
                      className={cn(inputClass, "font-mono", touched && percentInvalid(draft[key]) && "border-destructive")}
                    />
                  </Field>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Field label="Observação">
                  <input aria-label="Observação da regra" value={draft.note} maxLength={300} onChange={(event) => update(draft.key, { note: event.target.value })} className={inputClass} />
                </Field>
                <div className="flex items-end gap-3">
                  <label className="flex min-h-9 items-center gap-2 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={draft.netShortfall}
                      onChange={(event) => update(draft.key, { netShortfall: event.target.checked })}
                      className="size-4 accent-[var(--primary)]"
                    />
                    Descontar horas abaixo da jornada
                  </label>
                  {drafts.length > 1 ? (
                    <button
                      type="button"
                      aria-label="Remover esta versão"
                      onClick={() => setDrafts((current) => current.filter((item) => item.key !== draft.key))}
                      className="grid size-9 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <TrashIcon aria-hidden="true" size={14} />
                    </button>
                  ) : null}
                </div>
              </div>
            </fieldset>
          ))}

        <button
          type="button"
          onClick={add}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-border px-3 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <PlusIcon aria-hidden="true" size={13} weight="bold" />
          Nova versão
        </button>

        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-border/70 px-5 py-4 sm:px-6">
        <Dialog.Close className={secondaryButtonClass}>Cancelar</Dialog.Close>
        <button type="submit" disabled={saving} className={primaryButtonClass}>
          {saving ? "Salvando…" : "Salvar regras"}
        </button>
      </footer>
    </form>
  );
}
