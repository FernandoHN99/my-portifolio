"use client";

import { CheckIcon, ClockIcon } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";
import {
  DIRECTION_LABELS,
  DIRECTION_MEANINGS,
  STATUS_LABELS,
  type Direction,
  type EntryStatus,
} from "@/modules/family-expenses/domain/ledger";
import { formatCents, type Cents } from "@/lib/money";

// Peças de Gastos familiares: verde da marca para receber, tom de atenção
// para pagar. O sentido sempre vem escrito, sem depender apenas da cor.

export function DirectionBadge({ direction }: { direction: Direction }) {
  return (
    <span
      title={DIRECTION_MEANINGS[direction]}
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em] whitespace-nowrap uppercase",
        direction === "RECEIVABLE" ? "bg-primary/10 text-primary" : "bg-warning/50 text-warning-foreground",
      )}
    >
      {DIRECTION_LABELS[direction]}
      <span className="sr-only">: {DIRECTION_MEANINGS[direction]}</span>
    </span>
  );
}

export function StatusBadge({ status }: { status: EntryStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap",
        status === "PENDING"
          ? "border-warning-border/70 bg-warning/50 text-warning-foreground"
          : "border-transparent bg-white/[0.05] text-muted-foreground",
      )}
    >
      {status === "PENDING" ? (
        <ClockIcon aria-hidden="true" size={11} weight="bold" />
      ) : (
        <CheckIcon aria-hidden="true" size={11} weight="bold" />
      )}
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Saldo assinado com o sentido por extenso: "a receber" ou "a pagar". */
export function SignedAmount({
  cents,
  showMeaning = false,
  className,
}: {
  cents: Cents;
  showMeaning?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex flex-col items-end leading-tight", className)}>
      <span
        className={cn(
          "font-mono tabular-nums whitespace-nowrap",
          cents > 0 ? "text-primary" : cents < 0 ? "text-warning-foreground" : "text-muted-foreground",
        )}
      >
        {formatCents(cents, { signed: true })}
      </span>
      {showMeaning ? (
        <span className="mt-0.5 text-[10px] text-muted-foreground">{balanceMeaning(cents)}</span>
      ) : null}
    </span>
  );
}

export function balanceMeaning(cents: Cents) {
  return cents > 0 ? "a receber" : cents < 0 ? "a pagar" : "quitado";
}
