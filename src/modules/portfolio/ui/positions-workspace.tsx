"use client";

import {
  ArrowCounterClockwiseIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarBlankIcon,
  ChartPieSliceIcon,
  CopyIcon,
  LockKeyIcon,
  MagnifyingGlassIcon,
  TableIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import {
  cloneLatestMonthAction,
  saveAllocationsAction,
  savePositionChangesAction,
  saveQuotesAction,
  undoChangeAction,
  type EditActionResult,
} from "@/app/actions/edit-month";
import { setPendingChanges } from "@/components/product/unsaved-changes";
import { cn } from "@/lib/utils";
import type { EditingCatalog } from "@/modules/portfolio/application/get-editing-catalog";
import type { MonthPositions } from "@/modules/portfolio/application/get-month-positions";
import { categoryColor } from "@/modules/portfolio/presentation/category-colors";
import {
  classesOf,
  filterOptions,
  filterPositions,
  groupPositions,
  hasClassFilter,
  matchedValueBrl,
  NO_STRATEGY,
  strategyOf,
  type PositionFilters,
} from "@/modules/portfolio/presentation/position-filters";
import {
  buildDisplayPositions,
  countChanges,
  editableValueText,
  isQuoted,
  sameValue,
  type AddedDraft,
  type DisplayPosition,
  type PendingEdit,
} from "@/modules/portfolio/presentation/position-drafts";
import {
  formatBrl,
  formatMonth,
  formatMonthCompact,
  formatSharePercent,
  parseLocaleNumber,
} from "@/modules/portfolio/presentation/portfolio-format";
import { parseMonthParam } from "@/modules/portfolio/presentation/reference-month";
import {
  AddPositionDialog,
  AllocationDrawer,
  HistoryUnlockDialog,
  type NewPositionDraft,
} from "@/modules/portfolio/ui/edit-dialogs";
import { EditToast, type EditToastState } from "@/modules/portfolio/ui/edit-toast";
import { MonthQuotesPanel } from "@/modules/portfolio/ui/month-quotes-panel";
import { MultiSelectFilter } from "@/modules/portfolio/ui/multi-select-filter";

const QUICK_CLASSES = ["Caixa", "Cripto", "Renda Fixa", "Renda Variável", "Reserva"];
const GROUP_OPTIONS = ["instituicao", "classe"] as const;
const list = parseAsArrayOf(parseAsString).withDefault([]);

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});
const helper = createColumnHelper<typeof features, DisplayPosition>();

type ColumnMeta = { align: "left" | "right"; calculated: boolean; hide: string };

const COLUMN_META: Record<string, ColumnMeta> = {
  assetName: { align: "left", calculated: false, hide: "" },
  institutionName: { align: "left", calculated: false, hide: "hidden sm:table-cell" },
  strategy: { align: "left", calculated: false, hide: "hidden xl:table-cell" },
  classes: { align: "left", calculated: false, hide: "hidden lg:table-cell" },
  baseCurrency: { align: "left", calculated: false, hide: "hidden md:table-cell" },
  quantity: { align: "right", calculated: false, hide: "hidden md:table-cell" },
  unitPriceBrl: { align: "right", calculated: true, hide: "hidden lg:table-cell" },
  totalBrl: { align: "right", calculated: true, hide: "" },
  totalUsd: { align: "right", calculated: true, hide: "hidden xl:table-cell" },
  share: { align: "right", calculated: true, hide: "hidden md:table-cell" },
};

const columns = helper.columns([
  helper.accessor("assetName", { header: "Ativo" }),
  helper.accessor("institutionName", { header: "Instituição" }),
  helper.accessor((row) => strategyOf(row), { id: "strategy", header: "Estratégia" }),
  helper.accessor((row) => classesOf(row).join(", "), { id: "classes", header: "Classes" }),
  helper.accessor("baseCurrency", { header: "Moeda" }),
  helper.accessor("quantity", { header: "Quantidade" }),
  helper.accessor((row) => row.unitPriceBrl ?? -1, { id: "unitPriceBrl", header: "Cotação" }),
  helper.accessor("totalBrl", { header: "Total R$" }),
  helper.accessor((row) => row.totalUsd ?? -1, { id: "totalUsd", header: "Total US$" }),
  helper.accessor("share", { header: "%" }),
]);

