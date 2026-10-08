"use client";

import type { ReactNode } from "react";

import { headerButton } from "@/components/product/page-controls";
import { Picker } from "@/components/ui/picker";
import { LIQUIDITY_SUGGESTIONS } from "@/modules/portfolio/domain/liquidity";
import { isRedemption, redemptionLabel, REDEMPTION_VALUES } from "@/modules/portfolio/domain/redemption";

// Classes e campos comuns dos diálogos de edição: o formulário da posição
// (spec 043), a remoção, a abertura do mês e o backup.

export const backdropClass =
  "fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0";
export const centeredPopupClass =
  "fixed top-1/2 left-1/2 z-50 w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-2xl outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0";
export const inputClass =
  "h-9 w-full rounded-lg border border-border bg-background/60 px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/50";
export const primaryButtonClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground outline-none transition-[background-color,transform] duration-150 hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";
export const secondaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border px-3.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50";

/** Botão principal do cabeçalho, como "Adicionar posição" e o clone do mês. */
export const headerPrimaryButtonClass = headerButton({ variant: "primary" });

/**
 * Classificação do rateio (spec 068): só as opções da lista fixa, dependentes
 * da classe. Um valor antigo da posição, fora da lista, aparece marcado até
 * ser trocado.
 */
export function AllocationPicker({
  label,
  values,
  value,
  onChange,
  placeholder = "Escolha",
  disabled = false,
}: {
  label: string;
  values: readonly string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const options = [
    ...values.map((entry) => ({ value: entry, label: entry })),
    ...(value && !values.includes(value) ? [{ value, label: value, hint: "fora da lista" }] : []),
  ];

  return (
    <Picker
      aria-label={label}
      options={options}
      value={value || null}
      onValueChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      emptyMessage="Nenhuma opção com esse nome"
    />
  );
}

/**
 * Prazo de resgate da classificação (specs 035 e 068): os prazos que valem
 * para a classe escolhida. Um prazo antigo da posição, como D+0, aparece como
 * opção até ser trocado.
 */
export function RedemptionPicker({
  label,
  values = REDEMPTION_VALUES,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  values?: readonly string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const options = [
    ...values.map((entry) => ({ value: entry, label: redemptionLabel(entry) })),
    ...(value && !values.includes(value) ? [{ value, label: redemptionLabel(value), hint: isRedemption(value) ? "fora da lista" : "da planilha" }] : []),
  ];

  return (
    <Picker
      aria-label={label}
      options={options}
      value={value || null}
      onValueChange={onChange}
      placeholder={disabled ? "Escolha a classe" : "Escolha"}
      disabled={disabled}
    />
  );
}

const NO_LIQUIDITY_VALUE = "__sem_liquidez__";

/**
 * Prazo de liquidez do ativo (spec 039): sugestões comuns, como D+0 e D+1, ou
 * outro valor digitado, confirmado em "Usar". "Não informar" deixa em branco.
 */
export function LiquidityPicker({
  label = "Liquidez",
  value,
  onChange,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = [
    { value: NO_LIQUIDITY_VALUE, label: "Não informar" },
    ...(value && !LIQUIDITY_SUGGESTIONS.includes(value) ? [value] : []).map((entry) => ({ value: entry, label: entry })),
    ...LIQUIDITY_SUGGESTIONS.map((entry) => ({ value: entry, label: entry })),
  ];

  return (
    <Picker
      aria-label={label}
      options={options}
      value={value || null}
      placeholder="Opcional"
      onValueChange={(next) => onChange(next === NO_LIQUIDITY_VALUE ? "" : next)}
      onCreate={(text) => onChange(text)}
      createLabel={(text) => `Usar “${text}”`}
      emptyMessage="Digite para usar outro prazo"
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] tracking-[0.08em] text-muted-foreground uppercase">{label}</span>
      {children}
    </label>
  );
}
