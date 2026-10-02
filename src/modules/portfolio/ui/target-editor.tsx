"use client";

import { Slider } from "@base-ui/react/slider";
import {
  ArrowCounterClockwiseIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";

import { saveTargetPlanAction } from "@/app/actions/target-plan";
import { setPendingChanges } from "@/components/product/unsaved-changes";
import { cn } from "@/lib/utils";
import type { TargetEditorData, TargetEditorItem } from "@/modules/portfolio/application/get-target-editor";
import {
  buildAllocationGroups,
  countOffTarget,
  DEFAULT_REBALANCE_TOLERANCE,
  MAX_REBALANCE_TOLERANCE,
  type AllocationGroupKey,
  type AllocationRow,
  type TargetValue,
} from "@/modules/portfolio/domain/rebalance";
import { categoryColor } from "@/modules/portfolio/presentation/category-colors";
import {
  formatBrl,
  formatMonthCompact,
  formatSharePercent,
  parseLocaleNumber,
} from "@/modules/portfolio/presentation/portfolio-format";
import { TARGET_SCOPES, targetGroupKey } from "@/modules/portfolio/presentation/target-groups";
import { EditToast, type EditToastState } from "@/modules/portfolio/ui/edit-toast";

const SUM_EPSILON = 0.01;
// O deslizante anda de 1 em 1 ponto; o campo numérico continua aceitando valor quebrado.
const SLIDER_STEP = 1;
const EMPTY_ROWS: AllocationRow[] = [];

type Draft = Record<string, string>;

export function TargetEditor({ editor }: { editor: TargetEditorData }) {
  const [draft, setDraft] = useState<Draft>({});
  const [toleranceDraft, setToleranceDraft] = useState<string | null>(null);
  const [previewScope, setPreviewScope] = useState<AllocationGroupKey>("ASSET_CLASS");
  const [toast, setToast] = useState<EditToastState | null>(null);
  const [isSaving, startSaving] = useTransition();
  const sequence = useRef(0);
  const dismissToast = useCallback(() => setToast(null), []);

  const valueOf = (item: TargetEditorItem) => draftValue(item, draft);
  const textOf = (item: TargetEditorItem) => draft[item.key] ?? formatInput(item.percent);

  const changedKeys = editor.items
    .filter((item) => draft[item.key] !== undefined && Math.abs(valueOf(item) - item.percent) > 1e-9)
    .map((item) => item.key);
  const groupSums = new Map<string, number>();
  let hasInvalidValue = false;

  for (const item of editor.items) {
    const value = valueOf(item);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      hasInvalidValue = true;
    }
    const group = targetGroupKey(item.scope, item.primaryLabel);
    groupSums.set(group, (groupSums.get(group) ?? 0) + (Number.isFinite(value) ? value : 0));
  }

  const toleranceText = toleranceDraft ?? formatInput(editor.tolerance);
  const toleranceValue = draftTolerance(toleranceDraft, editor.tolerance);
  const toleranceInvalid = !isValidTolerance(toleranceValue);
  const toleranceChanged = toleranceDraft !== null && Math.abs(toleranceValue - editor.tolerance) > 1e-9;
  if (toleranceInvalid) {
    hasInvalidValue = true;
  }

  const pendingCount = changedKeys.length + (toleranceChanged ? 1 : 0);
  const invalidGroups = [...groupSums.values()].filter((sum) => Math.abs(sum - 100) > SUM_EPSILON).length;
  const canSave = pendingCount > 0 && invalidGroups === 0 && !hasInvalidValue && !isSaving;

  useEffect(() => {
    setPendingChanges(pendingCount);
    if (pendingCount === 0) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pendingCount]);

  useEffect(() => () => setPendingChanges(0), []);

  // A aba da prévia só muda pelo clique do usuário; editar uma meta não troca o recorte.
  const setValue = useCallback((item: TargetEditorItem, text: string) => {
    setDraft((current) => ({ ...current, [item.key]: text }));
  }, []);

  const restoreDefaults = () => {
    const next: Record<string, string> = {};
    for (const item of editor.items) {
      if (item.defaultPercent !== null) {
        next[item.key] = formatInput(item.defaultPercent);
      }
    }
    setDraft(next);
    setToleranceDraft(formatInput(DEFAULT_REBALANCE_TOLERANCE));
  };

  const discard = () => {
    setDraft({});
    setToleranceDraft(null);
  };

  const save = () =>
    startSaving(async () => {
      const result = await saveTargetPlanAction({
        targets: editor.items.map((item) => ({
          key: item.key,
          percent: draft[item.key] !== undefined ? draft[item.key].trim() : String(item.percent),
        })),
        tolerance: toleranceDraft !== null ? toleranceDraft.trim() : String(editor.tolerance),
      });
      setToast({ id: ++sequence.current, tone: result.ok ? "success" : "error", message: result.message });
      if (result.ok) {
        discard();
      }
    });

  // A prévia acompanha o rascunho com prioridade baixa: enquanto o deslizante é arrastado, o polegar e o
  // campo respondem primeiro e a tabela de comprar e vender é recalculada em seguida, sem travar o gesto.
  const deferredDraft = useDeferredValue(draft);
  const deferredToleranceDraft = useDeferredValue(toleranceDraft);
  const preview = editor.preview;
  const before = useMemo(
    () => (preview ? buildAllocationGroups(preview.aggregates, toTargets(editor.items, {}), editor.tolerance) : []),
    [preview, editor.items, editor.tolerance],
  );
  const after = useMemo(() => {
    if (!preview) {
      return [];
    }
    const tolerance = draftTolerance(deferredToleranceDraft, editor.tolerance);
    return buildAllocationGroups(
      preview.aggregates,
      toTargets(editor.items, deferredDraft),
      isValidTolerance(tolerance) ? tolerance : editor.tolerance,
    );
  }, [preview, editor.items, editor.tolerance, deferredDraft, deferredToleranceDraft]);
  const differsFromDefault =
    Math.abs(toleranceValue - DEFAULT_REBALANCE_TOLERANCE) > 1e-9 ||
    editor.items.some(
      (item) => item.defaultPercent !== null && Math.abs(valueOf(item) - item.defaultPercent) > 1e-9,
    );

  return (
    <div className="relative mx-auto w-full max-w-[1472px] px-5 py-8 pb-32 sm:px-7 sm:py-10 sm:pb-32 xl:px-12 xl:py-12 xl:pb-32">
      <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[460px] w-[460px]" />

      <header className="flex flex-col gap-6 border-b border-border/70 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">Configuração</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-[2.65rem]">Metas da carteira</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Mude um percentual e veja as ações de compra e venda mudarem na hora. Versão vigente:{" "}
            <span className="text-foreground">{editor.planName}</span>.
          </p>
        </div>
        <button
          type="button"
          disabled={!differsFromDefault}
          onClick={restoreDefaults}
          className="inline-flex h-9 w-fit items-center gap-2 rounded-xl border border-border px-3.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-40"
        >
          <ArrowCounterClockwiseIcon aria-hidden="true" size={14} weight="bold" />
          Restaurar padrão do Excel
        </button>
      </header>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.85fr)]">
        <div className="space-y-6">
          <ToleranceCard
            text={toleranceText}
            value={toleranceValue}
            invalid={toleranceInvalid}
            changed={toleranceChanged}
            onChange={setToleranceDraft}
          />

          {TARGET_SCOPES.map(({ scope, title, description }) => {
            const items = editor.items.filter((item) => item.scope === scope);

            if (items.length === 0) {
              return null;
            }

            return (
              <section key={scope} className="premium-panel rounded-[24px] p-5 sm:p-6" aria-label={title}>
                <h2 className="text-base font-semibold tracking-[-0.025em]">{title}</h2>
                <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>

                {scope === "CLASS_CURRENCY" ? (
                  <div className="mt-5 space-y-6">
                    {[...new Set(items.map((item) => item.primaryLabel))].map((className) => {
                      const classItems = items.filter((item) => item.primaryLabel === className);
                      return (
                        <TargetGroup
                          key={className}
                          heading={className}
                          headingColor={categoryColor(className)}
                          items={classItems}
                          sum={groupSums.get(targetGroupKey(scope, className)) ?? 0}
                          labelOf={(item) => item.secondaryLabel ?? item.primaryLabel}
                          valueOf={valueOf}
                          textOf={textOf}
                          onChange={setValue}
                          changedKeys={changedKeys}
                        />
                      );
                    })}
                  </div>
                ) : scope === "FIXED_INCOME" ? (
                  <FixedIncomeMatrix
                    items={items}
                    sum={groupSums.get(scope) ?? 0}
                    valueOf={valueOf}
                    textOf={textOf}
                    onChange={setValue}
                    changedKeys={changedKeys}
                  />
                ) : (
                  <div className="mt-5">
                    <TargetGroup
                      items={items}
                      sum={groupSums.get(scope) ?? 0}
                      labelOf={(item) => item.primaryLabel}
                      valueOf={valueOf}
                      textOf={textOf}
                      onChange={setValue}
                      changedKeys={changedKeys}
                    />
                  </div>
                )}
              </section>
            );
          })}

          <section className="premium-panel rounded-[24px] p-5 sm:p-6" aria-label="Versões das metas">
            <div className="flex items-center gap-2">
              <ClockCounterClockwiseIcon aria-hidden="true" className="text-primary" size={16} weight="duotone" />
              <h2 className="text-base font-semibold tracking-[-0.025em]">Versões</h2>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Cada salvamento cria uma versão. Só a vigente vale para as análises.
            </p>
            <ol className="mt-4 space-y-2">
              {editor.versions.map((version) => (
                <li key={version.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className={cn("size-1.5 rounded-full", version.isActive ? "bg-primary" : "bg-border")} />
                  <span className={version.isActive ? "text-foreground" : "text-muted-foreground"}>
                    {version.name}
                  </span>
                  {version.isImported ? (
                    <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-muted-foreground">
                      origem: Excel
                    </span>
                  ) : null}
                  {version.isActive ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      vigente
                    </span>
                  ) : null}
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {VERSION_DATE_FORMAT.format(version.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="xl:sticky xl:top-[148px] xl:self-start" aria-label="Prévia do rebalanceamento">
          <PreviewPanel
            scope={previewScope}
            onScopeChange={setPreviewScope}
            monthLabel={preview ? formatMonthCompact(preview.referenceDate) : null}
            beforeRows={before.find((group) => group.key === previewScope)?.rows ?? EMPTY_ROWS}
            afterRows={after.find((group) => group.key === previewScope)?.rows ?? EMPTY_ROWS}
            offTargetBefore={countOffTarget(before)}
            offTargetAfter={countOffTarget(after)}
            hasChanges={pendingCount > 0}
          />
        </aside>
      </div>

      {pendingCount > 0 ? (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] z-40 flex justify-center px-4">
          <div
            className={cn(
              "flex w-full max-w-xl items-center gap-3 rounded-2xl border bg-card/95 px-4 py-3 shadow-2xl backdrop-blur-xl",
              invalidGroups > 0 || hasInvalidValue ? "border-destructive/40" : "border-warning-border",
            )}
          >
            {invalidGroups > 0 || hasInvalidValue ? (
              <WarningCircleIcon aria-hidden="true" className="shrink-0 text-destructive" size={16} weight="fill" />
            ) : (
              <span className="size-2 shrink-0 rounded-full bg-warning-foreground" />
            )}
            <p className="text-xs text-foreground" aria-live="polite">
              {invalidGroups > 0
                ? `${invalidGroups} ${invalidGroups === 1 ? "grupo não soma" : "grupos não somam"} 100%`
                : hasInvalidValue
                  ? toleranceInvalid
                    ? `Use uma tolerância entre 0 e ${MAX_REBALANCE_TOLERANCE}`
                    : "Há percentuais inválidos"
                  : `${pendingCount} ${pendingCount === 1 ? "alteração" : "alterações"}`}
            </p>
            <button
              type="button"
              onClick={discard}
              disabled={isSaving}
              className="ml-auto h-8 rounded-lg px-3 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className="inline-flex h-8 items-center rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground outline-none transition-[background-color,transform] duration-150 hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.98] disabled:opacity-40"
            >
              {isSaving ? "Salvando…" : "Salvar metas"}
            </button>
          </div>
        </div>
      ) : null}

      <EditToast toast={toast} onDismiss={dismissToast} onUndo={() => undefined} undoing={false} />
    </div>
  );
}

type GroupProps = {
  items: TargetEditorItem[];
  sum: number;
  valueOf: (item: TargetEditorItem) => number;
  textOf: (item: TargetEditorItem) => string;
  onChange: (item: TargetEditorItem, text: string) => void;
  changedKeys: string[];
};

function TargetGroup({
  heading,
  headingColor,
  items,
  sum,
  labelOf,
  valueOf,
  textOf,
  onChange,
  changedKeys,
}: GroupProps & { heading?: string; headingColor?: string; labelOf: (item: TargetEditorItem) => string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        {heading ? (
          <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <span className="size-2 rounded-full" style={{ backgroundColor: headingColor }} />
            {heading}
          </span>
        ) : (
          <span />
        )}
        <SumBadge sum={sum} />
      </div>

      <StackedBar
        segments={items.map((item) => ({ key: item.key, label: labelOf(item), value: valueOf(item) }))}
      />

      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <TargetRow
            key={item.key}
            item={item}
            label={labelOf(item)}
            value={valueOf(item)}
            text={textOf(item)}
            changed={changedKeys.includes(item.key)}
            onChange={onChange}
          />
        ))}
      </div>
    </div>
  );
}