type EditingCell = { rowKey: string; field: "value" | "strategy" };

export function PositionsWorkspace({
  month,
  catalog,
}: {
  month: MonthPositions | null;
  catalog: EditingCatalog;
}) {
  const router = useRouter();
  const [query, setQuery] = useQueryStates(
    {
      classe: list,
      subclasse: list,
      inst: list,
      estrategia: list,
      moeda: list,
      q: parseAsString.withDefault(""),
      ordem: parseAsString.withDefault("totalBrl.desc"),
      agrupar: parseAsStringLiteral(GROUP_OPTIONS),
    },
    { clearOnDefault: true },
  );

  const [stateMonthId, setStateMonthId] = useState(month?.id);
  const [pending, setPending] = useState<Record<string, PendingEdit>>({});
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<AddedDraft[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [toast, setToast] = useState<EditToastState | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isUndoing, startUndo] = useTransition();
  const sequence = useRef(0);

  if (month?.id !== stateMonthId) {
    setStateMonthId(month?.id);
    setPending({});
    setRemoved([]);
    setAdded([]);
    setUnlocked(false);
    setEditing(null);
    setDrawerId(null);
  }

  const changeCount = countChanges(pending, removed, added);

  useEffect(() => {
    setPendingChanges(changeCount);

    if (changeCount === 0) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changeCount]);

  useEffect(() => () => setPendingChanges(0), []);

  const dismissToast = useCallback(() => setToast(null), []);

  const filters: PositionFilters = {
    classes: query.classe,
    subclasses: query.subclasse,
    institutions: query.inst,
    strategies: query.estrategia,
    currencies: query.moeda,
    search: query.q,
  };
  const display = month ? buildDisplayPositions({ month, catalog, pending, removed, added }) : [];
  const filtered = filterPositions(display, filters);
  const options = filterOptions(display);
  const sorting = parseSorting(query.ordem);

  const table = useTable({
    features,
    columns,
    data: filtered,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const first = next[0];
      void setQuery({ ordem: first ? `${first.id}.${first.desc ? "desc" : "asc"}` : null });
    },
  });

  if (!month || month.positions.length === 0) {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-center justify-center px-5 text-center">
        <span className="grid size-12 place-items-center rounded-2xl border border-border bg-card text-primary">
          <TableIcon aria-hidden="true" size={22} weight="duotone" />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">
          Nenhuma posição nesta competência
        </h1>
      </div>
    );
  }

  const canEdit = month.isLatest || unlocked;
  const confirmHistory = unlocked;
  const monthLabel = formatMonthCompact(month.referenceDate);
  const sortedPositions = table.getRowModel().rows.map((row) => row.original);
  const activePositions = sortedPositions.filter((position) => !position.isRemoved);
  const groups = query.agrupar ? groupPositions(sortedPositions, query.agrupar, filters) : null;
  const filteredTotal = activePositions.reduce((total, position) => total + position.totalBrl, 0);
  const displayTotal = display.reduce((total, position) => total + (position.isRemoved ? 0 : position.totalBrl), 0);
  const matchedTotal = hasClassFilter(filters)
    ? activePositions.reduce((total, position) => total + matchedValueBrl(position, filters), 0)
    : null;
  const activeFilterCount =
    filters.classes.length +
    filters.subclasses.length +
    filters.institutions.length +
    filters.strategies.length +
    filters.currencies.length +
    (filters.search ? 1 : 0);
  const occupied = new Set(
    display.filter((position) => !position.isRemoved).map((position) => `${position.accountId}:${position.assetId}`),
  );
  const drawerPosition = display.find((position) => position.id === drawerId) ?? null;
  const strategyOptions = catalog.strategies;

  const notify = (result: EditActionResult) =>
    setToast({
      id: ++sequence.current,
      tone: result.ok ? "success" : "error",
      message: result.message,
      undoToken: result.ok ? result.undoToken : undefined,
    });

  const commitValue = (position: DisplayPosition, text: string) => {
    if (position.isAdded) {
      setAdded((current) =>
        current.map((draft) => (draft.tempId === position.id ? { ...draft, value: text } : draft)),
      );
      return;
    }

    const original = month.positions.find((entry) => entry.id === position.id);
    setPending((current) => {
      const next = { ...current };
      const edit = { ...next[position.id] };

      if (original && sameValue(original, text)) {
        delete edit.value;
      } else {
        edit.value = text;
      }

      if (Object.keys(edit).length === 0) {
        delete next[position.id];
      } else {
        next[position.id] = edit;
      }

      return next;
    });
  };

  const commitStrategy = (position: DisplayPosition, strategy: string | null) => {
    if (position.isAdded) {
      setAdded((current) =>
        current.map((draft) => (draft.tempId === position.id ? { ...draft, strategy } : draft)),
      );
      return;
    }

    const original = month.positions.find((entry) => entry.id === position.id);
    setPending((current) => {
      const next = { ...current };
      const edit = { ...next[position.id] };

      if ((original?.strategy ?? null) === strategy) {
        delete edit.strategy;
      } else {
        edit.strategy = strategy;
      }

      if (Object.keys(edit).length === 0) {
        delete next[position.id];
      } else {
        next[position.id] = edit;
      }

      return next;
    });
  };

  const toggleRemoval = (position: DisplayPosition) => {
    if (position.isAdded) {
      setAdded((current) => current.filter((draft) => draft.tempId !== position.id));
      return;
    }

    setRemoved((current) =>
      current.includes(position.id) ? current.filter((id) => id !== position.id) : [...current, position.id],
    );
  };

  const discard = () => {
    setPending({});
    setRemoved([]);
    setAdded([]);
    setEditing(null);
  };

  const save = () =>
    startSaving(async () => {
      const result = await savePositionChangesAction({
        monthId: month.id,
        confirmHistory,
        updates: Object.entries(pending)
          .filter(([positionId]) => !removed.includes(positionId))
          .map(([positionId, edit]) => ({ positionId, ...edit })),
        removals: removed,
        additions: added.map((draft) => ({
          accountId: draft.accountId,
          assetId: draft.assetId,
          value: draft.value,
          strategy: draft.strategy,
        })),
      });

      if (result.ok) {
        discard();
      }
      notify(result);
    });

  const saveAllocations = (
    allocations: { assetClass: string; subclass: string; duration: string; weightPercent: string }[],
  ) => {
    if (!drawerPosition) {
      return;
    }

    startSaving(async () => {
      const result = await saveAllocationsAction({
        monthId: month.id,
        confirmHistory,
        positionId: drawerPosition.id,
        allocations,
      });

      if (result.ok) {
        setDrawerId(null);
      }
      notify(result);
    });
  };

  const saveQuotes = (quotes: { symbol: string; valueBrl: string }[]) =>
    new Promise<boolean>((resolve) => {
      startSaving(async () => {
        const result = await saveQuotesAction({ monthId: month.id, confirmHistory, quotes });
        notify(result);
        resolve(result.ok);
      });
    });

  const cloneMonth = () =>
    startSaving(async () => {
      const result = await cloneLatestMonthAction();
      notify(result);

      if (result.ok && result.month) {
        router.push(`/posicoes?mes=${result.month}`);
      }
    });

  const undo = (token: string) =>
    startUndo(async () => {
      const result = await undoChangeAction(token);
      notify(result);

      if (result.ok && !result.month) {
        router.replace("/posicoes");
      }
    });

  const addDraft = (draft: NewPositionDraft) =>
    setAdded((current) => [...current, { ...draft, tempId: `novo-${++sequence.current}` }]);

  const toggleQuickClass = (assetClass: string) =>
    void setQuery({
      classe: filters.classes.includes(assetClass)
        ? filters.classes.filter((value) => value !== assetClass)
        : [...filters.classes, assetClass],
    });

  const clearFilters = () =>
    void setQuery({ classe: null, subclasse: null, inst: null, estrategia: null, moeda: null, q: null });

  let rowIndex = 0;
  const renderRow = (position: DisplayPosition, rowKey: string, valueBrl: number) => {
    const index = rowIndex++;

    return (
      <PositionRow
        key={rowKey}
        position={position}
        rowKey={rowKey}
        rowIndex={index}
        valueBrl={valueBrl}
        canEdit={canEdit}
        editing={editing}
        strategyOptions={strategyOptions}
        onEdit={setEditing}
        onCommitValue={commitValue}
        onCommitStrategy={commitStrategy}
        onToggleRemoval={toggleRemoval}
        onOpenAllocations={(target) => setDrawerId(target.id)}
      />
    );
  };

  const cloneTarget = parseMonthParam(catalog.clone.targetMonth ?? undefined);

  return (
    <div className="relative mx-auto w-full max-w-[1472px] px-5 py-8 pb-32 sm:px-7 sm:py-10 sm:pb-32 xl:px-12 xl:py-12 xl:pb-32">
      <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[460px] w-[460px]" />

      <header className="flex flex-col gap-6 border-b border-border/70 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">Posições</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-[2.65rem]">Carteira do mês</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            {month.positions.length} posições separadas por conta e instituição.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-border bg-card/70 px-3.5 py-2.5 text-xs text-muted-foreground">
            <CalendarBlankIcon aria-hidden="true" className="text-primary" size={15} weight="duotone" />
            <span>{formatMonth(month.referenceDate)}</span>
            {month.status === "DRAFT" ? (
              <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[9px] font-semibold tracking-[0.08em] text-warning-foreground uppercase">
                Rascunho
              </span>
            ) : null}
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {formatBrl(displayTotal)}
            {month.usdRate ? ` · US$ ${formatUsd(displayTotal / month.usdRate)}` : ""}
          </p>
          {month.isLatest && catalog.clone.allowed && cloneTarget ? (
            <button
              type="button"
              disabled={isSaving || changeCount > 0}
              onClick={cloneMonth}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground outline-none transition-[background-color,transform] duration-150 hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.98] disabled:opacity-40"
            >
              <CopyIcon aria-hidden="true" size={14} weight="bold" />
              Criar {formatMonthCompact(cloneTarget)} a partir de {monthLabel}
            </button>
          ) : null}
        </div>
      </header>

      {!canEdit ? (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3">
          <LockKeyIcon aria-hidden="true" className="text-muted-foreground" size={16} weight="duotone" />
          <p className="text-xs text-muted-foreground">
            {monthLabel} é uma competência passada e está travada para edição.
          </p>
          <div className="ml-auto">
            <HistoryUnlockDialog monthLabel={monthLabel} onConfirm={() => setUnlocked(true)} />
          </div>
        </div>
      ) : !month.isLatest ? (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-warning-border bg-warning/30 px-4 py-3">
          <LockKeyIcon aria-hidden="true" className="text-warning-foreground" size={16} weight="duotone" />
          <p className="text-xs text-warning-foreground">
            Editando o histórico de {monthLabel}. As alterações valem para todas as análises deste mês.
          </p>
        </div>
      ) : null}

      <section aria-label="Filtros" className="mt-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_CLASSES.filter((assetClass) => options.classes.includes(assetClass)).map((assetClass) => {
            const active = filters.classes.includes(assetClass);

            return (
              <button
                key={assetClass}
                type="button"
                aria-pressed={active}
                onClick={() => toggleQuickClass(assetClass)}
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                  active
                    ? "border-transparent bg-foreground text-background"
                    : "border-border bg-card/60 text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: categoryColor(assetClass) }} />
                {assetClass}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex h-8 min-w-[200px] flex-1 items-center sm:max-w-[280px]">
            <span className="sr-only">Buscar posição</span>
            <MagnifyingGlassIcon
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 text-muted-foreground"
              size={14}
            />
            <input
              type="search"
              value={filters.search}
              onChange={(event) => void setQuery({ q: event.target.value || null })}
              placeholder="Buscar ativo, ticker ou instituição"
              className="h-8 w-full rounded-lg border border-border bg-card/60 pr-2.5 pl-8 text-xs text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </label>

          <MultiSelectFilter label="Classe" options={options.classes} selected={filters.classes} onChange={(next) => void setQuery({ classe: next })} />
          <MultiSelectFilter label="Subclasse" options={options.subclasses} selected={filters.subclasses} onChange={(next) => void setQuery({ subclasse: next })} />
          <MultiSelectFilter label="Instituição" options={options.institutions} selected={filters.institutions} onChange={(next) => void setQuery({ inst: next })} />
          <MultiSelectFilter label="Estratégia" options={options.strategies} selected={filters.strategies} onChange={(next) => void setQuery({ estrategia: next })} />
          <MultiSelectFilter label="Moeda" options={options.currencies} selected={filters.currencies} onChange={(next) => void setQuery({ moeda: next })} />

          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <XIcon aria-hidden="true" size={12} weight="bold" />
              Limpar filtros
            </button>
          ) : null}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {canEdit ? (
              <AddPositionDialog catalog={catalog} quotes={month.quotes} occupied={occupied} onAdd={addDraft} />
            ) : null}
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card/60 p-0.5">
              <span className="px-2 text-[10px] tracking-[0.08em] text-muted-foreground uppercase">Agrupar</span>
              {([null, ...GROUP_OPTIONS] as const).map((option) => (
                <button
                  key={option ?? "nenhum"}
                  type="button"
                  aria-pressed={query.agrupar === option}
                  onClick={() => void setQuery({ agrupar: option })}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                    query.agrupar === option
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option === null ? "Nenhum" : option === "instituicao" ? "Instituição" : "Classe"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <MonthQuotesPanel quotes={month.quotes} canEdit={canEdit} saving={isSaving} onSave={saveQuotes} />

      <section className="premium-panel mt-5 overflow-hidden rounded-[24px]" aria-label="Posições da competência">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr
                  key={headerGroup.id}
                  className="border-b border-border/60 text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase"
                >
                  {headerGroup.headers.map((header) => {
                    const meta = COLUMN_META[header.column.id];
                    const sorted = header.column.getIsSorted();

                    return (
                      <th
                        key={header.id}
                        aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                        className={cn("px-4 py-3 first:pl-5 sm:first:pl-6", meta.hide)}
                      >
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            "inline-flex items-center gap-1 uppercase outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
                            meta.align === "right" && "w-full justify-end",
                            sorted && "text-foreground",
                          )}
                        >
                          {meta.calculated ? (
                            <span title="Calculado" className="font-mono normal-case text-muted-foreground/60">
                              ƒ
                            </span>
                          ) : null}
                          <table.FlexRender header={header} />
                          {sorted === "asc" ? (
                            <ArrowUpIcon aria-hidden="true" size={10} weight="bold" />
                          ) : sorted === "desc" ? (
                            <ArrowDownIcon aria-hidden="true" size={10} weight="bold" />
                          ) : null}
                        </button>
                      </th>
                    );
                  })}
                  {canEdit ? (
                    <th className="w-[88px] px-4 py-3 pr-5 text-right">
                      <span className="sr-only">Ações</span>
                    </th>
                  ) : null}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border/55">
              {sortedPositions.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-6 py-10 text-center text-sm text-muted-foreground">
                    Nenhuma posição corresponde aos filtros.
                  </td>
                </tr>
              ) : groups ? (
                groups.map((group) => (
                  <Fragment key={group.key}>
                    <tr className="bg-white/[0.02]">
                      <td colSpan={columns.length + 1} className="px-5 py-2.5 sm:px-6">
                        <div className="flex items-center gap-2.5">
                          {query.agrupar === "classe" ? (
                            <span className="size-2 rounded-full" style={{ backgroundColor: categoryColor(group.label) }} />
                          ) : null}
                          <span className="text-xs font-semibold text-foreground">{group.label}</span>
                          <span className="text-[10px] text-muted-foreground">{group.items.length}</span>
                          <span className="ml-auto font-mono text-xs text-foreground">{formatBrl(group.totalBrl)}</span>
                        </div>
                      </td>
                    </tr>
                    {group.items.map((item) =>
                      renderRow(item.position, `${group.key}-${item.position.id}`, item.valueBrl),
                    )}
                  </Fragment>
                ))
              ) : (
                sortedPositions.map((position) => renderRow(position, position.id, position.totalBrl))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/70 text-xs">
                <td colSpan={columns.length + 1} className="px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <span className="text-muted-foreground">
                      {activePositions.length} de {display.filter((position) => !position.isRemoved).length} posições
                    </span>
                    <FooterValue label="Total filtrado" value={formatBrl(filteredTotal)} />
                    {month.usdRate ? (
                      <FooterValue label="Em dólar" value={`US$ ${formatUsd(filteredTotal / month.usdRate)}`} />
                    ) : null}
                    <FooterValue
                      label="Da carteira"
                      value={formatSharePercent(displayTotal === 0 ? 0 : (filteredTotal / displayTotal) * 100)}
                    />
                    {matchedTotal !== null ? (
                      <FooterValue label="Parcela nas classes selecionadas" value={formatBrl(matchedTotal)} emphasis />
                    ) : null}
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {changeCount > 0 ? (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] z-40 flex justify-center px-4">
          <div className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-warning-border bg-card/95 px-4 py-3 shadow-2xl backdrop-blur-xl">
            <span className="size-2 shrink-0 rounded-full bg-warning-foreground" />
            <p className="text-xs text-foreground">
              {changeCount} {changeCount === 1 ? "alteração pendente" : "alterações pendentes"}
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
              disabled={isSaving}
              className="inline-flex h-8 items-center rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground outline-none transition-[background-color,transform] duration-150 hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.98] disabled:opacity-50"
            >
              {isSaving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      ) : null}

      <AllocationDrawer
        position={drawerPosition}
        catalog={catalog}
        open={drawerPosition !== null}
        saving={isSaving}
        onOpenChange={(open) => {
          if (!open) {
            setDrawerId(null);
          }
        }}
        onSave={saveAllocations}
      />

      <EditToast toast={toast} onDismiss={dismissToast} onUndo={undo} undoing={isUndoing} />
    </div>
  );
}

