"use client";

import { CaretDownIcon, CircleNotchIcon, FileArrowUpIcon, PlusIcon, TrashIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { useRef, useState, type ChangeEvent } from "react";

import { Badge } from "@/components/product/badge";
import { DatePicker, MonthPicker } from "@/components/ui/date-picker";
import { Picker } from "@/components/ui/picker";
import { formatCompetence } from "@/lib/competence";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { OvertimeMonthView } from "@/modules/income/application/get-overtime-view";
import type { ImportPreviewMonth, OvertimeImportResponse } from "@/modules/income/application/overtime-import";
import type { IsoDate } from "@/modules/income/domain/income";
import {
  CATEGORY_LABELS,
  DAY_TYPE_LABELS,
  DAY_TYPES,
  defaultDayType,
  formatDayMonth,
  formatHours,
  formatHoursInput,
  formatPeriod,
  OVERTIME_CATEGORIES,
  OVERTIME_PAY_KINDS,
  PAY_KIND_PERCENT,
  parseHoursInput,
  TIMING_LABELS,
  type DayType,
  type HourlyRate,
  type OvertimeCategory,
  type OvertimePayKind,
  type PaymentLine,
  type PaymentTiming,
  type PaymentValue,
} from "@/modules/income/domain/overtime";
import { Field, inputClass, secondaryButtonClass } from "@/modules/portfolio/ui/edit-dialogs";

// As três partes do formulário único das Horas extras (spec 098): a declaração
// do mês, o anexo da folha .xlsx e os pagamentos. O estado fica no diálogo
// (`overtime-entry-dialog.tsx`) e só é gravado no Salvar; aqui só os campos.

export const sectionTitle = "mb-2 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase";

export type Totals = Record<OvertimeCategory, string>;

export function parseHours(text: string) {
  const hours = parseHoursInput(text);
  return hours === null || Number.isNaN(hours) ? 0 : hours;
}

export function invalidHours(text: string) {
  const hours = parseHoursInput(text);
  return hours !== null && (Number.isNaN(hours) || hours > 74400);
}

export function HoursInput({ label, value, invalid, onChange }: { label: string; value: string; invalid: boolean; onChange: (value: string) => void }) {
  return (
    <span className="relative block">
      <input
        aria-label={label}
        value={value}
        inputMode="decimal"
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          const hours = parseHoursInput(value);
          if (hours !== null && !Number.isNaN(hours)) onChange(formatHoursInput(hours));
        }}
        placeholder="0"
        aria-invalid={invalid || undefined}
        className={cn(inputClass, "pr-7 text-right font-mono tabular-nums", invalid && "border-destructive")}
      />
      <span className="pointer-events-none absolute inset-y-0 right-2.5 grid place-items-center text-[11px] text-muted-foreground">h</span>
    </span>
  );
}

// ---------------------------------------------------------------- declaração