// Memorizada para que arrastar um deslizante redesenhe só a própria linha, e não as demais metas.
const TargetRow = memo(function TargetRow({
  item,
  label,
  value,
  text,
  changed,
  onChange,
}: {
  item: TargetEditorItem;
  label: string;
  value: number;
  text: string;
  changed: boolean;
  onChange: (item: TargetEditorItem, text: string) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_84px] items-center gap-3">
      <span className="flex min-w-0 items-center gap-2">
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(label) }} />
        <span className="truncate text-xs text-foreground/85" title={item.sourceCell ? `Origem: ${item.sourceCell}` : undefined}>
          {label}
        </span>
      </span>
      <StepSlider
        value={value}
        max={100}
        label={`Meta de ${label}`}
        valueText={(current) => `${formatInput(current)}%`}
        onChange={(next) => onChange(item, formatInput(next))}
      />
      <PercentInput item={item} text={text} changed={changed} label={label} onChange={onChange} />
    </div>
  );
});

/**
 * Deslizante de 1 em 1 ponto. Um valor quebrado digitado no campo, como 12,5, é exibido na posição exata e
 * só muda quando o usuário arrasta o deslizante ou usa as setas; nesse caso as setas vão para o inteiro
 * seguinte ou anterior, em vez de arredondar e depois somar um passo.
 */
