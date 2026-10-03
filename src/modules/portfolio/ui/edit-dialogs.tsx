"use client";

import { Dialog } from "@base-ui/react/dialog";
import { PlusIcon, TrashIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { useState, type ReactNode } from "react";

import { Picker } from "@/components/ui/picker";
import { cn } from "@/lib/utils";
import type { EditingCatalog } from "@/modules/portfolio/application/get-editing-catalog";
import type { MonthPosition } from "@/modules/portfolio/application/get-month-positions";
import { categoryColor } from "@/modules/portfolio/presentation/category-colors";
import { formatBrl, parseLocaleNumber } from "@/modules/portfolio/presentation/portfolio-format";

export const backdropClass =
  "fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0";
export const centeredPopupClass =
  "fixed top-1/2 left-1/2 z-50 w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-2xl outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0";
const sidePopupClass =
  "fixed inset-y-0 right-0 z-50 flex w-[min(480px,100vw)] flex-col border-l border-border bg-card shadow-2xl outline-none transition-transform duration-250 ease-[cubic-bezier(0.23,1,0.32,1)] data-ending-style:translate-x-full data-starting-style:translate-x-full";
export const inputClass =
  "h-9 w-full rounded-lg border border-border bg-background/60 px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/50";
export const primaryButtonClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground outline-none transition-[background-color,transform] duration-150 hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";
export const secondaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border px-3.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50";

/** Botão principal do cabeçalho, como "Adicionar posição" e o clone do mês. */
export const headerPrimaryButtonClass =
  "inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground outline-none transition-[background-color,transform] duration-150 hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.98] disabled:opacity-40";

type AllocationDraft = { key: number; assetClass: string; subclass: string; duration: string; weight: string };

export function AllocationDrawer({
  position,
  catalog,
  open,
  saving,
  onOpenChange,
  onSave,
}: {
  position: MonthPosition | null;
  catalog: EditingCatalog;
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (allocations: { assetClass: string; subclass: string; duration: string; weightPercent: string }[]) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup className={sidePopupClass}>
          {position ? (
            <AllocationEditor
              key={position.id}
              position={position}
              catalog={catalog}
              saving={saving}
              onSave={onSave}
            />
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AllocationEditor({
  position,
  catalog,
  saving,
  onSave,
}: {
  position: MonthPosition;
  catalog: EditingCatalog;
  saving: boolean;
  onSave: (allocations: { assetClass: string; subclass: string; duration: string; weightPercent: string }[]) => void;
}) {
  const [rows, setRows] = useState<AllocationDraft[]>(() =>
    position.allocations.length > 0
      ? position.allocations.map((allocation, index) => ({
          key: index,
          assetClass: allocation.assetClass,
          subclass: allocation.subclass,
          duration: allocation.duration,
          weight: formatWeight(allocation.weight),
        }))
      : [{ key: 0, assetClass: "", subclass: "", duration: "-", weight: "100" }],
  );
  const [nextKey, setNextKey] = useState(rows.length);

  const sum = rows.reduce((total, row) => total + (parseWeight(row.weight) ?? 0), 0);
  const complete = rows.every(
    (row) => row.assetClass.trim() && row.subclass.trim() && row.duration.trim() && (parseWeight(row.weight) ?? 0) > 0,
  );
  const balanced = Math.abs(sum - 100) <= 0.01;

  const update = (key: number, field: keyof Omit<AllocationDraft, "key">, value: string) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, [field]: value } : row)));

  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-border/70 p-6">
        <div>
          <Dialog.Title className="text-base font-semibold tracking-[-0.02em]">Rateio da posição</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-muted-foreground">
            {position.assetName} · {position.institutionName} · {formatBrl(position.totalBrl)}
          </Dialog.Description>
        </div>
        <Dialog.Close
          aria-label="Fechar"
          className="grid size-8 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <XIcon aria-hidden="true" size={14} weight="bold" />
        </Dialog.Close>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-6">
        {rows.map((row, index) => (
          <div key={row.key} className="rounded-xl border border-border/70 bg-background/30 p-3">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ backgroundColor: categoryColor(row.assetClass) }} />
              <span className="text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
                Classificação {index + 1}
              </span>
              {rows.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Remover classificação ${index + 1}`}
                  onClick={() => setRows((current) => current.filter((entry) => entry.key !== row.key))}
                  className="ml-auto grid size-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <TrashIcon aria-hidden="true" size={13} />
                </button>
              ) : null}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Field label="Classe">
                <AllocationPicker
                  label={`Classe da classificação ${index + 1}`}
                  values={catalog.allocation.classes}
                  value={row.assetClass}
                  onChange={(value) => update(row.key, "assetClass", value)}
                />
              </Field>
              <Field label="Subclasse">
                <AllocationPicker
                  label={`Subclasse da classificação ${index + 1}`}
                  values={catalog.allocation.subclasses}
                  value={row.subclass}
                  onChange={(value) => update(row.key, "subclass", value)}
                />
              </Field>
              <Field label="Duração">
                <AllocationPicker
                  label={`Duração da classificação ${index + 1}`}
                  values={catalog.allocation.durations}
                  value={row.duration}
                  onChange={(value) => update(row.key, "duration", value)}
                />
              </Field>
              <Field label="Peso (%)">
                <input
                  inputMode="decimal"
                  value={row.weight}
                  onChange={(event) => update(row.key, "weight", event.target.value)}
                  className={cn(inputClass, "text-right font-mono")}
                />
              </Field>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => {
            setRows((current) => [
              ...current,
              { key: nextKey, assetClass: "", subclass: "", duration: "-", weight: formatWeight(Math.max(100 - sum, 0)) },
            ]);
            setNextKey((value) => value + 1);
          }}
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <PlusIcon aria-hidden="true" size={13} weight="bold" />
          Adicionar classificação
        </button>
      </div>

      <div className="border-t border-border/70 p-6">
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
          <div
            className={cn("h-full rounded-full transition-[width] duration-200", balanced ? "bg-primary" : "bg-warning-foreground")}
            style={{ width: `${Math.min(sum, 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <p
            className={cn("text-xs font-medium", balanced ? "text-primary" : "text-warning-foreground")}
            aria-live="polite"
          >
            Soma: {formatWeight(sum)}%{" "}
            {balanced ? "✓" : sum < 100 ? `· faltam ${formatWeight(100 - sum)}%` : `· sobram ${formatWeight(sum - 100)}%`}
          </p>
          <div className="flex gap-2">
            <Dialog.Close className={secondaryButtonClass}>Cancelar</Dialog.Close>
            <button
              type="button"
              disabled={!balanced || !complete || saving}
              onClick={() =>
                onSave(
                  rows.map((row) => ({
                    assetClass: row.assetClass,
                    subclass: row.subclass,
                    duration: row.duration,
                    weightPercent: row.weight.replace(",", "."),
                  })),
                )
              }
              className={primaryButtonClass}
            >
              {saving ? "Salvando…" : "Salvar rateio"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Classificação do rateio: escolhe entre os valores já usados e, como a lista
 * de sugestões anterior, aceita um valor novo digitado, confirmado em "Usar".
 */
export function AllocationPicker({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const options = (value && !values.includes(value) ? [...values, value] : values).map((entry) => ({
    value: entry,
    label: entry,
  }));

  return (
    <Picker
      aria-label={label}
      options={options}
      value={value || null}
      onValueChange={onChange}
      onCreate={(text) => onChange(text)}
      createLabel={(text) => `Usar “${text}”`}
      emptyMessage="Digite para usar um valor novo"
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

function parseWeight(value: string) {
  return parseLocaleNumber(value);
}

function formatWeight(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 4, useGrouping: false });
}