function PositionRow({
  position,
  rowKey,
  rowIndex,
  valueBrl,
  canEdit,
  editing,
  strategyOptions,
  onEdit,
  onCommitValue,
  onCommitStrategy,
  onToggleRemoval,
  onOpenAllocations,
}: {
  position: DisplayPosition;
  rowKey: string;
  rowIndex: number;
  valueBrl: number;
  canEdit: boolean;
  editing: EditingCell | null;
  strategyOptions: string[];
  onEdit: (cell: EditingCell | null) => void;
  onCommitValue: (position: DisplayPosition, text: string) => void;
  onCommitStrategy: (position: DisplayPosition, strategy: string | null) => void;
  onToggleRemoval: (position: DisplayPosition) => void;
  onOpenAllocations: (position: DisplayPosition) => void;
}) {
  const isPartial = Math.abs(valueBrl - position.totalBrl) > 0.005;
  const editingValue = editing?.rowKey === rowKey && editing.field === "value";
  const editingStrategy = editing?.rowKey === rowKey && editing.field === "strategy";

  return (
    <tr
      className={cn(
        "transition-colors duration-150 hover:bg-white/[0.018]",
        position.isRemoved && "opacity-45 [&_td]:line-through",
        position.isAdded && "bg-primary/[0.04]",
      )}
    >
      <Cell id="assetName">
        <p className="text-sm font-medium text-foreground/90">{position.assetName}</p>
        <p className="mt-1 font-mono text-[9px] text-muted-foreground">
          {position.ticker ?? "SALDO"}
          {position.isAdded ? <span className="ml-1.5 text-primary no-underline">· nova</span> : null}
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground sm:hidden">{position.institutionName}</p>
      </Cell>
      <Cell id="institutionName">
        <p className="text-xs text-foreground/80">{position.institutionName}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">{position.accountName}</p>
      </Cell>
      <Cell id="strategy" changed={position.strategyChanged && !position.isAdded}>
        {canEdit && !position.isRemoved ? (
          editingStrategy ? (
            <select
              autoFocus
              aria-label={`Estratégia de ${position.assetName}`}
              defaultValue={position.strategy ?? ""}
              onChange={(event) => {
                onCommitStrategy(position, event.target.value || null);
                onEdit(null);
                focusCell("strategy", rowIndex);
              }}
              onBlur={() => onEdit(null)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  onEdit(null);
                  focusCell("strategy", rowIndex);
                }
              }}
              className="h-8 w-full min-w-[140px] rounded-md border border-primary/50 bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <option value="">{NO_STRATEGY}</option>
              {strategyOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <EditableTrigger
              field="strategy"
              rowIndex={rowIndex}
              label={`Editar estratégia de ${position.assetName}`}
              onStart={() => onEdit({ rowKey, field: "strategy" })}
            >
              <span className="text-xs text-foreground/80">{strategyOf(position)}</span>
            </EditableTrigger>
          )
        ) : (
          <span className="text-xs text-foreground/80">{strategyOf(position)}</span>
        )}
      </Cell>
      <Cell id="classes">
        <div className="flex max-w-[260px] flex-wrap gap-1">
          {position.allocations.length === 0 ? (
            <span className="text-[10px] text-muted-foreground">{position.isAdded ? "herda ao salvar" : "—"}</span>
          ) : (
            position.allocations.map((allocation) => (
              <span
                key={`${allocation.assetClass}-${allocation.subclass}-${allocation.duration}`}
                title={allocation.assetClass}
                className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: categoryColor(allocation.assetClass) }} />
                {position.allocations.length > 1
                  ? `${allocation.subclass}${allocation.duration !== "-" ? ` · ${allocation.duration}` : ""} ${allocation.weight.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`
                  : allocation.assetClass}
              </span>
            ))
          )}
        </div>
      </Cell>
      <Cell id="baseCurrency">
        <span className="font-mono text-xs text-muted-foreground">{position.baseCurrency}</span>
      </Cell>
      <Cell id="quantity" changed={position.valueChanged && !position.isAdded}>
        {canEdit && !position.isRemoved ? (
          editingValue ? (
            <ValueInput
              position={position}
              onCommit={(text) => {
                onCommitValue(position, text);
                onEdit(null);
                focusCell("value", rowIndex + 1, rowIndex);
              }}
              onCancel={() => {
                onEdit(null);
                focusCell("value", rowIndex);
              }}
            />
          ) : (
            <EditableTrigger
              field="value"
              rowIndex={rowIndex}
              align="right"
              label={`Editar ${isQuoted(position) ? "quantidade" : "saldo"} de ${position.assetName}`}
              onStart={() => onEdit({ rowKey, field: "value" })}
            >
              <QuantityText position={position} />
            </EditableTrigger>
          )
        ) : (
          <QuantityText position={position} />
        )}
      </Cell>
      <Cell id="unitPriceBrl">
        <span className="font-mono text-xs text-muted-foreground">
          {position.unitPriceBrl === null ? "—" : formatBrl(position.unitPriceBrl)}
        </span>
      </Cell>
      <Cell id="totalBrl" changed={position.valueChanged && !position.isAdded}>
        <span className="font-mono text-xs font-medium whitespace-nowrap text-foreground sm:text-sm">
          {formatBrl(valueBrl)}
        </span>
        {isPartial ? (
          <p className="mt-0.5 font-mono text-[9px] whitespace-nowrap text-muted-foreground">
            de {formatBrl(position.totalBrl)}
          </p>
        ) : null}
      </Cell>
      <Cell id="totalUsd">
        <span className="font-mono text-xs text-muted-foreground">
          {position.totalUsd === null ? "—" : `US$ ${formatUsd(position.totalUsd)}`}
        </span>
      </Cell>
      <Cell id="share">
        <span className="font-mono text-xs text-muted-foreground">{formatSharePercent(position.share)}</span>
      </Cell>
      {canEdit ? (
        <td className="px-4 py-4 pr-5 align-top no-underline">
          <div className="flex justify-end gap-1">
            <IconButton
              label={`Rateio de ${position.assetName}`}
              disabled={position.isAdded || position.isRemoved}
              onClick={() => onOpenAllocations(position)}
            >
              <ChartPieSliceIcon aria-hidden="true" size={14} weight="duotone" />
            </IconButton>
            <IconButton
              label={position.isRemoved ? `Restaurar ${position.assetName}` : `Remover ${position.assetName}`}
              tone={position.isRemoved ? "neutral" : "danger"}
              onClick={() => onToggleRemoval(position)}
            >
              {position.isRemoved ? (
                <ArrowCounterClockwiseIcon aria-hidden="true" size={14} weight="bold" />
              ) : (
                <TrashIcon aria-hidden="true" size={14} />
              )}
            </IconButton>
          </div>
        </td>
      ) : null}
    </tr>
  );
}