function StepSlider({
  value,
  max,
  largeStep = 10,
  label,
  valueText,
  onChange,
}: {
  value: number;
  max: number;
  largeStep?: number;
  label: string;
  valueText: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const shown = Number.isFinite(value) ? Math.min(Math.max(value, 0), max) : 0;

  const stepFromFraction = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.shiftKey || Number.isInteger(shown)) {
      return;
    }
    const direction =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -1
          : 0;
    if (direction === 0) {
      return;
    }
    event.preventDefault();
    onChange(direction > 0 ? Math.ceil(shown) : Math.floor(shown));
  };

  return (
    <Slider.Root
      value={shown}
      min={0}
      max={max}
      step={SLIDER_STEP}
      largeStep={largeStep}
      thumbAlignment="edge"
      onValueChange={(next) => {
        if (typeof next === "number") {
          onChange(next);
        }
      }}
      className="w-full"
    >
      <Slider.Control className="flex h-8 w-full cursor-pointer touch-none items-center select-none">
        <Slider.Track className="relative h-1.5 w-full rounded-full bg-white/[0.08]">
          <Slider.Indicator className="rounded-full bg-primary" />
          <Slider.Thumb
            aria-label={label}
            getAriaValueText={(_formatted, current) => valueText(current)}
            onKeyDown={stepFromFraction}
            className="size-4 rounded-full border-[3px] border-card bg-primary shadow-[0_1px_3px_rgb(0_0_0/0.45)] outline-none transition-[box-shadow,scale] duration-150 ease-out select-none hover:ring-4 hover:ring-primary/15 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-ring/45 data-dragging:scale-110 data-dragging:ring-4 data-dragging:ring-primary/20"
          />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
}

