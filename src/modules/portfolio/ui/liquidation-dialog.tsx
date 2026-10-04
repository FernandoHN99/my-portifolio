"use client";

import { Dialog } from "@base-ui/react/dialog";
import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { useState, useTransition } from "react";

import { liquidatePositionAction, type EditActionResult } from "@/app/actions/edit-month";
import { cn } from "@/lib/utils";
import { formatBrl, parseLocaleNumber } from "@/modules/portfolio/presentation/portfolio-format";
import {
  backdropClass,
  Field,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/modules/portfolio/ui/edit-dialogs";
import type { TransactionMonth } from "@/modules/portfolio/ui/position-transaction-dialog";

// Liquidação de um título vencido (spec 059): o dinheiro vai para um caixa
// marcado como conta corrente, da mesma moeda, escolhido aqui. O título fica
// zerado no mês e não passa ao mês seguinte; a liquidação é uma transferência
// interna, não um aporte.

export type LiquidationTarget = {
  positionId: string;
  assetName: string;
  totalBrl: number;
  /** AAAA-MM-DD */
  maturityDate: string;
  currency: "BRL" | "USD";
};

export type CashAccountOption = { positionId: string; label: string; totalBrl: number; currency: "BRL" | "USD" };

/** Moeda de um caixa ou título sem cotação de mercado: o dólar ou o real. */
export function cashCurrencyOf(quoteSymbol: string | null): "BRL" | "USD" {
  return quoteSymbol === "USD" ? "USD" : "BRL";
}

const popupClass =
  "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[min(480px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0";

export function LiquidationDialog({
  open,
  onOpenChange,
  target,
  formKey,
  month,
  cashAccounts,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: LiquidationTarget | null;
  formKey: number;
  month: TransactionMonth;
  cashAccounts: CashAccountOption[];
  onSaved: (result: EditActionResult) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup className={popupClass} data-testid="liquidation-form">
          {target ? (
            <LiquidationForm
              key={formKey}
              target={target}
              month={month}
              // Sem conversão cambial implícita: só caixas da moeda do título.
              cashAccounts={cashAccounts.filter(
                (option) => option.positionId !== target.positionId && option.currency === target.currency,
              )}
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

function LiquidationForm({
  target,
  month,
  cashAccounts,
  onSaved,
}: {
  target: LiquidationTarget;
  month: TransactionMonth;
  cashAccounts: CashAccountOption[];
  onSaved: (result: EditActionResult) => void;
}) {
  // O dia sugerido é o do vencimento, quando cai na competência; senão, o
  // último dia aceito.
  const suggested =
    target.maturityDate >= month.firstDay && target.maturityDate <= month.lastDay ? target.maturityDate : month.lastDay;
  const [destination, setDestination] = useState(cashAccounts[0]?.positionId ?? "");
  const [day, setDay] = useState(suggested);
  const [amountText, setAmountText] = useState(AMOUNT.format(target.totalBrl));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const amount = parseLocaleNumber(amountText);
  const chosen = cashAccounts.find((option) => option.positionId === destination) ?? null;
  const difference = amount !== null ? amount - target.totalBrl : 0;

  const save = () =>
    startSaving(async () => {
      setError(null);
      const result = await liquidatePositionAction({
        monthId: month.id,
        liquidation: {
          positionId: target.positionId,
          destinationPositionId: destination,
          occurredOn: day,
          amountBrl: String(amount),
        },
      });

      if (result.ok) {
        onSaved(result);
      } else {
        setError(result.message);
      }
    });

  return (
    <>
      <header className="flex items-start gap-4 border-b border-border/70 px-5 pt-5 pb-4 sm:px-6">
        <div className="min-w-0">
          <Dialog.Title className="truncate text-base font-semibold tracking-[-0.02em]">
            Liquidar {target.assetName}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs leading-5 text-muted-foreground">
            Venceu · saldo de {formatBrl(target.totalBrl)}. Para onde vai o dinheiro?
          </Dialog.Description>
        </div>
        <Dialog.Close
          aria-label="Fechar"
          className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <XIcon aria-hidden="true" size={14} weight="bold" />
        </Dialog.Close>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
        {cashAccounts.length === 0 ? (
          <p role="alert" className="rounded-xl border border-warning-border bg-warning/20 px-3 py-2 text-xs text-foreground">
            Nenhum caixa {target.currency === "USD" ? "em dólar" : "em reais"} marcado como conta corrente neste mês.
            Marque um pelo lápis, na aba Ativo, ou inclua um Caixa {target.currency === "USD" ? "em dólar" : "em reais"}{" "}
            com a opção Conta corrente.
          </p>
        ) : (
          <fieldset>
            <legend className="mb-1 block text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
              Conta corrente de destino
            </legend>
            <div className="space-y-1.5" role="radiogroup" aria-label="Conta corrente de destino">
              {cashAccounts.map((option) => (
                <label
                  key={option.positionId}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-xs",
                    destination === option.positionId ? "border-primary/60 bg-primary/8" : "border-border",
                  )}
                >
                  <input
                    type="radio"
                    name="destination"
                    value={option.positionId}
                    checked={destination === option.positionId}
                    onChange={() => setDestination(option.positionId)}
                    className="size-4 accent-primary"
                  />
                  <span className="min-w-0 flex-1 truncate text-foreground">{option.label}</span>
                  <span className="font-mono text-muted-foreground">{formatBrl(option.totalBrl)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Dia">
            <input
              type="date"
              aria-label="Dia da liquidação"
              value={day}
              min={month.firstDay}
              max={month.lastDay}
              onChange={(event) => setDay(event.target.value)}
              className={cn(inputClass, "font-mono")}
            />
          </Field>
          <Field label="Valor recebido (R$)">
            <input
              inputMode="decimal"
              aria-label="Valor recebido"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              className={cn(inputClass, "text-right font-mono")}
            />
          </Field>
        </div>

        <p data-testid="liquidation-summary" className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground">
          {amount === null || amount <= 0
            ? "Informe o valor recebido."
            : `${target.assetName} fica zerado${chosen ? `; ${chosen.label} passa a ${formatBrl(chosen.totalBrl + amount)}` : ""}.${
                difference > 0.004 ? ` A diferença de ${formatBrl(difference)} entra como rendimento do título.` : ""
              }`}
        </p>

        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-border/70 px-5 py-4 sm:px-6">
        <Dialog.Close className={secondaryButtonClass}>Cancelar</Dialog.Close>
        <button
          type="button"
          onClick={save}
          disabled={!destination || amount === null || amount <= 0 || !day || isSaving}
          className={primaryButtonClass}
        >
          {isSaving ? "Liquidando…" : "Liquidar"}
        </button>
      </footer>
    </>
  );
}

const AMOUNT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2, useGrouping: false });
