"use client";

import { Dialog } from "@base-ui/react/dialog";
import { PencilSimpleIcon, PlusIcon, TrashIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { useState, type ReactNode } from "react";

import { Picker, type PickerOption } from "@/components/ui/picker";
import { cn } from "@/lib/utils";
import type { EditingCatalog } from "@/modules/portfolio/application/get-editing-catalog";
import type { MonthPosition, MonthQuote } from "@/modules/portfolio/application/get-month-positions";
import { categoryColor } from "@/modules/portfolio/presentation/category-colors";
import { formatBrl, parseLocaleNumber } from "@/modules/portfolio/presentation/portfolio-format";

const backdropClass =
  "fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0";
const centeredPopupClass =
  "fixed top-1/2 left-1/2 z-50 w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-2xl outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0";
const sidePopupClass =
  "fixed inset-y-0 right-0 z-50 flex w-[min(480px,100vw)] flex-col border-l border-border bg-card shadow-2xl outline-none transition-transform duration-250 ease-[cubic-bezier(0.23,1,0.32,1)] data-ending-style:translate-x-full data-starting-style:translate-x-full";
const inputClass =
  "h-9 w-full rounded-lg border border-border bg-background/60 px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/50";
const primaryButtonClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground outline-none transition-[background-color,transform] duration-150 hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";
const secondaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border px-3.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50";

export function HistoryUnlockDialog({
  monthLabel,
  onConfirm,
}: {
  monthLabel: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="inline-flex h-9 items-center gap-2 rounded-xl border border-warning-border bg-warning/40 px-3.5 text-xs font-semibold text-warning-foreground outline-none transition-colors hover:bg-warning/60 focus-visible:ring-2 focus-visible:ring-ring/50">
        <PencilSimpleIcon aria-hidden="true" size={14} weight="bold" />
        Editar posições
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup className={centeredPopupClass}>
          <Dialog.Title className="text-base font-semibold tracking-[-0.02em]">
            Editar {monthLabel}?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
            Você está editando {monthLabel}. Isso altera o histórico da carteira e todas as análises
            daquela competência.
          </Dialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className={secondaryButtonClass}>Cancelar</Dialog.Close>
            <Dialog.Close className={primaryButtonClass} onClick={onConfirm}>
              Editar mesmo assim
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

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

export type NewPositionDraft = {
  accountId: string;
  assetId: string;
  value: string;
  strategy: string | null;
};

export function AddPositionDialog({
  catalog,
  quotes,
  occupied,
  onAdd,
}: {
  catalog: EditingCatalog;
  quotes: MonthQuote[];
  occupied: Set<string>;
  onAdd: (draft: NewPositionDraft) => void;
}) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [value, setValue] = useState("");
  const [strategy, setStrategy] = useState("");

  const accountOptions: PickerOption[] = catalog.accounts.map((account) => ({ value: account.id, label: account.label }));
  const assetOptions: PickerOption[] = catalog.assets.map((entry) => ({
    value: entry.id,
    label: entry.name,
    hint: entry.ticker ?? undefined,
  }));
  const strategyOptions: PickerOption[] = [
    { value: "", label: "Sem estratégia" },
    ...catalog.strategies.map((entry) => ({ value: entry, label: entry })),
  ];
  const asset = catalog.assets.find((entry) => entry.id === assetId);
  const quote = asset?.quoteSymbol ? quotes.find((entry) => entry.symbol === asset.quoteSymbol) : undefined;
  const missingQuote = Boolean(asset?.quoteSymbol) && !quote?.valueBrl;
  const duplicate = Boolean(accountId && assetId) && occupied.has(`${accountId}:${assetId}`);
  const parsedValue = parseLocaleNumber(value);
  const validValue = parsedValue !== null;
  const canAdd = Boolean(accountId && assetId) && validValue && !missingQuote && !duplicate;

  const reset = () => {
    setAccountId("");
    setAssetId("");
    setValue("");
    setStrategy("");
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
        }
      }}
    >
      <Dialog.Trigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card/60 px-2.5 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
        <PlusIcon aria-hidden="true" size={12} weight="bold" />
        Adicionar posição
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup className={centeredPopupClass}>
          <Dialog.Title className="text-base font-semibold tracking-[-0.02em]">Adicionar posição</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-muted-foreground">
            O rateio é copiado da posição mais recente do mesmo ativo, quando existir.
          </Dialog.Description>

          <div className="mt-5 space-y-3">
            <Field label="Conta">
              <Picker
                aria-label="Conta"
                options={accountOptions}
                value={accountId || null}
                onValueChange={setAccountId}
                placeholder="Selecione a conta"
                emptyMessage="Nenhuma conta encontrada"
              />
            </Field>
            <Field label="Ativo">
              <Picker
                aria-label="Ativo"
                options={assetOptions}
                value={assetId || null}
                onValueChange={setAssetId}
                placeholder="Selecione o ativo"
                emptyMessage="Nenhum ativo encontrado"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={asset?.quoteSymbol ? "Quantidade" : "Saldo (R$)"}>
                <input
                  inputMode="decimal"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  className={cn(inputClass, "text-right font-mono")}
                />
              </Field>
              <Field label="Estratégia">
                <Picker aria-label="Estratégia" options={strategyOptions} value={strategy} onValueChange={setStrategy} />
              </Field>
            </div>

            {missingQuote ? (
              <p className="text-xs text-warning-foreground">
                Não há cotação de {asset?.quoteSymbol} nesta competência. Informe-a no painel de cotações antes.
              </p>
            ) : null}
            {duplicate ? (
              <p className="text-xs text-warning-foreground">Este ativo já tem posição nesta conta.</p>
            ) : null}
            {asset?.quoteSymbol && quote?.valueBrl && validValue ? (
              <p className="font-mono text-xs text-muted-foreground">
                {formatBrl((parsedValue ?? 0) * quote.valueBrl)} a {formatBrl(quote.valueBrl)}
              </p>
            ) : null}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className={secondaryButtonClass}>Cancelar</Dialog.Close>
            <button
              type="button"
              disabled={!canAdd}
              onClick={() => {
                onAdd({ accountId, assetId, value: value.trim(), strategy: strategy || null });
                setOpen(false);
                reset();
              }}
              className={primaryButtonClass}
            >
              Adicionar
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Classificação do rateio: escolhe entre os valores já usados e, como a lista
 * de sugestões anterior, aceita um valor novo digitado, confirmado em "Usar".
 */
function AllocationPicker({
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

function Field({ label, children }: { label: string; children: ReactNode }) {
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