export function DeclarationSection({
  competence,
  onCompetence,
  period,
  onPeriod,
  totals,
  onTotals,
  sheetHours,
  onUseSheet,
  compensated,
  onCompensated,
  note,
  onNote,
  showCompensated,
  touched,
}: {
  competence: string;
  onCompetence: (value: string) => void;
  period: { startsOn: string; endsOn: string };
  onPeriod: (patch: Partial<{ startsOn: string; endsOn: string }>) => void;
  totals: Totals;
  onTotals: (category: OvertimeCategory, value: string) => void;
  /** As horas da folha, quando os campos não batem com ela. */
  sheetHours: number | null;
  onUseSheet: () => void;
  compensated: string;
  onCompensated: (value: string) => void;
  note: string;
  onNote: (value: string) => void;
  showCompensated: boolean;
  touched: boolean;
}) {
  const declared = OVERTIME_CATEGORIES.reduce((sum, category) => sum + parseHours(totals[category]), 0);

  return (
    <div className="space-y-5" data-testid="overtime-declaration">
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
        <Field label="Mês">
          <MonthPicker aria-label="Mês declarado" value={competence} onChange={onCompetence} invalid={touched && !competence} />
        </Field>
        <Field label="Folha de">
          <DatePicker aria-label="Início da folha" value={period.startsOn} onChange={(startsOn) => onPeriod({ startsOn })} invalid={touched && !period.startsOn} />
        </Field>
        <Field label="Até">
          <DatePicker aria-label="Fim da folha" value={period.endsOn} onChange={(endsOn) => onPeriod({ endsOn })} invalid={touched && !period.endsOn} />
        </Field>
      </div>

      <fieldset className="min-w-0">
        <legend className={cn(sectionTitle, "flex w-full items-baseline justify-between")}>
          <span>Horas a mais declaradas</span>
          <span className="font-mono text-foreground normal-case" data-testid="overtime-declared-total">
            {formatHours(declared)}
          </span>
        </legend>
        <div className="divide-y divide-border/60 rounded-xl border border-border bg-background/30">
          {OVERTIME_CATEGORIES.map((category) => (
            <div key={category} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-xs text-foreground/85">{CATEGORY_LABELS[category]}</span>
              <span className="w-[96px] shrink-0">
                <HoursInput label={CATEGORY_LABELS[category]} value={totals[category]} invalid={touched && invalidHours(totals[category])} onChange={(value) => onTotals(category, value)} />
              </span>
            </div>
          ))}
        </div>
        {sheetHours !== null ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground" data-testid="overtime-sheet-differs">
            A folha registra {formatHours(sheetHours)} extras.
            <button type="button" onClick={onUseSheet} className="font-medium text-primary outline-none hover:underline focus-visible:underline">
              Usar as horas da folha
            </button>
          </p>
        ) : null}
      </fieldset>

      <div className={cn("grid grid-cols-1 gap-3", showCompensated && "min-[420px]:grid-cols-[140px_minmax(0,1fr)]")}>
        {showCompensated ? (
          <Field label="Compensadas">
            <HoursInput label="Horas compensadas com folga" value={compensated} invalid={touched && invalidHours(compensated)} onChange={onCompensated} />
          </Field>
        ) : null}
        <Field label="Observação">
          <input aria-label="Observação" value={note} maxLength={500} onChange={(event) => onNote(event.target.value)} className={inputClass} />
        </Field>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- anexo

export type EncodedFile = { name: string; data: string };

async function encode(file: File): Promise<EncodedFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return { name: file.name, data: btoa(binary) };
}