function FixedIncomeMatrix({ items, sum, valueOf, textOf, onChange, changedKeys }: GroupProps) {
  const subclasses = [...new Set(items.map((item) => item.primaryLabel))];
  const durations = ["Curto", "Médio", "Longo"].filter((duration) =>
    items.some((item) => item.secondaryLabel === duration),
  );

  return (
    <div className="mt-5">
      <div className="flex justify-end">
        <SumBadge sum={sum} />
      </div>
      <StackedBar
        segments={items.map((item) => ({
          key: item.key,
          label: `${item.primaryLabel} · ${item.secondaryLabel}`,
          value: valueOf(item),
        }))}
      />
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
              <th className="py-2 pr-3">Subclasse</th>
              {durations.map((duration) => (
                <th key={duration} className="px-1.5 py-2 text-right">
                  {duration}
                </th>
              ))}
              <th className="py-2 pl-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {subclasses.map((subclass) => {
              const rowItems = durations
                .map((duration) =>
                  items.find((item) => item.primaryLabel === subclass && item.secondaryLabel === duration),
                )
                .filter((item): item is TargetEditorItem => item !== undefined);
              const rowTotal = rowItems.reduce((total, item) => total + (Number.isFinite(valueOf(item)) ? valueOf(item) : 0), 0);

              return (
                <tr key={subclass}>
                  <td className="py-1.5 pr-3 text-xs text-foreground/85">{subclass}</td>
                  {rowItems.map((item) => (
                    <td key={item.key} className="px-1.5 py-1.5">
                      <PercentInput
                        item={item}
                        text={textOf(item)}
                        changed={changedKeys.includes(item.key)}
                        label={`${subclass} ${item.secondaryLabel}`}
                        onChange={onChange}
                      />
                    </td>
                  ))}
                  <td className="py-1.5 pl-3 text-right font-mono text-[11px] text-muted-foreground">
                    {formatSharePercent(rowTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PercentInput({
  item,
  text,
  changed,
  label,
  onChange,
}: {
  item: TargetEditorItem;
  text: string;
  changed: boolean;
  label: string;
  onChange: (item: TargetEditorItem, text: string) => void;
}) {
  const parsed = parseLocaleNumber(text);
  const invalid = parsed === null || parsed > 100;

  return (
    <span className="relative flex items-center">
      <input
        inputMode="decimal"
        value={text}
        aria-label={`Percentual de ${label}`}
        aria-invalid={invalid}
        onChange={(event) => onChange(item, event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        className={cn(
          "h-8 w-full rounded-lg border bg-background/60 pr-6 pl-2 text-right font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          invalid ? "border-destructive" : changed ? "border-warning-border bg-warning/25" : "border-border",
        )}
      />
      <span className="pointer-events-none absolute right-2 text-[10px] text-muted-foreground">%</span>
    </span>
  );
}

function SumBadge({ sum }: { sum: number }) {
  const ok = Math.abs(sum - 100) <= SUM_EPSILON;
  const difference = 100 - sum;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold",
        ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
      )}
    >
      {ok ? <CheckCircleIcon aria-hidden="true" size={12} weight="fill" /> : <WarningCircleIcon aria-hidden="true" size={12} weight="fill" />}
      Soma: {formatInput(sum)}%
      {ok ? null : difference > 0 ? ` · faltam ${formatInput(difference)}%` : ` · sobram ${formatInput(-difference)}%`}
    </span>
  );
}

function StackedBar({ segments }: { segments: { key: string; label: string; value: number }[] }) {
  const total = segments.reduce((sum, segment) => sum + (Number.isFinite(segment.value) ? Math.max(segment.value, 0) : 0), 0);
  const scale = Math.max(total, 100);

  return (
    <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/[0.05]" aria-hidden="true">
      {segments.map((segment) =>
        Number.isFinite(segment.value) && segment.value > 0 ? (
          <div
            key={segment.key}
            className="h-full transition-[width] duration-200 ease-out first:rounded-l-full"
            style={{ width: `${(segment.value / scale) * 100}%`, backgroundColor: categoryColor(segment.label) }}
          />
        ) : null,
      )}
    </div>
  );
}

const PREVIEW_SCOPES: { scope: AllocationGroupKey; label: string }[] = [
  { scope: "ASSET_CLASS", label: "Classe" },
  { scope: "CURRENCY", label: "Moeda" },
  { scope: "STRATEGY", label: "Estratégia" },
  { scope: "CLASS_CURRENCY", label: "Moeda/classe" },
  { scope: "FIXED_INCOME", label: "Renda fixa" },
  { scope: "VARIABLE_INCOME", label: "Renda variável" },
];

// Memorizada: recebe linhas derivadas do rascunho adiado e não participa da renderização urgente do arraste.
const PreviewPanel = memo(function PreviewPanel({
  scope,
  onScopeChange,
  monthLabel,
  beforeRows,
  afterRows,
  offTargetBefore,
  offTargetAfter,
  hasChanges,
}: {
  scope: AllocationGroupKey;
  onScopeChange: (scope: AllocationGroupKey) => void;
  monthLabel: string | null;
  beforeRows: AllocationRow[];
  afterRows: AllocationRow[];
  offTargetBefore: number;
  offTargetAfter: number;
  hasChanges: boolean;
}) {
  const beforeByKey = new Map(beforeRows.map((row) => [row.key, row]));
  const rows = [...afterRows]
    .filter((row) => row.targetShare !== null || beforeByKey.get(row.key)?.targetShare !== null)
    .sort((left, right) => Math.abs(right.differenceBrl ?? 0) - Math.abs(left.differenceBrl ?? 0));

  return (
    <section className="premium-panel rounded-[24px] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.025em]">Prévia de comprar e vender</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {monthLabel ? `Carteira de ${monthLabel}, com as metas em edição.` : "Sem competência para simular."}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] tracking-[0.08em] text-muted-foreground uppercase">Fora da meta</p>
          <p className="mt-0.5 font-mono text-sm text-foreground">
            {hasChanges && offTargetAfter !== offTargetBefore ? (
              <>
                <span className="text-muted-foreground line-through">{offTargetBefore}</span>{" "}
                <ArrowRightIcon aria-hidden="true" className="inline" size={10} /> {offTargetAfter}
              </>
            ) : (
              offTargetAfter
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-0.5 rounded-lg border border-border bg-card/60 p-0.5">
        {PREVIEW_SCOPES.map((entry) => (
          <button
            key={entry.scope}
            type="button"
            aria-pressed={entry.scope === scope}
            onClick={() => onScopeChange(entry.scope)}
            className={cn(
              "rounded-md px-2 py-1 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
              entry.scope === scope ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[360px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border/60 text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
              <th className="py-2.5 pr-2">Item</th>
              <th className="py-2.5 pr-2 text-right">Atual</th>
              <th className="py-2.5 pr-2 text-right">Meta</th>
              <th className="py-2.5 text-right">Diferença</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.map((row) => {
              const previous = beforeByKey.get(row.key);
              const targetChanged =
                previous !== undefined && Math.abs((previous.targetShare ?? 0) - (row.targetShare ?? 0)) > 1e-9;
              const actionChanged = previous !== undefined && previous.direction !== row.direction;

              return (
                <tr key={row.key} className={cn(targetChanged && "bg-warning/15")}>
                  <td className="py-2.5 pr-2 text-xs text-foreground/85">{row.label}</td>
                  <td className="py-2.5 pr-2 text-right font-mono text-[11px] text-muted-foreground">
                    {formatSharePercent(row.currentShare)}
                  </td>
                  <td className="py-2.5 pr-2 text-right font-mono text-[11px]">
                    {targetChanged ? (
                      <span>
                        <span className="text-muted-foreground line-through">
                          {formatSharePercent(previous?.targetShare ?? 0)}
                        </span>{" "}
                        <span className="text-foreground">{formatSharePercent(row.targetShare ?? 0)}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {row.targetShare === null ? "—" : formatSharePercent(row.targetShare)}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    <span className="inline-flex flex-col items-end gap-1">
                      <DirectionBadge direction={row.direction} highlight={actionChanged} />
                      <span className="font-mono text-[11px] text-foreground">
                        {row.differenceBrl === null ? "—" : formatBrl(row.differenceBrl)}
                      </span>
                      {targetChanged && previous?.differenceBrl !== null && previous?.differenceBrl !== undefined ? (
                        <span className="font-mono text-[9px] text-muted-foreground line-through">
                          {formatBrl(previous.differenceBrl)}
                        </span>
                      ) : null}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
});

function DirectionBadge({ direction, highlight }: { direction: AllocationRow["direction"]; highlight: boolean }) {
  if (direction === null) {
    return null;
  }

  const label = direction === "SELL" ? "Vender" : direction === "BUY" ? "Comprar" : "Equilibrado";

  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-[0.06em] uppercase",
        direction === "SELL"
          ? "bg-destructive/10 text-destructive"
          : direction === "BUY"
            ? "bg-primary/10 text-primary"
            : "bg-white/[0.05] text-muted-foreground",
        highlight && "ring-1 ring-warning-border",
      )}
    >
      {label}
    </span>
  );
}

const ToleranceCard = memo(function ToleranceCard({
  text,
  value,
  invalid,
  changed,
  onChange,
}: {
  text: string;
  value: number;
  invalid: boolean;
  changed: boolean;
  onChange: (text: string) => void;
}) {
  return (
    <section className="premium-panel rounded-[24px] p-5 sm:p-6" aria-label="Tolerância">
      <h2 className="text-base font-semibold tracking-[-0.025em]">Tolerância</h2>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Diferença, em pontos percentuais, até a qual um item fica equilibrado em vez de pedir compra ou venda.
      </p>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_84px] items-center gap-3">
        <StepSlider
          value={value}
          max={MAX_REBALANCE_TOLERANCE}
          largeStep={5}
          label="Faixa de tolerância"
          valueText={(current) => `${formatInput(current)} pontos percentuais`}
          onChange={(next) => onChange(formatInput(next))}
        />
        <span className="relative flex items-center">
          <input
            inputMode="decimal"
            value={text}
            aria-label="Tolerância em pontos percentuais"
            aria-invalid={invalid}
            onChange={(event) => onChange(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            className={cn(
              "h-8 w-full rounded-lg border bg-background/60 pr-7 pl-2 text-right font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              invalid ? "border-destructive" : changed ? "border-warning-border bg-warning/25" : "border-border",
            )}
          />
          <span className="pointer-events-none absolute right-2 text-[10px] text-muted-foreground">p.p.</span>
        </span>
      </div>
    </section>
  );
});

function draftValue(item: TargetEditorItem, draft: Draft) {
  const text = draft[item.key];
  return text === undefined ? item.percent : (parseLocaleNumber(text) ?? Number.NaN);
}

function draftTolerance(text: string | null, persisted: number) {
  return text === null ? persisted : (parseLocaleNumber(text) ?? Number.NaN);
}

function toTargets(items: TargetEditorItem[], draft: Draft): TargetValue[] {
  return items.map((item) => {
    const value = draftValue(item, draft);
    return {
      scope: item.scope,
      primaryLabel: item.primaryLabel,
      secondaryLabel: item.secondaryLabel,
      fraction: Number.isFinite(value) ? value / 100 : 0,
    };
  });
}

function isValidTolerance(value: number) {
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_REBALANCE_TOLERANCE &&
    Math.abs(Math.round(value * 100) - value * 100) < 1e-6
  );
}

// Formatadores criados uma vez: `toLocaleString` com opções monta um formatador novo a cada chamada, e o
// editor formata dezenas de valores a cada passo do deslizante.
const INPUT_FORMAT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4, useGrouping: false });
const VERSION_DATE_FORMAT = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function formatInput(value: number) {
  return INPUT_FORMAT.format(value);
}
