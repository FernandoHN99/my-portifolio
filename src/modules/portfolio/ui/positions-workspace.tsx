"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarBlankIcon,
  MagnifyingGlassIcon,
  TableIcon,
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
import {
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import { Fragment, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import type {
  MonthPosition,
  MonthPositions,
} from "@/modules/portfolio/application/get-month-positions";
import { categoryColor } from "@/modules/portfolio/presentation/category-colors";
import {
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
  formatMonth,
  formatSharePercent,
} from "@/modules/portfolio/presentation/portfolio-format";
import { MultiSelectFilter } from "@/modules/portfolio/ui/multi-select-filter";

const QUICK_CLASSES = ["Caixa", "Cripto", "Renda Fixa", "Renda Variável", "Reserva"];
const GROUP_OPTIONS = ["instituicao", "classe"] as const;
const list = parseAsArrayOf(parseAsString).withDefault([]);

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});
const helper = createColumnHelper<typeof features, MonthPosition>();

type ColumnMeta = { align: "left" | "right"; calculated: boolean; hide: string };

const COLUMN_META: Record<string, ColumnMeta> = {
  assetName: { align: "left", calculated: false, hide: "" },
  institutionName: { align: "left", calculated: false, hide: "hidden sm:table-cell" },
  strategy: { align: "left", calculated: false, hide: "hidden xl:table-cell" },
  classes: { align: "left", calculated: false, hide: "hidden lg:table-cell" },
  baseCurrency: { align: "left", calculated: false, hide: "hidden md:table-cell" },
  quantity: { align: "right", calculated: false, hide: "hidden lg:table-cell" },
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

export function PositionsWorkspace({ month }: { month: MonthPositions | null }) {
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

  const filters: PositionFilters = {
    classes: query.classe,
    subclasses: query.subclasse,
    institutions: query.inst,
    strategies: query.estrategia,
    currencies: query.moeda,
    search: query.q,
  };
  const positions = month?.positions ?? [];
  const filtered = filterPositions(positions, filters);
  const options = filterOptions(positions);
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

  if (!month || positions.length === 0) {
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
    (filters.search ? 1 : 0);

  const clearFilters = () =>
    void setQuery({ classe: null, subclasse: null, inst: null, estrategia: null, moeda: null, q: null });

  const toggleQuickClass = (assetClass: string) =>
    void setQuery({
      classe: filters.classes.includes(assetClass)
        ? filters.classes.filter((value) => value !== assetClass)
        : [...filters.classes, assetClass],
    });

  return (
    <div className="relative mx-auto w-full max-w-[1472px] px-5 py-8 sm:px-7 sm:py-10 xl:px-12 xl:py-12">
      <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[460px] w-[460px]" />

      <header className="flex flex-col gap-6 border-b border-border/70 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">Posições</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-[2.65rem]">
            Carteira do mês
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            {positions.length} posições separadas por conta e instituição.
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
            {formatBrl(month.totalBrl)}
            {month.usdRate ? ` · US$ ${formatUsd(month.totalBrl / month.usdRate)}` : ""}
          </p>
        </div>
      </header>

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

          <MultiSelectFilter
            label="Classe"
            options={options.classes}
            selected={filters.classes}
            onChange={(next) => void setQuery({ classe: next })}
          />
          <MultiSelectFilter
            label="Subclasse"
            options={options.subclasses}
            selected={filters.subclasses}
            onChange={(next) => void setQuery({ subclasse: next })}
          />
          <MultiSelectFilter
            label="Instituição"
            options={options.institutions}
            selected={filters.institutions}
            onChange={(next) => void setQuery({ inst: next })}
          />
          <MultiSelectFilter
            label="Estratégia"
            options={options.strategies}
            selected={filters.strategies}
            onChange={(next) => void setQuery({ estrategia: next })}
          />
          <MultiSelectFilter
            label="Moeda"
            options={options.currencies}
            selected={filters.currencies}
            onChange={(next) => void setQuery({ moeda: next })}
          />

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

          <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-border bg-card/60 p-0.5">
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
                  {headerGroup.headers.map((header) => {
                    const meta = COLUMN_META[header.column.id];
                    const sorted = header.column.getIsSorted();

                    return (
                      <th
                        key={header.id}
                        aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                        className={cn("px-4 py-3 first:pl-5 last:pr-5 sm:first:pl-6", meta.hide)}
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
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border/55">
              {sortedPositions.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-10 text-center text-sm text-muted-foreground">
                    Nenhuma posição corresponde aos filtros.
                  </td>
                </tr>
              ) : groups ? (
                groups.map((group) => (
                  <Fragment key={group.key}>
                    <tr className="bg-white/[0.02]">
                      <td colSpan={columns.length} className="px-5 py-2.5 sm:px-6">
                        <div className="flex items-center gap-2.5">
                          {query.agrupar === "classe" ? (
                            <span className="size-2 rounded-full" style={{ backgroundColor: categoryColor(group.label) }} />
                          ) : null}
                          <span className="text-xs font-semibold text-foreground">{group.label}</span>
                          <span className="text-[10px] text-muted-foreground">{group.items.length}</span>
                          <span className="ml-auto font-mono text-xs text-foreground">
                            {formatBrl(group.totalBrl)}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {group.items.map((item) => (
                      <PositionRow
                        key={`${group.key}-${item.position.id}`}
                        position={item.position}
                        valueBrl={item.valueBrl}
                      />
                    ))}
                  </Fragment>
                ))
              ) : (
                sortedPositions.map((position) => (
                  <PositionRow key={position.id} position={position} valueBrl={position.totalBrl} />
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/70 text-xs">
                <td colSpan={columns.length} className="px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <span className="text-muted-foreground">
                      {sortedPositions.length} de {positions.length} posições
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
                      <FooterValue
                        label="Parcela nas classes selecionadas"
                        value={formatBrl(matchedTotal)}
                        emphasis
                      />
                    ) : null}
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

function PositionRow({ position, valueBrl }: { position: MonthPosition; valueBrl: number }) {
  const isPartial = Math.abs(valueBrl - position.totalBrl) > 0.005;

  return (
    <tr className="transition-colors duration-150 hover:bg-white/[0.018]">
      <Cell id="assetName">
        <p className="text-sm font-medium text-foreground/90">{position.assetName}</p>
        <p className="mt-1 font-mono text-[9px] text-muted-foreground">{position.ticker ?? "SALDO"}</p>
        <p className="mt-1 text-[10px] text-muted-foreground sm:hidden">{position.institutionName}</p>
      </Cell>
      <Cell id="institutionName">
        <p className="text-xs text-foreground/80">{position.institutionName}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">{position.accountName}</p>
      </Cell>
      <Cell id="strategy">
        <span className="text-xs text-foreground/80">{strategyOf(position)}</span>
      </Cell>
      <Cell id="classes">
        <div className="flex max-w-[260px] flex-wrap gap-1">
          {position.allocations.length === 0 ? (
            <span className="text-[10px] text-muted-foreground">—</span>
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
      <Cell id="quantity">
        <span className="font-mono text-xs text-foreground/85">
          {position.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 8 })}
        </span>
      </Cell>
      <Cell id="unitPriceBrl">
        <span className="font-mono text-xs text-muted-foreground">
          {position.unitPriceBrl === null ? "—" : formatBrl(position.unitPriceBrl)}
        </span>
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
        <span className="font-mono text-xs text-muted-foreground">
          {position.totalUsd === null ? "—" : `US$ ${formatUsd(position.totalUsd)}`}
        </span>
      </Cell>
      <Cell id="share">
        <span className="font-mono text-xs text-muted-foreground">{formatSharePercent(position.share)}</span>
      </Cell>
    </tr>
  );
}

function Cell({ id, children }: { id: string; children: ReactNode }) {
  const meta = COLUMN_META[id];

  return (
    <td
      className={cn(
        "px-4 py-4 align-top first:pl-5 last:pr-5 sm:first:pl-6",
        meta.align === "right" && "text-right",
        meta.calculated && "bg-white/[0.012]",
        meta.hide,
      )}
    >
      {children}
    </td>
  );
}

function FooterValue({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
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