/** A rota da importação: `check` lê o arquivo; `apply` grava o mês escolhido. */
export async function postTimesheet(body: unknown): Promise<OvertimeImportResponse> {
  try {
    const response = await fetch("/api/recebimentos/horas-extras/importar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await response.json()) as OvertimeImportResponse;
  } catch {
    return { state: "invalid", message: "Não foi possível falar com o aplicativo. Tente de novo." };
  }
}

export type AttachedSheet = { file: EncodedFile; months: ImportPreviewMonth[]; errors: string[] };

/** Um dia da folha como está no formulário: o tipo pode ter sido trocado e ainda não salvo. */
export type FormDay = { id: string; date: IsoDate; hours: number; dayType: DayType; activity: string | null; hint: string | null; extra: number; shortfall: number };

/**
 * O anexo: a folha .xlsx que o usuário envia à empresa. Lida, ela preenche a
 * declaração do mês (o período e as horas a mais). No mês que já tem a folha,
 * mostra os dias, com o tipo de cada um trocável.
 */
export function AttachmentSection({
  competence,
  attached,
  onAttach,
  onClear,
  month,
  days,
  onDayType,
}: {
  competence: string;
  attached: AttachedSheet | null;
  onAttach: (sheet: AttachedSheet) => void;
  onClear: () => void;
  month: OvertimeMonthView | null;
  days: FormDay[];
  onDayType: (day: FormDay, dayType: DayType) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const match = attached?.months.find((entry) => entry.month === competence) ?? null;

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setChecking(true);
    const encoded = await encode(file);
    const result = await postTimesheet({ mode: "check", files: [encoded] });
    setChecking(false);

    if (result.state !== "checked") {
      setError(result.state === "invalid" ? result.message : "Resposta inesperada do aplicativo.");
      return;
    }

    onAttach({ file: encoded, months: result.preview.months, errors: result.preview.errors.map((item) => `${item.sourceName}: ${item.message}`) });
  }

  return (
    <div className="space-y-4" data-testid="overtime-attachment">
      {month?.sourceName && !attached ? (
        <p className="text-xs text-muted-foreground">
          Folha <span className="text-foreground">{month.sourceName}</span>
        </p>
      ) : null}

      {attached ? (
        <div className="rounded-xl border border-border bg-background/30 px-3 py-2.5 text-xs" data-testid="overtime-attachment-match">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate font-medium text-foreground">{attached.file.name}</span>
            <button type="button" onClick={onClear} className="shrink-0 text-[11px] font-medium text-muted-foreground hover:text-foreground">
              Remover
            </button>
          </div>
          {match ? (
            <>
              <p className="mt-1 text-muted-foreground">
                {formatCompetence(match.month)} · folha de {formatPeriod(match.startsOn, match.endsOn)} · <span className="font-mono text-foreground">{formatHours(match.worked)}</span> a mais
              </p>
              {match.warnings.map((warning) => (
                <p key={warning} className="mt-1 flex gap-1.5 text-[11px] text-muted-foreground">
                  <WarningCircleIcon aria-hidden="true" size={12} className="mt-0.5 shrink-0" />
                  {warning}
                </p>
              ))}
            </>
          ) : (
            <p role="alert" className="mt-1 text-destructive">
              {attached.months.length === 0
                ? "O arquivo não tem a folha de horas."
                : `O arquivo não tem a folha de ${formatCompetence(competence)} (tem ${attached.months.map((entry) => formatCompetence(entry.month)).join(", ")}).`}
            </p>
          )}
          {attached.errors.map((message) => (
            <p key={message} className="mt-1 text-[11px] text-destructive">
              {message}
            </p>
          ))}
        </div>
      ) : null}

      <div>
        <button type="button" className={secondaryButtonClass} disabled={checking} onClick={() => input.current?.click()}>
          {checking ? <CircleNotchIcon aria-hidden="true" className="mr-2 animate-spin" size={14} weight="bold" /> : <FileArrowUpIcon aria-hidden="true" className="mr-2 text-primary" size={14} weight="duotone" />}
          {checking ? "Lendo a folha…" : attached || month?.sourceName ? "Trocar a folha .xlsx" : "Anexar a folha .xlsx"}
        </button>
        <input
          ref={input}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          tabIndex={-1}
          aria-label="Folha de horas"
          onChange={choose}
        />
      </div>

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-xs leading-5 text-destructive">
          <WarningCircleIcon aria-hidden="true" className="mt-0.5 shrink-0" size={14} weight="fill" />
          {error}
        </p>
      ) : null}

      {days.length > 0 && !attached ? <Days days={days} onDayType={onDayType} /> : null}
    </div>
  );
}

