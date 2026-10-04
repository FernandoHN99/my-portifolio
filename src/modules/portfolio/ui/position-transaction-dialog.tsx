"use client";

import { Dialog } from "@base-ui/react/dialog";
import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { useState, useTransition, type ReactNode } from "react";

import { addTransactionAction, updateTransactionAction, type EditActionResult } from "@/app/actions/edit-month";
import { cn } from "@/lib/utils";
import {
  resolveMovement,
  TRANSACTION_KINDS,
  TRANSACTION_LABELS,
  type MovementMode,
  type StoredTransactionKind,
  type TotalTarget,
  type TransactionKind,
  type TrioField,
} from "@/modules/portfolio/domain/position-transactions";
import {
  formatBrl,
  formatMonthCompact,
  formatPriceBrl,
  parseLocaleNumber,
} from "@/modules/portfolio/presentation/portfolio-format";
import {
  backdropClass,
  Field,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/modules/portfolio/ui/edit-dialogs";

// Movimentação de uma posição (specs 056 e 057): aporte, retirada ou
// rendimento num formulário só, aberto pelo ícone ao lado do lápis, e a
// correção de uma movimentação do mês aberto. O usuário informa o valor desta
// operação ou o novo total da posição; o app calcula o resto, marca o que
// calculou, mostra a divergência quando os números digitados não fecham e a
// prévia antes → movimentação → depois. Preço executado e cotação do mês são
// coisas diferentes: a cotação só sugere o preço quando nenhum foi digitado.

export type TransactionTarget = {
  positionId: string;
  assetName: string;
  /** Nulo nos saldos em reais, sem cotação. */
  quoteSymbol: string | null;
  quantity: number;
  /** Cotação do mês da posição. */
  unitPriceBrl: number | null;
  totalBrl: number;
  /**
   * Renda fixa calculada pelo CDI (spec 060): o rendimento já é automático, e o
   * manual fica desligado para não somar duas vezes.
   */
  cdi?: boolean;
};

/** Movimentação existente, para corrigir. */
export type TransactionEdit = {
  id: string;
  kind: StoredTransactionKind;
  occurredOn: string;
  quantity: number;
  unitPriceBrl: number | null;
  amountBrl: number;
  note: string | null;
};

export type TransactionMonth = {
  id: string;
  label: string;
  /** AAAA-MM-DD do primeiro e do último dia aceitos (o último nunca depois de hoje). */
  firstDay: string;
  lastDay: string;
};

const popupClass =
  "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[min(540px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0";

export function PositionTransactionDialog({
  open,
  onOpenChange,
  target,
  edit = null,
  formKey,
  month,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Continua definido depois de fechar, para o conteúdo não sumir na animação. */
  target: TransactionTarget | null;
  edit?: TransactionEdit | null;
  formKey: number;
  month: TransactionMonth;
  onSaved: (result: EditActionResult) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup className={popupClass} data-testid="transaction-form">
          {target ? (
            <TransactionForm
              key={formKey}
              target={target}
              edit={edit}
              month={month}
              onSaved={(result) => {
                onSaved(result);
                onOpenChange(false);
              }}
            />
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TransactionForm({
  target,
  edit,
  month,
  onSaved,
}: {
  target: TransactionTarget;
  edit: TransactionEdit | null;
  month: TransactionMonth;
  onSaved: (result: EditActionResult) => void;
}) {
  const quoted = target.quoteSymbol !== null;
  const dollars = target.quoteSymbol === "USD";
  const opening = edit?.kind === "OPENING";
  // Na correção, o "antes" é a posição sem esta movimentação.
  const editDelta = edit ? (edit.kind === "WITHDRAWAL" ? -edit.quantity : edit.quantity) : 0;
  const before = { quantity: target.quantity - editDelta, marketPrice: target.unitPriceBrl };
  const [kind, setKind] = useState<StoredTransactionKind>(edit?.kind ?? "CONTRIBUTION");
  const [mode, setMode] = useState<MovementMode>("operation");
  const [totalTarget, setTotalTarget] = useState<TotalTarget>("quantity");
  const [day, setDay] = useState(edit?.occurredOn ?? month.lastDay);
  const [texts, setTexts] = useState({
    quantity: edit && quoted && edit.quantity > 0 ? formatNumber(edit.quantity, 12) : "",
    unitPrice: edit?.unitPriceBrl ? formatNumber(edit.unitPriceBrl, 8) : "",
    amount: edit ? formatNumber(edit.amountBrl, 2) : "",
    total: "",
  });
  const [order, setOrder] = useState<TrioField[]>(() =>
    edit
      ? (["amount", "unitPrice", "quantity"] as TrioField[]).filter((field) =>
          field === "quantity" ? quoted && edit.quantity > 0 : field === "unitPrice" ? Boolean(edit.unitPriceBrl) : true,
        )
      : [],
  );
  const [note, setNote] = useState(edit?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  const typed = {
    quantity: order.includes("quantity") ? parseLocaleNumber(texts.quantity) : null,
    unitPrice: order.includes("unitPrice") ? parseLocaleNumber(texts.unitPrice) : null,
    amount: order.includes("amount") ? parseLocaleNumber(texts.amount) : null,
    total: parseLocaleNumber(texts.total),
  };
  const plan = resolveMovement({ kind, mode, totalTarget, quoted, current: before, typed, order });
  const marketPrice = target.unitPriceBrl ?? 0;
  const marketBefore = quoted ? before.quantity * marketPrice : before.quantity;
  const marketAfter = quoted ? plan.after * marketPrice : plan.after;
  const unit = dollars ? "US$" : "un.";
  const sign = plan.kind === "WITHDRAWAL" ? "−" : "+";

  const type = (field: TrioField, text: string) => {
    setTexts((current) => ({ ...current, [field]: text }));
    setOrder((current) =>
      text.trim() === "" ? current.filter((entry) => entry !== field) : [field, ...current.filter((entry) => entry !== field)],
    );
  };

  // O que aparece num campo do trio: o digitado ou o calculado pelo app.
  const shown = (field: TrioField) => {
    if (order.includes(field)) {
      return texts[field];
    }

    const value = field === "quantity" ? plan.quantity : field === "unitPrice" ? plan.unitPrice : plan.amount;
    return value !== null && value > 0 ? formatNumber(value, field === "amount" ? 2 : field === "unitPrice" ? 8 : 12) : "";
  };
  const badge = (field: TrioField) =>
    order.includes(field)
      ? null
      : plan.computed.includes(field)
        ? "calculado"
        : field === "unitPrice" && plan.suggestedPrice
          ? "cotação do mês"
          : null;

  const save = () =>
    startSaving(async () => {
      setError(null);
      const transaction = {
        positionId: target.positionId,
        kind: (plan.kind === "OPENING" ? "CONTRIBUTION" : plan.kind) as TransactionKind,
        occurredOn: day,
        quantity: quoted && plan.quantity ? String(plan.quantity) : null,
        unitPriceBrl: quoted && plan.quantity && plan.unitPrice ? String(plan.unitPrice) : null,
        amountBrl: String(plan.amount),
        note: note.trim() || null,
      };
      const result = edit
        ? await updateTransactionAction({ monthId: month.id, transactionId: edit.id, transaction })
        : await addTransactionAction({ monthId: month.id, transaction });

      if (result.ok) {
        onSaved(result);
      } else {
        setError(result.message);
      }
    });

  const canSave = !plan.issue && plan.amount !== null && plan.amount > 0 && Boolean(day) && !isSaving;
  const showIssue = plan.issue !== null && (order.length > 0 || texts.total.trim() !== "");

  return (
    <>
      <header className="flex items-start gap-4 border-b border-border/70 px-5 pt-5 pb-4 sm:px-6">
        <div className="min-w-0">
          <Dialog.Title className="truncate text-base font-semibold tracking-[-0.02em]">
            {edit ? `Corrigir ${TRANSACTION_LABELS[edit.kind].toLocaleLowerCase("pt-BR")}` : `Movimentar ${target.assetName}`}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs leading-5 text-muted-foreground">
            {edit ? `${target.assetName} · ` : ""}
            {month.label}
            {quoted && target.unitPriceBrl ? ` · cotação do mês ${formatPriceBrl(target.unitPriceBrl)}` : ""}
          </Dialog.Description>
        </div>
        <Dialog.Close
          aria-label="Fechar"
          className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <XIcon aria-hidden="true" size={14} weight="bold" />
        </Dialog.Close>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
        {opening ? null : (
          <Segmented
            label="Tipo de movimentação"
            value={plan.kind === "OPENING" ? kind : plan.kind}
            options={TRANSACTION_KINDS.filter((option) => !(target.cdi && option === "INCOME" && edit?.kind !== "INCOME")).map(
              (option) => ({ value: option, label: TRANSACTION_LABELS[option] }),
            )}
            onChange={(value) => setKind(value as TransactionKind)}
          />
        )}
        {target.cdi ? (
          <p className="-mt-2 text-[11px] leading-5 text-muted-foreground">
            O rendimento pelo CDI é calculado automaticamente; o rendimento manual fica de fora para não somar duas vezes.
          </p>
        ) : null}

        <Segmented
          label="Como informar"
          value={mode}
          options={[
            { value: "operation", label: "Valor desta operação" },
            { value: "total", label: "Novo total da posição" },
          ]}
          onChange={(value) => setMode(value as MovementMode)}
          small
        />

        <Field label="Dia">
          <input
            type="date"
            aria-label="Dia da movimentação"
            value={day}
            min={month.firstDay}
            max={month.lastDay}
            onChange={(event) => setDay(event.target.value)}
            className={cn(inputClass, "font-mono")}
          />
        </Field>

        {mode === "total" ? (
          <div className="space-y-2">
            {quoted ? (
              <Segmented
                label="Novo total em"
                value={totalTarget}
                options={[
                  { value: "quantity", label: dollars ? "Dólares" : "Quantidade" },
                  { value: "marketValue", label: "Valor de mercado (R$)" },
                ]}
                onChange={(value) => setTotalTarget(value as TotalTarget)}
                small
              />
            ) : null}
            <Field
              label={
                !quoted
                  ? "Novo saldo (R$)"
                  : totalTarget === "marketValue"
                    ? "Novo valor de mercado (R$)"
                    : dollars
                      ? "Novo saldo (US$)"
                      : "Nova quantidade"
              }
            >
              <NumberInput
                label="Novo total da posição"
                value={texts.total}
                onChange={(text) => setTexts((current) => ({ ...current, total: text }))}
              />
            </Field>
          </div>
        ) : null}

        {quoted ? (
          <div className="grid grid-cols-2 gap-3">
            {mode === "operation" ? (
              <TrioInput
                label={dollars ? "Dólares (US$)" : plan.kind === "INCOME" ? "Quantidade recebida" : "Quantidade"}
                aria="Quantidade movimentada"
                value={shown("quantity")}
                badge={badge("quantity")}
                onChange={(text) => type("quantity", text)}
              />
            ) : (
              <ReadOnlyValue
                label={dollars ? "Dólares movimentados" : "Quantidade movimentada"}
                value={plan.quantity ? formatNumber(plan.quantity, 12) : "—"}
                badge="calculado"
              />
            )}
            {opening ? null : (
              <TrioInput
                label={dollars ? "Câmbio executado (R$)" : "Preço executado (R$)"}
                aria="Preço executado"
                value={shown("unitPrice")}
                badge={badge("unitPrice")}
                onChange={(text) => type("unitPrice", text)}
              />
            )}
            {mode === "operation" ? (
              <TrioInput
                label={
                  plan.kind === "WITHDRAWAL"
                    ? "Valor recebido (R$)"
                    : plan.kind === "INCOME"
                      ? "Valor do rendimento (R$)"
                      : opening
                        ? "Valor (R$)"
                        : "Valor pago (R$)"
                }
                aria="Valor da operação"
                value={shown("amount")}
                badge={badge("amount")}
                onChange={(text) => type("amount", text)}
              />
            ) : (
              <ReadOnlyValue label="Valor da operação" value={plan.amount ? formatBrl(plan.amount) : "—"} badge="calculado" />
            )}
          </div>
        ) : mode === "operation" ? (
          <Field
            label={
              plan.kind === "WITHDRAWAL"
                ? "Valor retirado (R$)"
                : plan.kind === "INCOME"
                  ? "Valor do rendimento (R$)"
                  : opening
                    ? "Saldo inicial (R$)"
                    : "Valor aportado (R$)"
            }
          >
            <NumberInput label="Valor da operação" value={texts.amount} onChange={(text) => type("amount", text)} />
          </Field>
        ) : null}

        {quoted && plan.kind === "INCOME" && mode === "operation" ? (
          <p className="text-[11px] leading-5 text-muted-foreground">
            Sem quantidade, o rendimento é dinheiro recebido, como dividendos: fica registrado sem criar unidades.
          </p>
        ) : null}

        <Field label="Observação (opcional)">
          <input
            value={note}
            maxLength={200}
            aria-label="Observação"
            onChange={(event) => setNote(event.target.value)}
            className={inputClass}
          />
        </Field>

        <section
          aria-label="Prévia"
          data-testid="transaction-preview"
          className="grid grid-cols-3 gap-2 rounded-xl border border-border p-3 text-center"
        >
          <PreviewCell title="Antes" lines={[quoted ? `${formatNumber(before.quantity, 8)} ${unit}` : null, formatBrl(marketBefore)]} />
          <PreviewCell
            title={TRANSACTION_LABELS[plan.kind]}
            tone={plan.kind === "WITHDRAWAL" ? "down" : "up"}
            lines={[
              quoted && plan.quantity
                ? `${sign}${formatNumber(plan.quantity, 8)} ${unit}`
                : plan.cashIncome
                  ? "sem unidades"
                  : null,
              plan.amount ? `${sign}${formatBrl(plan.amount)}` : "—",
            ]}
          />
          <PreviewCell
            title="Depois"
            lines={[quoted ? `${formatNumber(Math.max(plan.after, 0), 8)} ${unit}` : null, formatBrl(Math.max(marketAfter, 0))]}
            note={quoted ? "pela cotação do mês" : undefined}
          />
        </section>

        {showIssue ? (
          <p role="status" data-testid="transaction-issue" className="text-xs text-warning-foreground">
            {plan.issue}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-border/70 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
        <Dialog.Close className={secondaryButtonClass}>Cancelar</Dialog.Close>
        <button type="button" onClick={save} disabled={!canSave} className={primaryButtonClass}>
          {isSaving
            ? "Salvando…"
            : edit
              ? "Salvar correção"
              : `Registrar ${TRANSACTION_LABELS[plan.kind].toLocaleLowerCase("pt-BR")}`}
        </button>
      </footer>
    </>
  );
}

function Segmented({
  label,
  value,
  options,
  onChange,
  small = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  small?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid rounded-xl border border-border bg-background/40 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-lg px-1 font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
            small ? "h-8 text-[11px]" : "h-9 text-xs",
            value === option.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TrioInput({
  label,
  aria,
  value,
  badge,
  onChange,
}: {
  label: string;
  aria: string;
  value: string;
  badge: string | null;
  onChange: (text: string) => void;
}) {
  return (
    <LabeledValue label={label} badge={badge}>
      <NumberInput label={aria} value={value} onChange={onChange} computed={badge !== null} />
    </LabeledValue>
  );
}

function ReadOnlyValue({ label, value, badge }: { label: string; value: string; badge: string }) {
  return (
    <LabeledValue label={label} badge={badge}>
      <p
        aria-label={label}
        className="flex h-9 items-center justify-end rounded-lg border border-dashed border-border px-2.5 font-mono text-xs text-muted-foreground"
      >
        {value}
      </p>
    </LabeledValue>
  );
}

function LabeledValue({ label, badge, children }: { label: string; badge: string | null; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1 flex items-center justify-between gap-2 text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
        <span className="truncate">{label}</span>
        {badge ? (
          <span className="shrink-0 rounded-full bg-primary/10 px-1.5 text-[9px] tracking-normal text-primary normal-case">
            {badge}
          </span>
        ) : null}
      </span>
      {children}
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  computed = false,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  computed?: boolean;
}) {
  const invalid = value.trim() !== "" && parseLocaleNumber(value) === null;

  return (
    <input
      inputMode="decimal"
      aria-label={label}
      aria-invalid={invalid}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        inputClass,
        "text-right font-mono",
        computed && "border-dashed text-muted-foreground",
        invalid && "border-destructive",
      )}
    />
  );
}

function PreviewCell({
  title,
  lines,
  tone,
  note,
}: {
  title: string;
  lines: (string | null)[];
  tone?: "up" | "down";
  note?: string;
}) {
  return (
    <div className="min-w-0">
      <p
        className={cn(
          "text-[10px] font-semibold tracking-[0.08em] uppercase",
          tone === "down" ? "text-chart-down" : tone === "up" ? "text-chart-up" : "text-muted-foreground",
        )}
      >
        {title}
      </p>
      {lines
        .filter((line): line is string => line !== null)
        .map((line) => (
          <p key={line} className="mt-0.5 truncate font-mono text-[11px] text-foreground">
            {line}
          </p>
        ))}
      {note ? <p className="mt-0.5 text-[9px] text-muted-foreground">{note}</p> : null}
    </div>
  );
}

const FORMATS = new Map<number, Intl.NumberFormat>();

function formatNumber(value: number, digits: number) {
  let format = FORMATS.get(digits);

  if (!format) {
    format = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits, useGrouping: false });
    FORMATS.set(digits, format);
  }

  return format.format(value);
}

/**
 * Dias aceitos numa competência aberta: do primeiro dia do mês até o último,
 * ou até hoje no mês corrente.
 */
export function transactionMonthOf(id: string, referenceDate: Date, label?: string): TransactionMonth {
  const first = referenceDate.toISOString().slice(0, 10);
  const last = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return {
    id,
    label: label ?? formatMonthCompact(referenceDate),
    firstDay: first,
    lastDay: today < last ? (today < first ? first : today) : last,
  };
}
