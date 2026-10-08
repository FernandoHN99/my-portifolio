"use client";

import { Dialog } from "@base-ui/react/dialog";
import { RepeatIcon, TrashIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { useId, useState, useTransition, type ReactNode } from "react";

import {
  createFamilyEntryAction,
  deleteFamilyEntriesAction,
  updateFamilyEntryAction,
  updateFamilySeriesAction,
  type FamilyActionResult,
} from "@/app/actions/family-expenses";
import { MonthPicker } from "@/components/ui/date-picker";
import { Picker } from "@/components/ui/picker";
import { cn } from "@/lib/utils";
import { formatCompetence, isCompetence } from "@/lib/competence";
import {
  DIRECTION_LABELS,
  DIRECTION_MEANINGS,
  normalizeText,
  STATUS_LABELS,
  type Direction,
  type EntryStatus,
  type LedgerContact,
  type LedgerEntry,
  type LedgerSeries,
  type SeriesKind,
} from "@/modules/family-expenses/domain/ledger";
import { formatAmountInput, formatCents, parseAmountInput, MAX_AMOUNT_CENTS } from "@/lib/money";
import { MAX_SERIES_COUNT, seriesSpan } from "@/modules/family-expenses/domain/series";
import { backdropClass, Field, inputClass, primaryButtonClass, secondaryButtonClass } from "@/modules/portfolio/ui/edit-dialogs";

// Formulário único de Gastos familiares (specs 082 e 083): inclui um lançamento
// ou uma série (parcelado ou mensal, já com todos os meses) e edita um
// lançamento só ou a série inteira. Tudo na mesma página, num diálogo.

export type EntryDialogTarget =
  | { mode: "create"; competence: string; contactId: string | null }
  | { mode: "edit"; entry: LedgerEntry; series: LedgerSeries | null };

type Repeat = "NONE" | SeriesKind;
type Scope = "entry" | "series";
type ContactChoice = { id: string } | { newName: string } | null;

const GENERIC_CONTACT = "Outros";
const NEW_GENERIC = "\u0000novo:Outros";

const popupClass =
  "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-1.5rem)] w-[min(500px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0";

export function EntryDialog({
  open,
  onOpenChange,
  target,
  formKey,
  contacts,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: EntryDialogTarget | null;
  formKey: number;
  contacts: LedgerContact[];
  onSaved: (result: FamilyActionResult) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup className={popupClass} data-testid="family-entry-form">
          {target ? (
            <EntryForm
              key={formKey}
              target={target}
              contacts={contacts}
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

function EntryForm({
  target,
  contacts,
  onDone,
}: {
  target: EntryDialogTarget;
  contacts: LedgerContact[];
  onDone: (result: FamilyActionResult) => void;
}) {
  const editing = target.mode === "edit" ? target : null;
  const series = editing?.series ?? null;
  const [scope, setScope] = useState<Scope>("entry");
  const inSeries = scope === "series" && series !== null;
  const base = editing ? (inSeries ? series : editing.entry) : null;

  const [competence, setCompetence] = useState(
    editing ? (inSeries ? series!.firstCompetence : editing.entry.competence) : target.mode === "create" ? target.competence : "",
  );
  const [contact, setContact] = useState<ContactChoice>(() => {
    const id = editing ? editing.entry.contactId : target.mode === "create" ? target.contactId : null;
    return id ? { id } : null;
  });
  const [description, setDescription] = useState(base?.description ?? "");
  const [direction, setDirection] = useState<Direction>(base?.direction ?? "RECEIVABLE");
  const [amount, setAmount] = useState(base ? formatAmountInput(base.amountCents) : "");
  const [status, setStatus] = useState<EntryStatus>(editing?.entry.status ?? "PENDING");
  const [repeat, setRepeat] = useState<Repeat>(series?.kind ?? "NONE");
  const [count, setCount] = useState(String(series?.count ?? 12));
  const [requestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const formId = useId();

  // Ao trocar entre o lançamento e a série, o formulário mostra os dados de cada um.
  const switchScope = (next: Scope) => {
    if (!editing || next === scope) return;
    const source = next === "series" && series ? series : editing.entry;
    setScope(next);
    setCompetence(next === "series" && series ? series.firstCompetence : editing.entry.competence);
    setDescription(source.description);
    setDirection(source.direction);
    setAmount(formatAmountInput(source.amountCents));
    setContact({ id: source.contactId });
    setError(null);
  };

  const amountCents = parseAmountInput(amount);
  const repeating = editing ? inSeries : repeat !== "NONE";
  const seriesKind: SeriesKind = repeat === "NONE" ? "INSTALLMENTS" : repeat;
  const countNumber = Number(count);
  const minCount = editing ? 1 : 2;
  const countValid = !repeating || (Number.isInteger(countNumber) && countNumber >= minCount && countNumber <= MAX_SERIES_COUNT);
  const amountValid = amountCents !== null && amountCents > 0 && amountCents <= MAX_AMOUNT_CENTS;
  const valid = isCompetence(competence) && contact !== null && description.trim() !== "" && amountValid && countValid;

  const contactOptions = [
    ...contacts.map((entry) => ({ value: entry.id, label: entry.name })),
    ...(contacts.some((entry) => normalizeText(entry.name) === normalizeText(GENERIC_CONTACT))
      ? []
      : [{ value: NEW_GENERIC, label: GENERIC_CONTACT, hint: "genérico" }]),
    ...(contact && "newName" in contact && normalizeText(contact.newName) !== normalizeText(GENERIC_CONTACT)
      ? [{ value: `\u0000novo:${contact.newName}`, label: contact.newName, hint: "nova" }]
      : []),
  ];
  const contactValue = contact === null ? null : "id" in contact ? contact.id : normalizeText(contact.newName) === normalizeText(GENERIC_CONTACT) ? NEW_GENERIC : `\u0000novo:${contact.newName}`;
  const contactPayload = contact === null ? null : "id" in contact ? { contactId: contact.id } : { newContactName: contact.newName };

  const submit = () => {
    setTouched(true);

    if (!valid || !contactPayload) {
      setError("Preencha competência, pessoa, descrição e um valor maior que zero.");
      return;
    }

    setError(null);
    const fields = { competence, description: description.trim(), contact: contactPayload, direction, amount };

    startSaving(async () => {
      const result = !editing
        ? await createFamilyEntryAction({
            ...fields,
            status: repeating ? "PENDING" : status,
            repeat: repeating ? { kind: seriesKind, count: countNumber } : null,
            requestId,
          })
        : inSeries
          ? await updateFamilySeriesAction({ ...fields, seriesId: series!.id, kind: seriesKind, count: countNumber })
          : await updateFamilyEntryAction({ ...fields, id: editing.entry.id, status });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      onDone(result);
    });
  };

  const remove = () =>
    startDeleting(async () => {
      const result = await deleteFamilyEntriesAction(inSeries ? { seriesId: series!.id } : { ids: [editing!.entry.id] });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      onDone(result);
    });

  const span = repeating && countValid && isCompetence(competence) ? seriesSpan(competence, countNumber) : null;
  const signed = amountValid ? (direction === "RECEIVABLE" ? amountCents! : -amountCents!) : null;
  const title = editing ? (inSeries ? "Editar série" : "Editar lançamento") : "Novo lançamento";

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
          <Dialog.Title className="truncate text-base font-semibold tracking-[-0.02em]">{title}</Dialog.Title>
          {inSeries ? (
            <Dialog.Description className="mt-1 text-xs leading-5 text-muted-foreground">
              Muda os pendentes da série; os acertados ficam como estão.
            </Dialog.Description>
          ) : null}
        </div>
        <Dialog.Close
          aria-label="Fechar"
          className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <XIcon aria-hidden="true" size={14} weight="bold" />
        </Dialog.Close>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
        {series ? (
          <Segmented
            label="O que editar"
            value={scope}
            onChange={(next) => switchScope(next as Scope)}
            options={[
              { value: "entry", label: "Este lançamento" },
              { value: "series", label: `Série inteira (${series.count})` },
            ]}
          />
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label={inSeries || (!editing && repeating) ? "Primeiro mês" : "Competência"}>
            <MonthPicker
              aria-label={inSeries || (!editing && repeating) ? "Primeiro mês" : "Competência"}
              value={competence}
              onChange={setCompetence}
              invalid={touched && !isCompetence(competence)}
            />
          </Field>
          <Field label="Pessoa">
            <Picker
              aria-label="Pessoa"
              options={contactOptions}
              value={contactValue}
              placeholder="Escolha ou digite"
              invalid={touched && contact === null}
              onValueChange={(value) =>
                setContact(
                  value === NEW_GENERIC
                    ? { newName: GENERIC_CONTACT }
                    : value.startsWith("\u0000novo:")
                      ? { newName: value.slice("\u0000novo:".length) }
                      : { id: value },
                )
              }
              onCreate={(text) => setContact({ newName: text.trim().replace(/\s+/g, " ").slice(0, 60) })}
              createLabel={(text) => `Incluir “${text}”`}
              emptyMessage="Digite para incluir uma pessoa"
            />
          </Field>
        </div>

        <Field label="Descrição">
          <input
            aria-label="Descrição"
            value={description}
            maxLength={120}
            autoComplete="off"
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Ex.: Spotify, Gasolina, Geladeira"
            aria-invalid={(touched && description.trim() === "") || undefined}
            className={cn(inputClass, touched && description.trim() === "" && "border-destructive")}
          />
        </Field>

        <Segmented
          label="Tipo"
          value={direction}
          onChange={(next) => setDirection(next as Direction)}
          options={(["RECEIVABLE", "PAYABLE"] as const).map((value) => ({
            value,
            label: DIRECTION_LABELS[value],
            hint: DIRECTION_MEANINGS[value],
          }))}
          tone
        />

        {!editing ? (
          <Segmented
            label="Repetir"
            value={repeat}
            onChange={(next) => setRepeat(next as Repeat)}
            options={[
              { value: "NONE", label: "Não" },
              { value: "INSTALLMENTS", label: "Parcelado", hint: "(1/N) na descrição" },
              { value: "MONTHLY", label: "Mensal", hint: "mesmo texto todo mês" },
            ]}
          />
        ) : inSeries ? (
          <Segmented
            label="Série"
            value={seriesKind}
            onChange={(next) => setRepeat(next as Repeat)}
            options={[
              { value: "INSTALLMENTS", label: "Parcelado", hint: "(1/N) na descrição" },
              { value: "MONTHLY", label: "Mensal", hint: "mesmo texto todo mês" },
            ]}
          />
        ) : null}

        <div className={cn("grid gap-3", repeating ? "grid-cols-2" : "grid-cols-1")}>
          <Field label={repeating ? (seriesKind === "MONTHLY" ? "Valor por mês" : "Valor da parcela") : "Valor"}>
            <span className="relative block">
              <span className="pointer-events-none absolute inset-y-0 left-2.5 grid place-items-center text-[11px] text-muted-foreground">
                R$
              </span>
              <input
                aria-label={repeating ? "Valor de cada mês" : "Valor"}
                value={amount}
                inputMode="decimal"
                autoComplete="off"
                onChange={(event) => setAmount(event.target.value)}
                onBlur={() => amountValid && setAmount(formatAmountInput(amountCents!))}
                placeholder="0,00"
                aria-invalid={(touched && !amountValid) || undefined}
                className={cn(inputClass, "pl-8 font-mono tabular-nums", touched && !amountValid && "border-destructive")}
              />
            </span>
          </Field>
          {repeating ? (
            <Field label={seriesKind === "MONTHLY" ? "Meses" : "Parcelas"}>
              <input
                aria-label={seriesKind === "MONTHLY" ? "Quantidade de meses" : "Quantidade de parcelas"}
                value={count}
                inputMode="numeric"
                autoComplete="off"
                onChange={(event) => setCount(event.target.value.replace(/\D/g, "").slice(0, 3))}
                aria-invalid={(touched && !countValid) || undefined}
                className={cn(inputClass, "font-mono tabular-nums", touched && !countValid && "border-destructive")}
              />
            </Field>
          ) : null}
        </div>

        {!repeating ? (
          <Segmented
            label="Status"
            value={status}
            onChange={(next) => setStatus(next as EntryStatus)}
            options={(["PENDING", "SETTLED"] as const).map((value) => ({ value, label: STATUS_LABELS[value] }))}
          />
        ) : null}

        <dl data-testid="family-entry-preview" className="space-y-1.5 rounded-xl border border-border bg-background/30 px-3 py-2.5 text-xs">
          {repeating && span && amountValid ? (
            <>
              <PreviewRow label={seriesKind === "MONTHLY" ? "Meses" : "Parcelas"}>
                {countNumber} × {formatCents(amountCents!)}
              </PreviewRow>
              <PreviewRow label="Período">
                {formatCompetence(span.first)} a {formatCompetence(span.last)}
              </PreviewRow>
              <PreviewRow label="Total da série">
                <span className={direction === "RECEIVABLE" ? "text-chart-up" : "text-chart-down"}>
                  {formatCents((direction === "RECEIVABLE" ? 1 : -1) * amountCents! * countNumber, { signed: true })}
                </span>
              </PreviewRow>
              {!editing ? <PreviewRow label="Status">todos pendentes</PreviewRow> : null}
            </>
          ) : (
            <PreviewRow label="Saldo">
              {signed === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span className={signed > 0 ? "text-chart-up" : "text-chart-down"}>
                  {formatCents(signed, { signed: true })} {signed > 0 ? "a receber" : "a pagar"}
                </span>
              )}
            </PreviewRow>
          )}
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
            {inSeries ? "Excluir pendentes" : "Excluir"}
          </button>
        ) : null}
        <Dialog.Close className={cn(secondaryButtonClass, !editing && "ml-auto")}>Cancelar</Dialog.Close>
        <button type="submit" disabled={saving || deleting} className={primaryButtonClass}>
          {repeating && !editing ? <RepeatIcon aria-hidden="true" size={14} weight="bold" /> : null}
          {saving
            ? "Salvando…"
            : !editing && repeating
              ? countValid
                ? `Gerar ${countNumber} ${seriesKind === "MONTHLY" ? "meses" : "parcelas"}`
                : "Gerar"
              : "Salvar"}
        </button>
      </footer>
    </form>
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

/** Escolha entre poucas opções, como um grupo de botões de rádio. */
function Segmented({
  label,
  value,
  options,
  onChange,
  tone = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; hint?: string }[];
  onChange: (value: string) => void;
  /** Deve em azul e Devo em laranja, como na tabela. */
  tone?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-1 block text-[10px] tracking-[0.08em] text-muted-foreground uppercase">{label}</legend>
      <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-xl border border-border bg-background/40 p-1">
        {options.map((option) => {
          const checked = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={option.hint ? `${option.label}: ${option.hint}` : option.label}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => {
                const index = options.findIndex((entry) => entry.value === value);
                const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;

                if (step !== 0) {
                  event.preventDefault();
                  const next = options[(index + step + options.length) % options.length];
                  onChange(next.value);
                  (event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=radio]")[options.indexOf(next)])?.focus();
                }
              }}
              tabIndex={checked ? 0 : -1}
              className={cn(
                "flex min-h-9 min-w-0 flex-1 flex-col items-center justify-center rounded-lg px-2 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                checked
                  ? tone
                    ? option.value === "RECEIVABLE"
                      ? "bg-chart-up/15 text-chart-up"
                      : "bg-chart-down/15 text-chart-down"
                    : "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="truncate">{option.label}</span>
              {option.hint ? (
                <span className={cn("truncate text-[10px] font-normal", checked && !tone ? "text-primary-foreground/75" : "text-muted-foreground")}>
                  {option.hint}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