/** Os dias da folha, começando recolhidos; trocar o tipo de um dia refaz as horas da declaração. */
function Days({ days, onDayType }: { days: FormDay[]; onDayType: (day: FormDay, dayType: DayType) => void }) {
  return (
    <details className="group rounded-xl border border-border" data-testid="overtime-days">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        Dias da folha ({days.length})
        <CaretDownIcon aria-hidden="true" size={12} className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="overflow-x-auto border-t border-border/70">
        <table className="w-full text-left text-xs">
          <thead className="text-[9px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2">Dia</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2 text-right">Horas</th>
              <th className="px-3 py-2 text-right">A mais</th>
              <th className="px-3 py-2">Atividade</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.id} data-testid="overtime-day" data-date={day.date} className={cn("border-t border-border/50", day.extra > 0 && "bg-chart-saved/[0.04]")}>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  <span className="font-mono">{formatDayMonth(day.date)}</span>
                  {day.hint ? <span className="block text-[10px] text-muted-foreground">{day.hint}</span> : null}
                </td>
                <td className="px-3 py-1.5">
                  <Picker
                    className="w-[118px]"
                    size="sm"
                    aria-label={`Tipo de ${formatDayMonth(day.date)}`}
                    options={DAY_TYPES.map((type) => ({ value: type, label: DAY_TYPE_LABELS[type] }))}
                    value={day.dayType}
                    searchable={false}
                    changed={day.dayType !== defaultDayType(day.date)}
                    onValueChange={(value) => value !== day.dayType && onDayType(day, value as DayType)}
                  />
                </td>
                <td className="px-3 py-1.5 text-right font-mono">{day.hours === 0 ? <span className="text-muted-foreground/50">—</span> : formatHours(day.hours, { unit: false })}</td>
                <td className={cn("px-3 py-1.5 text-right font-mono", day.extra > 0 ? "text-primary" : "text-muted-foreground/50")}>
                  {day.extra > 0 ? `+${formatHours(day.extra, { unit: false })}` : day.shortfall > 0 ? <span className="text-muted-foreground">−{formatHours(day.shortfall, { unit: false })}</span> : "—"}
                </td>
                <td className="max-w-[220px] truncate px-3 py-1.5 text-muted-foreground" title={day.activity ?? undefined}>
                  {day.activity ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------- pagamento

/** Um pagamento no formulário: o holerite e as horas de cada adicional, como texto. */
export type PaymentDraft = { key: string; id: string | null; paymentMonth: string; hours: Record<OvertimePayKind, string>; note: string };

export const emptyHours = () => Object.fromEntries(OVERTIME_PAY_KINDS.map((kind) => [kind, ""])) as PaymentDraft["hours"];

export function hoursOfLines(lines: readonly PaymentLine[]): PaymentDraft["hours"] {
  const hours = emptyHours();
  for (const line of lines) {
    hours[line.kind] = line.hours > 0 ? formatHoursInput(line.hours) : "";
  }
  return hours;
}

export const draftLines = (draft: PaymentDraft): PaymentLine[] =>
  OVERTIME_PAY_KINDS.map((kind) => ({ kind, hours: parseHours(draft.hours[kind]) })).filter((line) => line.hours > 0);

/** Algum campo de horas do pagamento foi preenchido. */
export const draftFilled = (draft: PaymentDraft) => OVERTIME_PAY_KINDS.some((kind) => draft.hours[kind].trim() !== "");

export type DraftValue = { timing: PaymentTiming | null; rate: HourlyRate | null; value: PaymentValue | null };

/**
 * Os pagamentos do mês, um bloco por holerite, já preenchidos com os
 * registrados. O usuário informa só as horas; o valor de cada adicional e o DSR
 * saem do salário bruto do holerite em Recebimentos (hora normal) e do
 * calendário do mês dele.
 */
export function PaymentSection({
  payable,
  overdue,
  drafts,
  values,
  onChange,
  onAdd,
  onRemove,
  touched,
}: {
  payable: number;
  /** O mês já passou do prazo do holerite: o que falta aparece em destaque. */
  overdue: boolean;
  drafts: PaymentDraft[];
  values: Record<string, DraftValue>;
  onChange: (key: string, patch: Partial<PaymentDraft>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
  touched: boolean;
}) {
  const paid = drafts.reduce((sum, draft) => sum + draftLines(draft).reduce((total, line) => total + line.hours, 0), 0);
  const overpaid = paid > payable;

  return (
    <div className="space-y-4" data-testid="overtime-payment">
      <dl className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-background/30 px-3 py-2.5 text-xs" data-testid="overtime-payment-summary">
        <SummaryValue label="Declaradas" value={formatHours(payable)} />
        <SummaryValue label="Pagas" value={formatHours(paid)} />
        <SummaryValue label={overpaid ? "Pagas a mais" : "Em aberto"} value={formatHours(Math.abs(payable - paid))} emphasis={overdue && payable > paid} />
      </dl>

      {drafts.length > 0 ? (
        <ul className="space-y-3" aria-label="Pagamentos">
          {drafts.map((draft) => (
            <PaymentBlock
              key={draft.key}
              draft={draft}
              value={values[draft.key] ?? { timing: null, rate: null, value: null }}
              onChange={(patch) => onChange(draft.key, patch)}
              onRemove={() => onRemove(draft.key)}
              touched={touched}
            />
          ))}
        </ul>
      ) : null}

      <button type="button" onClick={onAdd} className={cn(secondaryButtonClass, "h-9 text-xs")} data-testid="overtime-payment-add">
        <PlusIcon aria-hidden="true" className="mr-1.5 text-primary" size={12} weight="bold" />
        {drafts.length === 0 ? "Registrar pagamento" : "Outro holerite"}
      </button>
    </div>
  );
}

const paymentGrid = "grid grid-cols-[minmax(0,1fr)_84px_minmax(0,112px)] items-center gap-2 px-3";

function PaymentBlock({
  draft,
  value: { timing, rate, value },
  onChange,
  onRemove,
  touched,
}: {
  draft: PaymentDraft;
  value: DraftValue;
  onChange: (patch: Partial<PaymentDraft>) => void;
  onRemove: () => void;
  touched: boolean;
}) {
  const filled = draftFilled(draft);
  const lineCents = (kind: OvertimePayKind) => value?.lines.find((line) => line.kind === kind)?.cents ?? null;
  const hours = draftLines(draft).reduce((sum, line) => sum + line.hours, 0);
  const money = (cents: number | null) => (cents === null || cents === 0 ? <span className="text-muted-foreground/45">—</span> : formatCents(cents));
  const payslip = draft.paymentMonth ? formatCompetence(draft.paymentMonth) : "";
  const estimated = rate !== null && (rate.source !== "normal" || rate.month !== draft.paymentMonth);

  return (
    <li className="rounded-xl border border-border bg-background/30" data-testid="overtime-payment-block" data-payslip={draft.paymentMonth}>
      <div className="flex items-end gap-2 border-b border-border/60 px-3 pt-2.5 pb-3">
        <div className="w-[150px]">
          <Field label="Holerite">
            <MonthPicker aria-label="Holerite que pagou" value={draft.paymentMonth} onChange={(paymentMonth) => onChange({ paymentMonth })} invalid={touched && filled && !draft.paymentMonth} />
          </Field>
        </div>
        {timing && timing !== "onTime" ? (
          <span className="pb-2">
            <Badge tone="accent">{TIMING_LABELS[timing]}</Badge>
          </span>
        ) : null}
        <button
          type="button"
          aria-label={payslip ? `Remover o pagamento do holerite de ${payslip}` : "Remover o pagamento"}
          onClick={onRemove}
          className="ml-auto grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <TrashIcon aria-hidden="true" size={14} />
        </button>
      </div>

      <div className="divide-y divide-border/50 font-mono text-xs tabular-nums">
        <div className={cn(paymentGrid, "pt-2 pb-1 font-sans text-[9px] font-semibold tracking-[0.1em] text-muted-foreground uppercase")}>
          <span>Adicional</span>
          <span className="text-right">Horas</span>
          <span className="text-right">Valor</span>
        </div>
        {OVERTIME_PAY_KINDS.map((kind) => (
          <div key={kind} className={cn(paymentGrid, "py-1.5")}>
            <span className="font-sans text-foreground/85">{PAY_KIND_PERCENT[kind]}%</span>
            <HoursInput
              label={`Horas pagas a ${PAY_KIND_PERCENT[kind]}%`}
              value={draft.hours[kind]}
              invalid={touched && invalidHours(draft.hours[kind])}
              onChange={(text) => onChange({ hours: { ...draft.hours, [kind]: text } })}
            />
            <span className="text-right text-foreground/85" data-testid={`overtime-payment-value-${PAY_KIND_PERCENT[kind]}`}>
              {money(lineCents(kind))}
            </span>
          </div>
        ))}
        <div className={cn(paymentGrid, "py-2")}>
          <span className="font-sans text-foreground/85">DSR</span>
          <span />
          <span className="text-right text-foreground/85" data-testid="overtime-payment-dsr">
            {money(value?.dsrCents ?? null)}
          </span>
        </div>
        <div className={cn(paymentGrid, "py-2 font-semibold text-foreground")}>
          <span className="font-sans">Total</span>
          <span className="pr-7 text-right">{hours > 0 ? formatHours(hours, { unit: false }) : ""}</span>
          <span className="text-right" data-testid="overtime-payment-total">
            {money(value ? value.amountCents + value.dsrCents : null)}
          </span>
        </div>
      </div>

      <div className="space-y-2 px-3 pt-1 pb-3">
        <p className="text-[10px] text-muted-foreground" data-testid="overtime-payment-rate">
          {rate
            ? `Hora normal ${estimated ? "≈ " : ""}${formatCents(Math.round(rate.cents))} · ${rate.source === "gross" ? "salário bruto" : "holerite"} de ${formatCompetence(rate.month)} em Recebimentos`
            : "Lance o salário em Recebimentos para ver o valor."}
        </p>
        <input
          aria-label="Observação do pagamento"
          placeholder="Observação (opcional)"
          value={draft.note}
          maxLength={500}
          onChange={(event) => onChange({ note: event.target.value })}
          className={cn(inputClass, "h-9 text-xs")}
        />
      </div>
    </li>
  );
}

function SummaryValue({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] tracking-[0.08em] text-muted-foreground uppercase">{label}</dt>
      <dd className={cn("mt-1 font-mono text-sm", emphasis ? "font-semibold text-chart-spent" : "text-foreground")}>{value}</dd>
    </div>
  );
}