function QuantityText({ position }: { position: DisplayPosition }) {
  return (
    <span className="font-mono text-xs text-foreground/85">
      {isQuoted(position)
        ? position.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 8 })
        : formatBrl(position.quantity)}
    </span>
  );
}

function ValueInput({
  position,
  onCommit,
  onCancel,
}: {
  position: DisplayPosition;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(
    position.valueChanged ? position.quantityText : editableValueText(position),
  );
  const parsed = parseLocaleNumber(text);
  const invalid = parsed === null;

  const commit = () => {
    if (!invalid) {
      onCommit(text.trim());
    }
  };

  return (
    <input
      autoFocus
      inputMode="decimal"
      aria-label={`${isQuoted(position) ? "Quantidade" : "Saldo"} de ${position.assetName}`}
      aria-invalid={invalid}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => (invalid ? onCancel() : commit())}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
      className={cn(
        "h-8 w-full min-w-[120px] rounded-md border bg-background px-2 text-right font-mono text-xs text-foreground outline-none focus-visible:ring-2",
        invalid ? "border-destructive focus-visible:ring-destructive/40" : "border-primary/50 focus-visible:ring-ring/50",
      )}
    />
  );
}

function EditableTrigger({
  field,
  rowIndex,
  align = "left",
  label,
  onStart,
  children,
}: {
  field: "value" | "strategy";
  rowIndex: number;
  align?: "left" | "right";
  label: string;
  onStart: () => void;
  children: ReactNode;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      onStart();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusCell(field, rowIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusCell(field, rowIndex - 1);
    }
  };

  return (
    <button
      type="button"
      data-edit-cell={field}
      data-row={rowIndex}
      aria-label={label}
      onDoubleClick={onStart}
      onKeyDown={handleKeyDown}
      className={cn(
        "-mx-1.5 -my-1 rounded-md border border-transparent px-1.5 py-1 outline-none transition-colors hover:border-border focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/40",
        align === "right" && "ml-auto block",
      )}
    >
      {children}
    </button>
  );
}

