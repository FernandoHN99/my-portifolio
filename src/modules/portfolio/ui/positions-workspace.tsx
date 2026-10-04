"use client";

import { Dialog } from "@base-ui/react/dialog";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CaretRightIcon,
  CopyIcon,
  CurrencyCircleDollarIcon,
  LockKeyIcon,
  MagnifyingGlassIcon,
  ArrowsDownUpIcon,
  HandCoinsIcon,
  PencilSimpleIcon,
  PlusIcon,
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
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { Fragment, useCallback, useRef, useState, useTransition, type MouseEvent, type ReactNode } from "react";

import {
  cloneLatestMonthAction,
  removePositionAction,
  startPortfolioAction,
  undoChangeAction,
  type EditActionResult,
} from "@/app/actions/edit-month";
import { cn } from "@/lib/utils";
import type { EditingCatalog } from "@/modules/portfolio/application/get-editing-catalog";
import type { MonthPosition, MonthPositions } from "@/modules/portfolio/application/get-month-positions";
import { categoryColor } from "@/modules/portfolio/presentation/category-colors";
import { formatDay } from "@/modules/portfolio/presentation/maturity";
import {
  allocationLabel,
  classesOf,
  filterOptions,
  filterPositions,
  groupPositions,
  hasClassFilter,
  matchedValueBrl,
  strategyOf,
  type PositionFilters,
} from "@/modules/portfolio/presentation/position-filters";
import {
  formatBrl,
  formatMonthCompact,
  formatPriceBrl,
  formatSharePercent,
} from "@/modules/portfolio/presentation/portfolio-format";
import { positionHref } from "@/modules/portfolio/presentation/position-page";
import { parseMonthParam, toMonthParam } from "@/modules/portfolio/presentation/reference-month";
import {
  backdropClass,
  centeredPopupClass,
  headerPrimaryButtonClass,
  secondaryButtonClass,
} from "@/modules/portfolio/ui/edit-dialogs";
import { EditToast, type EditToastState } from "@/modules/portfolio/ui/edit-toast";
import { EmptyPortfolio } from "@/modules/portfolio/ui/empty-portfolio";
import { cashCurrencyOf, LiquidationDialog, type LiquidationTarget } from "@/modules/portfolio/ui/liquidation-dialog";
import { MaturityBadge } from "@/modules/portfolio/ui/maturity-badge";
import { MultiSelectFilter } from "@/modules/portfolio/ui/multi-select-filter";
import { PositionFormDialog, type PositionFormTarget } from "@/modules/portfolio/ui/position-form-dialog";
import {
  PositionTransactionDialog,
  transactionMonthOf,
  type TransactionTarget,
} from "@/modules/portfolio/ui/position-transaction-dialog";

const QUICK_CLASSES = ["Caixa", "Cripto", "Renda Fixa", "Renda Variável", "Reserva"];
const GROUP_OPTIONS = ["instituicao", "classe"] as const;
const list = parseAsArrayOf(parseAsString).withDefault([]);

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});
const helper = createColumnHelper<typeof features, MonthPosition>();

type ColumnMeta = { align: "left" | "right"; calculated: boolean; hide: string };

// Cotação, moeda e liquidez saíram da tabela para compactá-la (spec 044); ficam
// na linha expandida e nos filtros.
const COLUMN_META: Record<string, ColumnMeta> = {
  assetName: { align: "left", calculated: false, hide: "" },
  institutionName: { align: "left", calculated: false, hide: "hidden sm:table-cell" },
  strategy: { align: "left", calculated: false, hide: "hidden xl:table-cell" },
  classes: { align: "left", calculated: false, hide: "hidden lg:table-cell" },
  maturityDate: { align: "left", calculated: false, hide: "hidden xl:table-cell" },
  quantity: { align: "right", calculated: false, hide: "hidden md:table-cell" },
  totalBrl: { align: "right", calculated: true, hide: "" },
  totalUsd: { align: "right", calculated: true, hide: "hidden xl:table-cell" },
  share: { align: "right", calculated: true, hide: "hidden md:table-cell" },
};

