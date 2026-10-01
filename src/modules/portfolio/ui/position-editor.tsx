"use client";

import {
  ArrowLeftIcon,
  CheckCircleIcon,
  FloppyDiskIcon,
  TrendUpIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import {
  updateDraftPositionsAction,
  type DraftPositionActionState,
} from "@/app/actions/update-draft-positions";
import type {
  EditablePortfolioMonth,
  EditablePortfolioPosition,
} from "@/modules/portfolio/application/get-editable-portfolio-month";
import {
  formatBrl,
  formatMonth,
} from "@/modules/portfolio/presentation/portfolio-format";

const INITIAL_ACTION_STATE: DraftPositionActionState = {
  status: "idle",
  message: null,
};

export function PositionEditor({
  month,
  saved = false,
}: {
  month: EditablePortfolioMonth;
  saved?: boolean;
}) {
  const initialValues = useMemo(() => buildInitialValues(month.positions), [month.positions]);
  const [values, setValues] = useState(initialValues);
  const baseline = initialValues;
  const initialActionState: DraftPositionActionState = saved
    ? { status: "success", message: "Posições salvas e patrimônio recalculado." }
    : INITIAL_ACTION_STATE;
  const [actionState, formAction, pending] = useActionState(
    updateDraftPositionsAction,
    initialActionState,
  );
  const groups = useMemo(() => groupPositions(month.positions), [month.positions]);
  const preview = useMemo(
    () => calculatePreview(month.positions, values),
    [month.positions, values],
  );
  const dirtyCount = Object.keys(values).filter(
    (positionId) => normalizeComparable(values[positionId]) !== normalizeComparable(baseline[positionId]),
  ).length;

  const updates = month.positions.map((position) => ({
    positionId: position.id,
    kind: position.quoteSymbol ? ("QUANTITY" as const) : ("BALANCE" as const),
    value: values[position.id] ?? "",
  }));

  return (
    <form action={formAction} className="relative mx-auto w-full max-w-[1320px] px-5 pt-8 pb-32 sm:px-7 sm:pt-10 xl:px-12 xl:pt-12">
      <input type="hidden" name="monthId" value={month.id} />
      <input type="hidden" name="updates" value={JSON.stringify(updates)} />
      <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[440px] w-[440px]" />

      <Link
        href="/"
        className="group inline-flex items-center gap-2 rounded-lg text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <ArrowLeftIcon
          aria-hidden="true"
          className="transition-transform duration-150 group-hover:-translate-x-0.5"
          size={14}
        />
        Voltar para visão geral
      </Link>

      <header className="mt-7 grid gap-7 border-b border-border/70 pb-9 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-warning/10 px-2.5 py-1 text-[10px] font-semibold tracking-[0.1em] text-warning-foreground uppercase">
              Rascunho
            </span>
            <span className="text-xs text-muted-foreground">{formatMonth(month.referenceDate)}</span>
          </div>
          <h1 className="mt-4 max-w-3xl text-[clamp(2rem,5vw,4rem)] leading-[0.98] font-semibold tracking-[-0.058em]">
            Ajuste o que mudou no mês.
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
            Edite quantidades para ativos cotados e saldos para posições manuais. Os preços permanecem protegidos.
          </p>
        </div>

        <div className="grid min-w-56 gap-1 rounded-2xl border border-border bg-card/75 px-5 py-4 lg:text-right">
          <span className="text-[10px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">Patrimônio recalculado</span>
          <span className="font-mono text-2xl font-medium tracking-[-0.045em]">
            {preview.hasInvalidValue ? "—" : formatBrl(preview.totalBrl)}
          </span>
          <span className="text-[10px] text-muted-foreground">
            Antes: {formatBrl(month.totalBrl)}
          </span>
        </div>
      </header>

      <div className="mt-7 space-y-5">
        {groups.map((group) => (
          <section key={group.key} className="premium-panel overflow-hidden rounded-[24px]" aria-labelledby={`group-${group.key}`}>
            <div className="flex items-center justify-between gap-4 border-b border-border/70 px-5 py-4 sm:px-6">
              <div>
                <h2 id={`group-${group.key}`} className="text-sm font-semibold tracking-[-0.015em]">
                  {group.institutionName}
                </h2>
                <p className="mt-1 text-[10px] text-muted-foreground">Conta {group.accountName}</p>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">
                {group.positions.length} {group.positions.length === 1 ? "posição" : "posições"}
              </span>
            </div>

            <div className="divide-y divide-border/60">
              {group.positions.map((position) => (
                <PositionRow
                  key={position.id}
                  position={position}
                  value={values[position.id] ?? ""}
                  onChange={(value) =>
                    setValues((current) => ({ ...current, [position.id]: value }))
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="fixed bottom-4 left-1/2 z-30 w-[calc(100%-2.5rem)] max-w-[1224px] -translate-x-1/2 rounded-2xl border border-border bg-[oklch(0.135_0.012_165/0.96)] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl sm:flex sm:items-center sm:justify-between sm:gap-5 sm:p-4 lg:ml-[124px] lg:w-[calc(100%-344px)]">
        <div className="flex min-h-10 items-center gap-3 px-1">
          {actionState.status === "error" ? (
            <WarningCircleIcon aria-hidden="true" className="shrink-0 text-destructive" size={18} weight="fill" />
          ) : actionState.status === "success" ? (
            <CheckCircleIcon aria-hidden="true" className="shrink-0 text-primary" size={18} weight="fill" />
          ) : (
            <TrendUpIcon aria-hidden="true" className="shrink-0 text-primary" size={18} weight="duotone" />
          )}
          <div aria-live="polite">
            <p className="text-xs font-medium">
              {dirtyCount > 0
                ? `${dirtyCount} ${dirtyCount === 1 ? "alteração pronta" : "alterações prontas"}`
                : (actionState.message ?? "Nenhuma alteração pendente")}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              O salvamento atualiza todas as posições em uma única transação.
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={pending || dirtyCount === 0 || preview.hasInvalidValue}
          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold whitespace-nowrap text-primary-foreground shadow-[0_10px_30px_rgba(84,224,161,0.12)] outline-none transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 sm:mt-0 sm:w-auto"
        >
          <FloppyDiskIcon aria-hidden="true" size={16} weight="bold" />
          {pending ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}

function PositionRow({
  position,
  value,
  onChange,
}: {
  position: EditablePortfolioPosition;
  value: string;
  onChange: (value: string) => void;
}) {
  const parsedValue = parseLocalNumber(value);
  const isQuoted = Boolean(position.quoteSymbol);
  const estimatedTotal =
    parsedValue === null
      ? null
      : isQuoted
        ? parsedValue * (position.unitPriceBrl ?? 0)
        : parsedValue;
  const fieldId = `position-${position.id}`;

  return (
    <div className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(230px,1fr)_150px_minmax(190px,0.7fr)_160px] lg:items-end">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground/95">{position.assetName}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span className="font-mono">{position.ticker ?? "SALDO"}</span>
          <span aria-hidden="true" className="size-0.5 rounded-full bg-muted-foreground/50" />
          <span>{position.baseCurrency}</span>
          <span aria-hidden="true" className="size-0.5 rounded-full bg-muted-foreground/50" />
          <span>{isQuoted ? "Preço automático" : "Entrada manual"}</span>
        </div>
      </div>

      <div>
        <p className="text-[9px] font-semibold tracking-[0.11em] text-muted-foreground uppercase">
          {isQuoted ? "Preço em BRL" : "Tipo"}
        </p>
        <p className="mt-2 font-mono text-xs text-foreground/80">
          {isQuoted && position.unitPriceBrl !== null ? formatBrl(position.unitPriceBrl) : "Saldo direto"}
        </p>
      </div>

      <div className="grid gap-2">
        <label htmlFor={fieldId} className="text-[9px] font-semibold tracking-[0.11em] text-muted-foreground uppercase">
          {isQuoted ? "Quantidade" : "Saldo atual em BRL"}
        </label>
        <input
          id={fieldId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={parsedValue === null || parsedValue < 0}
          className="h-11 w-full rounded-xl border border-input bg-background/55 px-3.5 font-mono text-sm text-foreground outline-none transition-[border-color,box-shadow,background-color] duration-150 ease-out placeholder:text-muted-foreground/50 hover:bg-background/75 focus:border-primary/55 focus:ring-3 focus:ring-primary/12 aria-invalid:border-destructive/70 aria-invalid:ring-3 aria-invalid:ring-destructive/10"
        />
      </div>

      <div className="lg:text-right">
        <p className="text-[9px] font-semibold tracking-[0.11em] text-muted-foreground uppercase">Novo total</p>
        <p className="mt-2 font-mono text-sm font-medium">
          {estimatedTotal === null ? "Valor inválido" : formatBrl(estimatedTotal)}
        </p>
      </div>
    </div>
  );
}

function buildInitialValues(positions: EditablePortfolioPosition[]) {
  return Object.fromEntries(
    positions.map((position) => [
      position.id,
      toEditableValue(position.quoteSymbol ? position.quantity : String(position.totalBrl)),
    ]),
  );
}

function groupPositions(positions: EditablePortfolioPosition[]) {
  const groups = new Map<
    string,
    {
      key: string;
      institutionName: string;
      accountName: string;
      positions: EditablePortfolioPosition[];
    }
  >();

  for (const position of positions) {
    const key = `${position.institutionName}-${position.accountName}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .toLowerCase();
    const group = groups.get(key) ?? {
      key,
      institutionName: position.institutionName,
      accountName: position.accountName,
      positions: [],
    };
    group.positions.push(position);
    groups.set(key, group);
  }

  return [...groups.values()];
}

function calculatePreview(
  positions: EditablePortfolioPosition[],
  values: Record<string, string>,
) {
  let totalBrl = 0;
  let hasInvalidValue = false;

  for (const position of positions) {
    const value = parseLocalNumber(values[position.id] ?? "");
    if (value === null || value < 0) {
      hasInvalidValue = true;
      continue;
    }

    totalBrl += position.quoteSymbol ? value * (position.unitPriceBrl ?? 0) : value;
  }

  return { totalBrl, hasInvalidValue };
}

function parseLocalNumber(value: string) {
  const trimmed = value.trim().replace(/\s/g, "");
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeComparable(value: string | undefined) {
  const parsed = parseLocalNumber(value ?? "");
  return parsed === null ? value : String(parsed);
}

function toEditableValue(value: string) {
  const trimmed = value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  return trimmed.replace(".", ",");
}