function IconButton({
  label,
  tone = "neutral",
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  tone?: "neutral" | "danger";
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-30",
        tone === "danger" ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-white/[0.06] hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Cell({ id, changed = false, children }: { id: string; changed?: boolean; children: ReactNode }) {
  const meta = COLUMN_META[id];

  return (
    <td
      className={cn(
        "px-4 py-4 align-top first:pl-5 sm:first:pl-6",
        meta.align === "right" && "text-right",
        meta.calculated && "bg-white/[0.012]",
        changed && "bg-warning/25 shadow-[inset_2px_0_0_var(--warning-border)]",
        meta.hide,
      )}
    >
      {children}
    </td>
  );
}

function FooterValue({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="text-[10px] tracking-[0.08em] text-muted-foreground uppercase">{label}</span>
      <span className={cn("font-mono text-sm", emphasis ? "text-primary" : "text-foreground")}>{value}</span>
    </span>
  );
}

function focusCell(field: "value" | "strategy", rowIndex: number, fallbackIndex?: number) {
  requestAnimationFrame(() => {
    const target =
      document.querySelector<HTMLElement>(`[data-edit-cell="${field}"][data-row="${rowIndex}"]`) ??
      (fallbackIndex === undefined
        ? null
        : document.querySelector<HTMLElement>(`[data-edit-cell="${field}"][data-row="${fallbackIndex}"]`));
    target?.focus();
  });
}

function parseSorting(value: string): SortingState {
  const [id, direction] = value.split(".");

  return id && COLUMN_META[id] ? [{ id, desc: direction !== "asc" }] : [{ id: "totalBrl", desc: true }];
}

function formatUsd(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