const columns = helper.columns([
  helper.accessor("assetName", { header: "Ativo" }),
  helper.accessor("institutionName", { header: "Instituição" }),
  helper.accessor((row) => strategyOf(row), { id: "strategy", header: "Estratégia" }),
  helper.accessor((row) => classesOf(row).join(", "), { id: "classes", header: "Classes" }),
  // Sem vencimento ordena depois de qualquer data, nos dois sentidos de ordem.
  helper.accessor((row) => row.maturityDate ?? undefined, {
    id: "maturityDate",
    header: "Vencimento",
    sortUndefined: "last",
  }),
  helper.accessor("quantity", { header: "Quantidade" }),
  helper.accessor("totalBrl", { header: "Total R$" }),
  helper.accessor((row) => row.totalUsd ?? -1, { id: "totalUsd", header: "Total US$" }),
  helper.accessor("share", { header: "%" }),
]);

// Seta de expansão, colunas e ações.
const COLUMN_COUNT = columns.length + 2;

type FormState = { open: boolean; target: PositionFormTarget | null; key: number };

export function PositionsWorkspace({
  month,
  catalog,
}: {
  month: MonthPositions | null;
  catalog: EditingCatalog;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useQueryStates(
    {
      classe: list,
      subclasse: list,
      inst: list,
      estrategia: list,
      moeda: list,
      venc: list,
      liq: list,
      q: parseAsString.withDefault(""),
      ordem: parseAsString.withDefault("totalBrl.desc"),
      agrupar: parseAsStringLiteral(GROUP_OPTIONS),
    },
    { clearOnDefault: true },
  );

  const [form, setForm] = useState<FormState>({ open: false, target: null, key: 0 });
  const [movement, setMovement] = useState<{ open: boolean; target: TransactionTarget | null; key: number }>({
    open: false,
    target: null,
    key: 0,
  });
  const [liquidation, setLiquidation] = useState<{ open: boolean; target: LiquidationTarget | null; key: number }>({
    open: false,
    target: null,
    key: 0,
  });
  const [removal, setRemoval] = useState<{ open: boolean; position: MonthPosition | null }>({
    open: false,
    position: null,
  });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<EditToastState | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isUndoing, startUndo] = useTransition();
  const [isOpening, startOpening] = useTransition();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const sequence = useRef(0);

  const dismissToast = useCallback(() => setToast(null), []);

  const filters: PositionFilters = {
    classes: query.classe,
    subclasses: query.subclasse,
    institutions: query.inst,
    strategies: query.estrategia,
    currencies: query.moeda,
    maturities: query.venc,
    liquidities: query.liq,
    search: query.q,
  };
  const positions = month?.positions ?? [];
  const filtered = filterPositions(positions, filters);
  // Filtros em cascata da esquerda para a direita (spec 044): cada filtro só
  // oferece o que existe com os filtros à esquerda dele.
  const options = filterOptions(positions, filters);
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
    return <EmptyPositions month={month} catalog={catalog} />;
  }

  const canEdit = !month.isLocked;
  const monthLabel = formatMonthCompact(month.referenceDate);
  const sortedPositions = table.getRowModel().rows.map((row) => row.original);
  const groups = query.agrupar ? groupPositions(sortedPositions, query.agrupar, filters) : null;
  const filteredTotal = sortedPositions.reduce((total, position) => total + position.totalBrl, 0);
  const matchedTotal = hasClassFilter(filters)
    ? sortedPositions.reduce((total, position) => total + matchedValueBrl(position, filters), 0)
    : null;
  const activeFilterCount =
    filters.classes.length +
    filters.subclasses.length +
    filters.institutions.length +
    filters.strategies.length +
    filters.currencies.length +
    filters.maturities.length +
    filters.liquidities.length +
    (filters.search ? 1 : 0);
  const occupied = new Set(month.positions.map((position) => `${position.accountId}:${position.assetId}`));

  const notify = (result: EditActionResult) =>
    setToast({
      id: ++sequence.current,
      tone: result.ok ? "success" : "error",
      message: result.message,
      undoToken: result.ok ? result.undoToken : undefined,
    });

  const openForm = (target: PositionFormTarget) =>
    setForm((current) => ({ open: true, target, key: current.key + 1 }));

  const confirmRemoval = () => {
    const position = removal.position;

    if (!position) {
      return;
    }

    startSaving(async () => {
      const result = await removePositionAction({ monthId: month.id, positionId: position.id });
      setRemoval((current) => ({ ...current, open: false }));
      notify(result);
    });
  };

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

  const toggleExpanded = (position: MonthPosition) =>
    setExpanded((current) => {
      const next = new Set(current);

      if (next.has(position.id)) {
        next.delete(position.id);
      } else {
        next.add(position.id);
      }

      return next;
    });

  const toggleQuickClass = (assetClass: string) =>
    void setQuery({
      classe: filters.classes.includes(assetClass)
        ? filters.classes.filter((value) => value !== assetClass)
        : [...filters.classes, assetClass],
    });

  const clearFilters = () =>
    void setQuery({ classe: null, subclasse: null, inst: null, estrategia: null, moeda: null, venc: null, liq: null, q: null });

  // A linha abre a página da posição (spec 016), com a query da tabela para a
  // volta reabrir os mesmos filtros.
  const openPosition = (position: MonthPosition, href: string) => {
    setOpeningId(position.id);
    startOpening(() => router.push(href));
  };

  const renderRow = (position: MonthPosition, rowKey: string, valueBrl: number) => (
    <PositionRow
      key={rowKey}
      position={position}
      referenceDay={month.referenceDay}
      valueBrl={valueBrl}
      usdRate={month.usdRate}
      href={positionHref(position.accountId, position.assetId, searchParams)}
      expanded={expanded.has(position.id)}
      canEdit={canEdit}
      opening={isOpening && openingId === position.id}
      onOpen={openPosition}
      onToggle={toggleExpanded}
      onEdit={(target) => openForm({ mode: "edit", position: target })}
      onMove={(target) =>
        setMovement((current) => ({
          open: true,
          key: current.key + 1,
          target: {
            positionId: target.id,
            assetName: target.assetName,
            quoteSymbol: target.quoteSymbol,
            quantity: target.quantity,
            unitPriceBrl: target.unitPriceBrl,
            totalBrl: target.totalBrl,
            cdi: Boolean(target.cdiPercent && target.calculationStartDate),
          },
        }))
      }
      onRemove={(target) => setRemoval({ open: true, position: target })}
      onLiquidate={
        // Título vencido e com saldo no mês aberto (spec 059).
        position.maturityDate && position.maturityDate <= month.referenceDay && position.totalBrl > 0
          ? (target) =>
              setLiquidation((current) => ({
                open: true,
                key: current.key + 1,
                target: {
                  positionId: target.id,
                  assetName: target.assetName,
                  totalBrl: target.totalBrl,
                  maturityDate: target.maturityDate!,
                  currency: cashCurrencyOf(target.quoteSymbol),
                },
              }))
          : undefined
      }
    />
  );

  const cloneTarget = parseMonthParam(catalog.clone.targetMonth ?? undefined);

  return (
    <div className="relative mx-auto w-full max-w-[1472px] px-5 py-8 pb-24 sm:px-7 sm:py-10 xl:px-12 xl:py-12">
      <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[460px] w-[460px]" />

      <header className="flex flex-col gap-6 border-b border-border/70 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">Posições</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-[2.65rem]">Carteira do mês</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            {month.positions.length} posições separadas por instituição.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <p className="font-mono text-xs text-muted-foreground">
            {formatBrl(month.totalBrl)}
            {month.usdRate ? ` · US$ ${formatUsd(month.totalBrl / month.usdRate)}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {/* As cotações do mês ficam só aqui, em Posições, e não no topo: a
                ilha do topo mostra o caminho Posições → Cotações (spec 048). */}
            <Link
              href={`/posicoes/cotacoes?mes=${toMonthParam(month.referenceDate)}`}
              aria-label="Cotações do mês"
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card/70 px-3.5 text-xs font-semibold text-foreground outline-none transition-colors hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <CurrencyCircleDollarIcon aria-hidden="true" className="text-primary" size={16} weight="duotone" />
              Cotações
            </Link>
            {/* Só o mês aberto aceita edição (spec 034); um mês fechado é aberto
                pelo cadeado da linha do tempo. */}
            {canEdit ? (
              <button type="button" onClick={() => openForm({ mode: "add" })} className={headerPrimaryButtonClass}>
                <PlusIcon aria-hidden="true" size={14} weight="bold" />
                Adicionar posição
              </button>
            ) : null}
            {month.isLatest && catalog.clone.allowed && cloneTarget ? (
              <button type="button" disabled={isSaving} onClick={cloneMonth} className={headerPrimaryButtonClass}>
                <CopyIcon aria-hidden="true" size={14} weight="bold" />
                Criar {formatMonthCompact(cloneTarget)} a partir de {monthLabel}
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {month.isLocked ? (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3">
          <LockKeyIcon aria-hidden="true" className="text-muted-foreground" size={16} weight="duotone" />
          <p data-testid="month-locked" className="text-xs text-muted-foreground">
            {monthLabel} está fechado. Para editar, abra o mês pelo cadeado na linha do tempo.
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
          <MultiSelectFilter label="Vencimento" options={options.maturities} selected={filters.maturities} onChange={(next) => void setQuery({ venc: next })} />
          <MultiSelectFilter label="Liquidez" options={options.liquidities} selected={filters.liquidities} onChange={(next) => void setQuery({ liq: next })} />

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

      <section className="premium-panel mt-5 overflow-hidden rounded-[24px]" aria-label="Posições da competência">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr
                  key={headerGroup.id}
                  className="border-b border-border/60 text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase"
                >
                  <th className="w-9 py-3 pr-0 pl-3 sm:pl-4">
                    <span className="sr-only">Expandir</span>
                  </th>
                  {headerGroup.headers.map((header) => {
                    const meta = COLUMN_META[header.column.id];
                    const sorted = header.column.getIsSorted();

                    return (
                      <th
                        key={header.id}
                        aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                        className={cn("px-4 py-3", meta.hide)}
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
                  <th className={cn("py-3 pr-3 pl-0 sm:pr-4", canEdit ? "w-[66px]" : "w-2")}>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border/55">
              {sortedPositions.length === 0 ? (
                <tr>
                  <td colSpan={COLUMN_COUNT} className="px-6 py-10 text-center text-sm text-muted-foreground">
                    Nenhuma posição corresponde aos filtros.
                  </td>
                </tr>
              ) : groups ? (
                groups.map((group) => (
                  <Fragment key={group.key}>
                    <tr className="bg-white/[0.02]">
                      <td colSpan={COLUMN_COUNT} className="px-5 py-2.5 sm:px-6">
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
                    {group.items.map((item) => renderRow(item.position, `${group.key}-${item.position.id}`, item.valueBrl))}
                  </Fragment>
                ))
              ) : (
                sortedPositions.map((position) => renderRow(position, position.id, position.totalBrl))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/70 text-xs">
                <td colSpan={COLUMN_COUNT} className="px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <span className="text-muted-foreground">
                      {sortedPositions.length} de {month.positions.length} posições
                    </span>
                    <FooterValue label="Total filtrado" value={formatBrl(filteredTotal)} />
                    {month.usdRate ? (
                      <FooterValue label="Em dólar" value={`US$ ${formatUsd(filteredTotal / month.usdRate)}`} />
                    ) : null}
                    <FooterValue
                      label="Da carteira"
                      value={formatSharePercent(month.totalBrl === 0 ? 0 : (filteredTotal / month.totalBrl) * 100)}
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

      <PositionFormDialog
        open={form.open}
        onOpenChange={(open) => setForm((current) => ({ ...current, open }))}
        target={form.target}
        formKey={form.key}
        catalog={catalog}
        month={{ id: month.id, label: monthLabel, isCurrent: month.isCurrent, quotes: month.quotes }}
        occupied={occupied}
        onSaved={notify}
      />

      <LiquidationDialog
        open={liquidation.open}
        onOpenChange={(open) => setLiquidation((current) => ({ ...current, open }))}
        target={liquidation.target}
        formKey={liquidation.key}
        month={transactionMonthOf(month.id, month.referenceDate)}
        cashAccounts={month.positions
          .filter((position) => position.cashAccount)
          .map((position) => ({
            positionId: position.id,
            label: `${position.assetName} · ${position.institutionName}`,
            totalBrl: position.totalBrl,
            currency: cashCurrencyOf(position.quoteSymbol),
          }))}
        onSaved={notify}
      />

      <PositionTransactionDialog
        open={movement.open}
        onOpenChange={(open) => setMovement((current) => ({ ...current, open }))}
        target={movement.target}
        formKey={movement.key}
        month={transactionMonthOf(month.id, month.referenceDate)}
        onSaved={notify}
      />

      <Dialog.Root
        open={removal.open}
        onOpenChange={(open) => !isSaving && setRemoval((current) => ({ ...current, open }))}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className={backdropClass} />
          <Dialog.Popup className={centeredPopupClass}>
            <Dialog.Title className="text-base font-semibold tracking-[-0.02em]">
              Remover {removal.position?.assetName ?? "posição"}?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
              A posição em {removal.position?.institutionName} sai de {monthLabel}. As outras competências não
              mudam, e dá para desfazer logo depois.
            </Dialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close className={secondaryButtonClass} disabled={isSaving}>
                Cancelar
              </Dialog.Close>
              <button
                type="button"
                onClick={confirmRemoval}
                disabled={isSaving}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-destructive px-3.5 text-xs font-semibold text-white outline-none transition-[background-color,transform] duration-150 hover:bg-destructive/90 focus-visible:ring-3 focus-visible:ring-destructive/40 active:scale-[0.98] disabled:opacity-50"
              >
                <TrashIcon aria-hidden="true" size={14} />
                {isSaving ? "Removendo…" : "Remover"}
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <EditToast toast={toast} onDismiss={dismissToast} onUndo={undo} undoing={isUndoing} />
    </div>
  );
}

function PositionRow({
  position,
  referenceDay,
  valueBrl,
  usdRate,
  href,
  expanded,
  canEdit,
  opening,
  onOpen,
  onToggle,
  onEdit,
  onMove,
  onRemove,
  onLiquidate,
}: {
  position: MonthPosition;
  referenceDay: string;
  valueBrl: number;
  usdRate: number | null;
  href: string;
  expanded: boolean;
  canEdit: boolean;
  opening: boolean;
  onOpen: (position: MonthPosition, href: string) => void;
  onToggle: (position: MonthPosition) => void;
  onEdit: (position: MonthPosition) => void;
  onMove: (position: MonthPosition) => void;
  onRemove: (position: MonthPosition) => void;
  /** Só nos títulos vencidos com saldo (spec 059). */
  onLiquidate?: (position: MonthPosition) => void;
}) {
  const isPartial = Math.abs(valueBrl - position.totalBrl) > 0.005;
  const [first, ...others] = [...position.allocations].sort((left, right) => right.weight - left.weight);
  const detailsId = `detalhes-${position.id}`;

  // A linha inteira abre a posição; o nome do ativo é o link real, para o
  // teclado, o leitor de tela e o clique com Ctrl ou Cmd.
  const openFromRow = (event: MouseEvent<HTMLTableRowElement>) => {
    if (event.defaultPrevented || event.button !== 0) {
      return;
    }

    if ((event.target as HTMLElement).closest("a, button, input, select, textarea, [role='combobox']")) {
      return;
    }

    if (window.getSelection()?.toString()) {
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      window.open(href, "_blank", "noopener");
      return;
    }

    onOpen(position, href);
  };

  return (
    <>
      <tr
        data-testid="position-row"
        onClick={openFromRow}
        aria-busy={opening || undefined}
        className={cn(
          "group cursor-pointer transition-[background-color,opacity] duration-150 hover:bg-white/[0.018]",
          expanded && "bg-white/[0.018]",
          opening && "bg-primary/[0.04] opacity-70",
        )}
      >
        <td className="py-4 pr-0 pl-3 align-top sm:pl-4">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={`${expanded ? "Recolher" : "Expandir"} ${position.assetName}`}
            onClick={() => onToggle(position)}
            className="grid size-6 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <CaretRightIcon
              aria-hidden="true"
              size={12}
              weight="bold"
              className={cn("transition-transform duration-200", expanded && "rotate-90")}
            />
          </button>
        </td>
        <Cell id="assetName">
          <Link
            href={href}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
                return;
              }

              event.preventDefault();
              onOpen(position, href);
            }}
            className="rounded-sm text-sm font-medium text-foreground/90 underline-offset-4 outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {position.assetName}
          </Link>
          <p className="mt-1 font-mono text-[9px] text-muted-foreground">{position.ticker ?? "SALDO"}</p>
          {position.maturityDate ? (
            <MaturityBadge maturityDate={position.maturityDate} referenceDay={referenceDay} className="mt-1.5 xl:hidden" />
          ) : null}
          <p className="mt-1 text-[10px] text-muted-foreground sm:hidden">{position.institutionName}</p>
        </Cell>
        <Cell id="institutionName">
          <p className="text-xs text-foreground/80">{position.institutionName}</p>
        </Cell>
        <Cell id="strategy">
          <span className="text-xs whitespace-nowrap text-foreground/80">{strategyOf(position)}</span>
        </Cell>
        <Cell id="classes">
          {first ? (
            <div className="flex max-w-[300px] items-center gap-1.5" data-testid="position-classes">
              <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(first.assetClass) }} />
              <span className="truncate text-xs text-foreground/80" title={allocationLabel(first)}>
                {allocationLabel(first)}
                {others.length > 0 ? (
                  <span className="text-muted-foreground"> {formatWeightPercent(first.weight)}</span>
                ) : null}
              </span>
              {others.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onToggle(position)}
                  aria-label={`Ver as ${others.length + 1} classificações de ${position.assetName}`}
                  title={`Mais ${others.length} ${others.length === 1 ? "classificação" : "classificações"}`}
                  className="shrink-0 rounded-md bg-white/[0.05] px-1.5 font-mono text-[10px] leading-4 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  …+{others.length}
                </button>
              ) : null}
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        </Cell>
        <Cell id="maturityDate">
          {position.maturityDate ? (
            <>
              <p className="font-mono text-xs text-foreground/80">{formatDay(parseDay(position.maturityDate))}</p>
              <MaturityBadge maturityDate={position.maturityDate} referenceDay={referenceDay} className="mt-1" />
            </>
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        </Cell>
        <Cell id="quantity">
          <QuantityText position={position} />
        </Cell>
        <Cell id="totalBrl">
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
          <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">
            {position.totalUsd === null ? "—" : `US$ ${formatUsd(position.totalUsd)}`}
          </span>
        </Cell>
        <Cell id="share">
          <span className="font-mono text-xs text-muted-foreground">{formatSharePercent(position.share)}</span>
        </Cell>
        <td className="py-3.5 pr-3 pl-0 align-top sm:pr-4">
          {canEdit ? (
            // Movimentar, lápis e lixeira aparecem ao passar o mouse, ao focar e
            // sempre em telas de toque, sem hover (specs 043 e 056). Liquidar,
            // num título vencido, fica sempre à vista (spec 059).
            <div className="flex justify-end gap-0.5">
              {onLiquidate ? (
                <IconButton label={`Liquidar ${position.assetName}`} onClick={() => onLiquidate(position)}>
                  <HandCoinsIcon aria-hidden="true" size={14} weight="bold" className="text-warning-foreground" />
                </IconButton>
              ) : null}
              <div className="flex gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                <IconButton label={`Movimentar ${position.assetName}`} onClick={() => onMove(position)}>
                  <ArrowsDownUpIcon aria-hidden="true" size={14} weight="bold" />
                </IconButton>
                <IconButton label={`Editar ${position.assetName}`} onClick={() => onEdit(position)}>
                  <PencilSimpleIcon aria-hidden="true" size={14} weight="bold" />
                </IconButton>
                <IconButton label={`Remover ${position.assetName}`} tone="danger" onClick={() => onRemove(position)}>
                  <TrashIcon aria-hidden="true" size={14} />
                </IconButton>
              </div>
            </div>
          ) : null}
        </td>
      </tr>
      {expanded ? (
        <tr id={detailsId} data-testid="position-details" className="bg-white/[0.012]">
          <td colSpan={COLUMN_COUNT} className="px-5 pt-1 pb-5 sm:pl-[3.25rem] sm:pr-6">
            <PositionDetails position={position} usdRate={usdRate} referenceDay={referenceDay} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** Linha expandida: o rateio completo e os dados que não cabem nas colunas. */
function PositionDetails({
  position,
  usdRate,
  referenceDay,
}: {
  position: MonthPosition;
  usdRate: number | null;
  referenceDay: string;
}) {
  const allocations = [...position.allocations].sort((left, right) => right.weight - left.weight);
  const details: { label: string; value: ReactNode }[] = [
    { label: "Instituição", value: position.institutionName },
    { label: "Estratégia", value: strategyOf(position) },
    { label: "Moeda", value: <span className="font-mono">{position.baseCurrency}</span> },
    {
      label: "Cotação",
      value: (
        <span className="font-mono">{position.unitPriceBrl === null ? "Saldo, sem cotação" : formatPriceBrl(position.unitPriceBrl)}</span>
      ),
    },
    { label: "Quantidade", value: <QuantityText position={position} /> },
    { label: "Liquidez", value: position.liquidity ?? "Não informada" },
    {
      label: "Vencimento",
      value: position.maturityDate ? (
        <span className="inline-flex items-center gap-2">
          <span className="font-mono">{formatDay(parseDay(position.maturityDate))}</span>
          <MaturityBadge maturityDate={position.maturityDate} referenceDay={referenceDay} />
        </span>
      ) : (
        "Não informado"
      ),
    },
    {
      label: "Total em dólar",
      value: <span className="font-mono">{usdRate ? `US$ ${formatUsd(position.totalBrl / usdRate)}` : "—"}</span>,
    },
  ];

  return (
    <div className="grid gap-5 rounded-2xl border border-border/60 bg-background/30 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div>
        <p className="text-[10px] tracking-[0.1em] text-muted-foreground uppercase">Rateio</p>
        {allocations.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Sem rateio.</p>
        ) : (
          <ul className="mt-2.5 space-y-2" data-testid="position-details-allocations">
            {allocations.map((allocation) => (
              <li key={allocationLabel(allocation)} className="flex items-center gap-2.5 text-xs">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(allocation.assetClass) }} />
                <span className="min-w-0 truncate text-foreground/85">{allocationLabel(allocation)}</span>
                <span className="ml-auto shrink-0 font-mono text-muted-foreground">
                  {formatWeightPercent(allocation.weight)}
                </span>
                <span className="w-24 shrink-0 text-right font-mono text-foreground/80">
                  {formatBrl((position.totalBrl * allocation.weight) / 100)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-4">
        {details.map((detail) => (
          <div key={detail.label} className="min-w-0">
            <dt className="text-[10px] tracking-[0.08em] text-muted-foreground uppercase">{detail.label}</dt>
            <dd className="mt-1 truncate text-foreground/85">{detail.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function QuantityText({ position }: { position: MonthPosition }) {
  return (
    <span className="font-mono text-xs text-foreground/85">
      {position.quoteSymbol
        ? position.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 8 })
        : formatBrl(position.quantity)}
    </span>
  );
}

function IconButton({
  label,
  tone = "neutral",
  onClick,
  children,
}: {
  label: string;
  tone?: "neutral" | "danger";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
        tone === "danger" ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-white/[0.06] hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Cell({ id, children }: { id: string; children: ReactNode }) {
  const meta = COLUMN_META[id];

  return (
    <td
      className={cn(
        "px-4 py-4 align-top",
        meta.align === "right" && "text-right",
        meta.calculated && "bg-white/[0.012]",
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

function parseSorting(value: string): SortingState {
  const [id, direction] = value.split(".");

  return id && COLUMN_META[id] ? [{ id, desc: direction !== "asc" }] : [{ id: "totalBrl", desc: true }];
}

function formatUsd(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatWeightPercent(weight: number) {
  return `${weight.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function parseDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Competência sem posições. No mês aberto, ou sem competência nenhuma, como o
 * usuário novo (spec 055), oferece incluir a primeira posição ali mesmo ou
 * restaurar um backup; `?incluir=1`, vindo da Visão Geral, já abre o
 * formulário. Um mês fechado sem posições só avisa.
 */
function EmptyPositions({ month, catalog }: { month: MonthPositions | null; catalog: EditingCatalog }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormState>({ open: false, target: null, key: 0 });
  const [toast, setToast] = useState<EditToastState | null>(null);
  const [isStarting, startStarting] = useTransition();
  // Pedido de incluir que espera a competência aberta: `?incluir=1`, ou o
  // clique antes de a primeira competência existir.
  const [pendingAdd, setPendingAdd] = useState(() => searchParams.get("incluir") === "1");
  const sequence = useRef(0);
  const dismissToast = useCallback(() => setToast(null), []);
  const editable = month !== null && !month.isLocked;
  const formOpen = form.open || (pendingAdd && editable);

  const closeForm = () => {
    setForm((current) => ({ ...current, open: false }));
    setPendingAdd(false);

    if (searchParams.get("incluir") === "1") {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("incluir");
      router.replace(params.size > 0 ? `/posicoes?${params}` : "/posicoes", { scroll: false });
    }
  };

  if (month && month.isLocked) {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-center justify-center px-5 text-center">
        <span className="grid size-12 place-items-center rounded-2xl border border-border bg-card text-primary">
          <TableIcon aria-hidden="true" size={22} weight="duotone" />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">Nenhuma posição nesta competência</h1>
      </div>
    );
  }

  const add = () => {
    if (editable) {
      setForm((current) => ({ open: true, target: { mode: "add" }, key: current.key + 1 }));
      return;
    }

    startStarting(async () => {
      const result = await startPortfolioAction();

      if (!result.ok) {
        setToast({ id: ++sequence.current, tone: "error", message: result.message });
        return;
      }

      setPendingAdd(true);
      router.refresh();
    });
  };

  return (
    <>
      <EmptyPortfolio title="Nenhuma posição ainda" onAdd={add} adding={isStarting || (pendingAdd && !editable)} />
      {month ? (
        <PositionFormDialog
          open={formOpen}
          onOpenChange={(open) => (open ? setForm((current) => ({ ...current, open })) : closeForm())}
          target={form.target ?? { mode: "add" }}
          formKey={form.key}
          catalog={catalog}
          month={{
            id: month.id,
            label: formatMonthCompact(month.referenceDate),
            isCurrent: month.isCurrent,
            quotes: month.quotes,
          }}
          occupied={new Set()}
          onSaved={(result) =>
            setToast({ id: ++sequence.current, tone: result.ok ? "success" : "error", message: result.message })
          }
        />
      ) : null}
      <EditToast toast={toast} onDismiss={dismissToast} onUndo={() => undefined} undoing={false} />
    </>
  );
}
