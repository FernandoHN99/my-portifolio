"use client";

import {
  ArchiveIcon,
  ArrowCounterClockwiseIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  ListChecksIcon,
  PlusIcon,
  RepeatIcon,
  UsersThreeIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import { parseAsArrayOf, parseAsBoolean, parseAsString, useQueryStates } from "nuqs";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { reopenFamilyEntryAction, settleFamilyEntriesAction, undoFamilyChangeAction, type FamilyActionResult } from "@/app/actions/family-expenses";
import { cn } from "@/lib/utils";
import type { FamilyLedger } from "@/modules/family-expenses/application/get-family-ledger";
import { formatCompetence, formatCompetenceLong, isCompetence } from "@/lib/competence";
import {
  DIRECTION_LABELS,
  DIRECTION_MEANINGS,
  displayDescription,
  signedCents,
  STATUS_LABELS,
  summarizeEntries,
  type Direction,
  type EntryStatus,
  type LedgerEntry,
  type LedgerFilters,
  type LedgerSeries,
} from "@/modules/family-expenses/domain/ledger";
import { pendingFilterActivity, resolveFamilyWorkspaceFilters, selectCompetence } from "@/modules/family-expenses/domain/filters";
import { formatCents, type Cents } from "@/lib/money";
import { EntryDialog, type EntryDialogTarget } from "@/modules/family-expenses/ui/entry-dialog";
import { FamilyBackupDialog } from "@/modules/family-expenses/ui/family-backup-dialog";
import { balanceMeaning, DirectionBadge, SignedAmount, StatusBadge } from "@/modules/family-expenses/ui/ledger-parts";
import { SettleDialog, type SettleTarget } from "@/modules/family-expenses/ui/settle-dialog";
import { headerPrimaryButtonClass } from "@/modules/portfolio/ui/edit-dialogs";
import { EditToast, type EditToastState } from "@/modules/portfolio/ui/edit-toast";
import { MultiSelectFilter } from "@/modules/portfolio/ui/multi-select-filter";
import { PositionsFilterSheet, type FilterGroup } from "@/modules/portfolio/ui/positions-filter-sheet";

// Gastos familiares: mês atual por padrão, seleção única de pessoa e meses
// únicos ou múltiplos (spec 086). A URL governa os badges, filtros e totais.

const list = parseAsArrayOf(parseAsString).withDefault([]);

const STATUS_PARAMS: Record<string, EntryStatus> = { pendente: "PENDING", acertado: "SETTLED" };
const DIRECTION_PARAMS: Record<string, Direction> = { deve: "RECEIVABLE", devo: "PAYABLE" };
const QUICK_MONTHS = 6;

type EntryDialogState = { open: boolean; target: EntryDialogTarget | null; key: number };

export function FamilyLedgerWorkspace({ ledger, menu }: { ledger: FamilyLedger; menu?: ReactNode }) {
  const [query, setQuery] = useQueryStates(
    { competencia: list, pessoa: list, status: list, tipo: list, q: parseAsString.withDefault(""), multimes: parseAsBoolean.withDefault(false) },
    { clearOnDefault: true },
  );
  const [entryDialog, setEntryDialog] = useState<EntryDialogState>({ open: false, target: null, key: 0 });
  const [settle, setSettle] = useState<{ open: boolean; target: SettleTarget | null }>({ open: false, target: null });
  const [backupOpen, setBackupOpen] = useState(false);
  const [toast, setToast] = useState<EditToastState | null>(null);
  const [isUndoing, startUndo] = useTransition();
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [, startSettling] = useTransition();
  const sequence = useRef(0);
  // Marca a página hidratada para os testes de interface (como a faixa de competências).
  const hydrated = useSyncExternalStore(subscribeNothing, isClient, isServer);

  const contacts = useMemo(() => new Map(ledger.contacts.map((contact) => [contact.id, contact.name])), [ledger.contacts]);
  const series = useMemo(() => new Map(ledger.series.map((entry) => [entry.id, entry])), [ledger.series]);
  const competences = useMemo(
    () => [...new Set([ledger.currentCompetence, ...ledger.entries.map((entry) => entry.competence)])].sort().reverse(),
    [ledger.entries, ledger.currentCompetence],
  );

  const resolved = useMemo(
    () => resolveFamilyWorkspaceFilters(ledger.entries, filtersFromQuery(query), { contacts, series }, ledger.currentCompetence),
    [ledger.entries, ledger.currentCompetence, query, contacts, series],
  );
  const { filters, entries: filtered } = resolved;
  const activity = pendingFilterActivity(ledger.entries, filters);
  const multipleMonths = query.multimes || filters.competences.length > 1;

  // Mantém URL e opções em acordo, inclusive ao voltar no histórico ou quando
  // um acerto muda os status disponíveis. Nunca fica seleção invisível ativa.
  useEffect(() => {
    const next = queryFromFilters(filters);
    if (
      query.competencia.join(",") !== next.competencia.join(",") ||
      query.pessoa.join(",") !== next.pessoa.join(",") ||
      query.status.join(",") !== next.status.join(",") ||
      query.tipo.join(",") !== next.tipo.join(",")
    ) {
      void setQuery(next);
    }
  }, [filters, query, setQuery]);

  const updateFilters = (patch: Partial<LedgerFilters>) => {
    const next = resolveFamilyWorkspaceFilters(ledger.entries, { ...filters, ...patch }, { contacts, series }, ledger.currentCompetence);
    void setQuery(queryFromFilters(next.filters));
  };
  const summary = summarizeEntries(filtered, contacts);
  const visiblePending = filtered.filter((entry) => entry.status === "PENDING");
  const groups = groupByCompetence(filtered);
  const defaultFilters = resolveFamilyWorkspaceFilters(ledger.entries, filtersFromQuery({
    competencia: [], pessoa: [], status: [], tipo: [], q: "",
  }), { contacts, series }, ledger.currentCompetence).filters;
  const filtering = JSON.stringify(queryFromFilters(filters)) !== JSON.stringify(queryFromFilters(defaultFilters)) || multipleMonths;

  const notify = useCallback((result: FamilyActionResult) => {
    setToast({
      id: ++sequence.current,
      tone: result.ok ? "success" : "error",
      message: result.message,
      undoToken: result.ok ? result.undoToken : undefined,
    });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  const undo = (token: string) =>
    startUndo(async () => {
      notify(await undoFamilyChangeAction(token));
    });

  const openCreate = () =>
    setEntryDialog((current) => ({
      open: true,
      key: current.key + 1,
      target: {
        mode: "create",
        competence: filters.competences.length === 1 ? filters.competences[0] : ledger.currentCompetence,
        contactId: filters.contacts.length === 1 ? filters.contacts[0] : null,
      },
    }));

  const openEdit = (entry: LedgerEntry) =>
    setEntryDialog((current) => ({
      open: true,
      key: current.key + 1,
      target: { mode: "edit", entry, series: entry.seriesId ? (series.get(entry.seriesId) ?? null) : null },
    }));

  useHotkeys(
    "n",
    (event) => {
      event.preventDefault();
      openCreate();
    },
    // Só com a página livre: nunca por cima de um formulário ou confirmação aberta.
    { enabled: !entryDialog.open && !settle.open && !backupOpen },
  );

  const settleOne = (entry: LedgerEntry) => {
    setSettlingId(entry.id);
    startSettling(async () => {
      notify(await settleFamilyEntriesAction({ ids: [entry.id] }));
      setSettlingId(null);
    });
  };

  const reopenOne = (entry: LedgerEntry) => {
    setSettlingId(entry.id);
    startSettling(async () => {
      notify(await reopenFamilyEntryAction({ id: entry.id }));
      setSettlingId(null);
    });
  };

  const askSettle = (title: string, entries: LedgerEntry[]) => {
    if (entries.length > 0) setSettle({ open: true, target: { title, entries } });
  };

  const chooseMonth = (value: string) =>
    updateFilters({ competences: selectCompetence(filters.competences, value, multipleMonths, ledger.currentCompetence) });

  const toggleMultipleMonths = () => {
    const next = resolveFamilyWorkspaceFilters(ledger.entries, {
      ...filters,
      competences: multipleMonths ? filters.competences.slice(-1) : filters.competences,
    }, { contacts, series }, ledger.currentCompetence);
    void setQuery({ ...queryFromFilters(next.filters), multimes: !multipleMonths });
  };

  const clearFilters = () => void setQuery({ ...queryFromFilters(defaultFilters), multimes: false });

  const filterGroups: FilterGroup[] = [
    {
      key: "competencia",
      label: "Competência",
      options: competences,
      selected: filters.competences,
      onChange: (next) => updateFilters({ competences: multipleMonths ? next : next.slice(-1) }),
      multiple: multipleMonths,
      subtle: true,
      formatOption: formatCompetence,
    },
    {
      key: "pessoa",
      label: "Pessoa",
      options: resolved.contactIds,
      selected: filters.contacts,
      onChange: (next) => updateFilters({ contacts: next.slice(-1) }),
      multiple: false,
      subtle: true,
      formatOption: (id) => contacts.get(id) ?? id,
    },
    {
      key: "status",
      subtle: true,
      label: "Status",
      options: Object.keys(STATUS_PARAMS).filter((value) => resolved.statuses.includes(STATUS_PARAMS[value])),
      selected: Object.keys(STATUS_PARAMS).filter((value) => filters.statuses.includes(STATUS_PARAMS[value])),
      onChange: (next) => updateFilters({ statuses: next.map((value) => STATUS_PARAMS[value]) }),
      formatOption: (value) => STATUS_LABELS[STATUS_PARAMS[value]],
    },
    {
      key: "tipo",
      subtle: true,
      label: "Tipo",
      options: Object.keys(DIRECTION_PARAMS).filter((value) => resolved.directions.includes(DIRECTION_PARAMS[value])),
      selected: Object.keys(DIRECTION_PARAMS).filter((value) => filters.directions.includes(DIRECTION_PARAMS[value])),
      onChange: (next) => updateFilters({ directions: next.map((value) => DIRECTION_PARAMS[value]) }),
      formatOption: (value) => `${DIRECTION_LABELS[DIRECTION_PARAMS[value]]} · ${DIRECTION_MEANINGS[DIRECTION_PARAMS[value]]}`,
    },
  ];

  const dialogs = (
    <>
      <EntryDialog
        open={entryDialog.open}
        onOpenChange={(open) => setEntryDialog((current) => ({ ...current, open }))}
        target={entryDialog.target}
        formKey={entryDialog.key}
        contacts={ledger.contacts}
        onSaved={notify}
      />
      <SettleDialog
        open={settle.open}
        onOpenChange={(open) => setSettle((current) => ({ ...current, open }))}
        target={settle.target}
        contacts={contacts}
        series={series}
        onSettled={notify}
      />
      <FamilyBackupDialog open={backupOpen} onOpenChange={setBackupOpen} />
      <EditToast toast={toast} onDismiss={dismissToast} onUndo={undo} undoing={isUndoing} />
    </>
  );

  const actions = (
    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
      <button type="button" onClick={() => setBackupOpen(true)} className={secondaryHeaderButtonClass}>
        <ArchiveIcon aria-hidden="true" className="text-primary" size={16} weight="duotone" />
        Backup
      </button>
      <button type="button" onClick={openCreate} className={headerPrimaryButtonClass} aria-keyshortcuts="n">
        <PlusIcon aria-hidden="true" size={14} weight="bold" />
        Novo lançamento
      </button>
    </div>
  );

  if (ledger.entries.length === 0) {
    return (
      <div
        data-testid="family-ledger"
        data-hydrated={hydrated || undefined}
        className="relative mx-auto w-full max-w-[1472px] px-5 py-8 sm:px-7 sm:py-10 xl:px-12 xl:py-12"
      >
        {menu}
        <div className="flex min-h-[55dvh] flex-col items-center justify-center text-center">
          <span className="grid size-12 place-items-center rounded-2xl border border-border bg-card text-primary">
            <UsersThreeIcon aria-hidden="true" size={22} weight="duotone" />
          </span>
          <h1 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">Nenhum lançamento ainda</h1>
          <div className="mt-6">{actions}</div>
        </div>
        {dialogs}
      </div>
    );
  }

  const quickMonths = [...new Set([...quickCompetences(competences, ledger.currentCompetence), ...filters.competences])].sort().reverse();
  const peopleWithReceivable = summary.people.filter((person) => person.pendingCents > 0).length;
  const peopleWithPayable = summary.people.filter((person) => person.pendingCents < 0).length;

  return (
    <div
      data-testid="family-ledger"
      data-hydrated={hydrated || undefined}
      className="relative mx-auto w-full max-w-[1472px] px-5 py-8 sm:px-7 sm:py-10 xl:px-12 xl:py-12"
    >
      <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[460px] w-[460px]" />

      <header className="flex flex-col gap-6 border-b border-border/70 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {/* O hambúrguer fica junto do título, sem faixa própria (spec 087). */}
          <div className="flex items-center gap-3">
            {menu}
            <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">Finanças</p>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-[2.65rem]">Gastos familiares</h1>
          <p className="mt-3 text-sm text-muted-foreground" data-testid="family-count">
            {ledger.entries.length} lançamentos · {ledger.contacts.length} pessoas
          </p>
        </div>
        {actions}
      </header>

      <section aria-label="Resumo" className="mt-6 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
        <BalanceCard
          label="Saldo pendente"
          cents={summary.totals.pendingCents}
          detail={`${balanceMeaning(summary.totals.pendingCents)} · ${summary.totals.pendingCount} ${summary.totals.pendingCount === 1 ? "pendente" : "pendentes"}`}
          testId="family-kpi-pending"
          emphasis
        />
        <BalanceCard
          label="A receber"
          cents={summary.totals.receivableCents}
          detail={`de ${peopleWithReceivable} ${peopleWithReceivable === 1 ? "pessoa" : "pessoas"}`}
          testId="family-kpi-receivable"
          tone="up"
        />
        <BalanceCard
          label="A pagar"
          cents={summary.totals.payableCents}
          detail={`a ${peopleWithPayable} ${peopleWithPayable === 1 ? "pessoa" : "pessoas"}`}
          testId="family-kpi-payable"
          tone="down"
        />
        <BalanceCard
          label="Acertado"
          cents={summary.totals.settledCents}
          detail={`${summary.totals.count - summary.totals.pendingCount} ${summary.totals.count - summary.totals.pendingCount === 1 ? "lançamento" : "lançamentos"}`}
          testId="family-kpi-settled"
        />
      </section>

      <section aria-label="Filtros" className="mt-6 space-y-4">
        <fieldset className="min-w-0" data-testid="family-month-badges">
          <legend className="mb-2">
            <span className="inline-flex items-center gap-2">
              <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Competência</span>
              <button
                type="button"
                aria-label="Selecionar vários meses"
                aria-pressed={multipleMonths}
                title={multipleMonths ? "Usar seleção única de mês" : "Selecionar vários meses"}
                onClick={toggleMultipleMonths}
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-lg border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 sm:size-8",
                  multipleMonths ? activeFilterBadgeClass : inactiveFilterBadgeClass,
                )}
              >
                <ListChecksIcon aria-hidden="true" size={16} weight={multipleMonths ? "bold" : "regular"} />
              </button>
            </span>
          </legend>
          <div className="flex min-w-0 items-start gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap [&::-webkit-scrollbar]:hidden">
              {quickMonths.map((competence) => (
                <button
                  key={competence}
                  type="button"
                  aria-pressed={filters.competences.includes(competence)}
                  aria-label={formatCompetenceLong(competence)}
                  title={activity.months.has(competence) ? "Há lançamentos pendentes" : "Sem pendências para esta pessoa"}
                  data-no-pending={!activity.months.has(competence)}
                  onClick={() => chooseMonth(competence)}
                  className={cn(filterBadgeClass, "font-mono", filters.competences.includes(competence) ? activeFilterBadgeClass : inactiveFilterBadgeClass)}
                >
                  {formatCompetence(competence)}
                  {!activity.months.has(competence) ? <CheckIcon aria-hidden="true" size={11} className="opacity-60" /> : null}
                </button>
              ))}
            </div>
          </div>
        </fieldset>

        {resolved.contactIds.length > 0 ? (
          <fieldset className="min-w-0" data-testid="family-person-badges">
            <legend className="mb-2 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Pessoa</legend>
            <div className="flex flex-wrap gap-2">
              {resolved.contactIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={filters.contacts.includes(id)}
                  title={activity.contacts.has(id) ? "Há lançamentos pendentes" : "Sem pendências nestes meses"}
                  data-no-pending={!activity.contacts.has(id)}
                  onClick={() => updateFilters({ contacts: [id] })}
                  className={cn(filterBadgeClass, "max-w-full", filters.contacts.includes(id) ? activeFilterBadgeClass : inactiveFilterBadgeClass)}
                >
                  <span className="truncate">{contacts.get(id)}</span>
                  {!activity.contacts.has(id) ? <CheckIcon aria-hidden="true" size={11} className="opacity-60" /> : null}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex h-10 min-w-0 flex-1 items-center sm:h-8 sm:min-w-[200px] sm:max-w-[280px]">
            <span className="sr-only">Buscar lançamento</span>
            <MagnifyingGlassIcon aria-hidden="true" className="pointer-events-none absolute left-3 text-muted-foreground sm:left-2.5" size={14} />
            <input
              type="search"
              value={query.q}
              onChange={(event) => updateFilters({ search: event.target.value })}
              placeholder="Buscar descrição ou pessoa"
              className="h-10 w-full rounded-xl border border-border bg-card/60 pr-2.5 pl-9 text-xs text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/50 sm:h-8 sm:rounded-lg sm:pl-8"
            />
          </label>

          <PositionsFilterSheet
            className="sm:hidden"
            testId="family-filter-sheet"
            groups={filterGroups}
            resultCount={filtered.length}
            resultLabel={(total) => `Ver ${total} ${total === 1 ? "lançamento" : "lançamentos"}`}
            onClear={clearFilters}
          />

          <div className="hidden sm:contents">
            {filterGroups.map((group) => (
              <MultiSelectFilter
                key={group.key}
                label={group.label}
                options={group.options}
                selected={group.selected}
                onChange={group.onChange}
                formatOption={group.formatOption}
                multiple={group.multiple}
              />
            ))}
            {filtering ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <XIcon aria-hidden="true" size={12} weight="bold" />
                Limpar filtros
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="premium-panel mt-5 overflow-hidden rounded-[24px]" aria-labelledby="family-entries-title">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4 sm:px-6">
          <div className="flex items-baseline gap-3">
            <h2 id="family-entries-title" className="text-base font-semibold tracking-[-0.025em]">
              Lançamentos
            </h2>
            <p className="text-[11px] text-muted-foreground" data-testid="family-filtered-count">
              {filtered.length} de {ledger.entries.length}
            </p>
          </div>
          {visiblePending.length > 0 ? (
            <button
              type="button"
              onClick={() => askSettle("Acertar pendentes dos filtros", visiblePending)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-semibold text-foreground outline-none transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <CheckIcon aria-hidden="true" size={12} weight="bold" />
              Acertar pendentes
            </button>
          ) : null}
        </div>
        {filtered.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">
            Nenhum lançamento corresponde aos filtros.
          </p>
        ) : (
          groups.map((group) => {
            const groupPending = group.entries.filter((entry) => entry.status === "PENDING");
            const pendingCents = groupPending.reduce((sum, entry) => sum + signedCents(entry), 0);

            return (
              <section key={group.competence} aria-labelledby={`family-month-${group.competence}`} className={cn(groups.length > 1 && "mx-3 mb-4 overflow-hidden rounded-xl border border-border/70 sm:mx-4")}>
                <div
                  className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-5 py-3.5 sm:px-6", groups.length > 1 ? "bg-primary/[0.045]" : "border-t bg-white/[0.022]")}
                  data-testid="family-month-row"
                  data-competence={group.competence}
                >
                  <h3 id={`family-month-${group.competence}`} className="text-xs font-semibold text-foreground">
                    {formatCompetenceLong(group.competence)}
                  </h3>
                  <span className="text-[10px] text-muted-foreground">
                    {group.entries.length} {group.entries.length === 1 ? "lançamento" : "lançamentos"}
                  </span>
                  <span className="ml-auto inline-flex items-baseline gap-2 text-[11px]">
                    {groupPending.length > 0 ? (
                      <>
                        <span className="text-muted-foreground">Pendente</span>
                        <SignedAmount cents={pendingCents} />
                      </>
                    ) : (
                      <span className="text-muted-foreground">Tudo acertado</span>
                    )}
                  </span>
                </div>
                <ul role="list" className="divide-y divide-border/40">
                  {group.entries.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      series={entry.seriesId ? series.get(entry.seriesId) : undefined}
                      contactName={contacts.get(entry.contactId) ?? "—"}
                      settling={settlingId !== null}
                      onOpen={() => openEdit(entry)}
                      onSettle={() => settleOne(entry)}
                      onReopen={() => reopenOne(entry)}
                    />
                  ))}
                </ul>
              </section>
            );
          })
        )}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/70 px-5 py-4 text-xs sm:px-6" data-testid="family-footer">
          <span className="text-muted-foreground">
            {filtered.length} de {ledger.entries.length} lançamentos
          </span>
          <FooterValue label="Pendente" cents={summary.totals.pendingCents} />
          <FooterValue label="Acertado" cents={summary.totals.settledCents} />
          <FooterValue label="Total" cents={summary.totals.totalCents} emphasis />
        </div>
      </section>

      {dialogs}
    </div>
  );
}

function filtersFromQuery(query: { competencia: string[]; pessoa: string[]; status: string[]; tipo: string[]; q: string }): LedgerFilters {
  return {
    competences: query.competencia.filter(isCompetence),
    contacts: query.pessoa,
    statuses: query.status.map((value) => STATUS_PARAMS[value]).filter(Boolean),
    directions: query.tipo.map((value) => DIRECTION_PARAMS[value]).filter(Boolean),
    search: query.q,
  };
}

function queryFromFilters(filters: LedgerFilters) {
  return {
    competencia: filters.competences,
    pessoa: filters.contacts,
    status: Object.keys(STATUS_PARAMS).filter((value) => filters.statuses.includes(STATUS_PARAMS[value])),
    tipo: Object.keys(DIRECTION_PARAMS).filter((value) => filters.directions.includes(DIRECTION_PARAMS[value])),
    q: filters.search,
  };
}

const subscribeNothing = () => () => {};
const isClient = () => true;
const isServer = () => false;

const filterBadgeClass = "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 sm:h-8";
const activeFilterBadgeClass = "border-primary/30 bg-primary/[0.08] text-primary";
const inactiveFilterBadgeClass = "border-border bg-card/60 text-muted-foreground hover:text-foreground";

const secondaryHeaderButtonClass =
  "inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card/70 px-3.5 text-xs font-semibold text-foreground outline-none transition-colors hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-ring/50";

function EntryRow({
  entry,
  series,
  contactName,
  settling,
  onOpen,
  onSettle,
  onReopen,
}: {
  entry: LedgerEntry;
  series: LedgerSeries | undefined;
  contactName: string;
  settling: boolean;
  onOpen: () => void;
  onSettle: () => void;
  onReopen: () => void;
}) {
  const description = displayDescription(entry, series);
  const pending = entry.status === "PENDING";

  // A linha inteira abre a edição; a descrição é o botão real, para o teclado.
  const openFromRow = (event: MouseEvent<HTMLLIElement>) => {
    if ((event.target as HTMLElement).closest("button, a")) return;
    if (window.getSelection()?.toString()) return;
    onOpen();
  };

  return (
    <li
      role="listitem"
      data-testid="family-entry-row"
      data-status={entry.status}
      onClick={openFromRow}
      className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 px-5 py-3.5 transition-colors hover:bg-white/[0.018] sm:grid-cols-[minmax(0,1fr)_minmax(8rem,0.6fr)_auto] sm:gap-4 sm:px-6"
    >
      <div className="min-w-0">
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "rounded-sm text-left text-[13px] font-medium [overflow-wrap:anywhere] underline-offset-4 outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm",
            pending ? "text-foreground/90 hover:text-foreground" : "text-foreground/65",
          )}
        >
          {description}
        </button>
        {series ? (
          <span
            title={series.kind === "MONTHLY" ? "Mensal" : "Parcelado"}
            className="ml-1.5 inline-flex translate-y-0.5 text-muted-foreground/70"
          >
            <RepeatIcon aria-hidden="true" size={12} weight="bold" />
            <span className="sr-only">{series.kind === "MONTHLY" ? "mensal" : "parcelado"}</span>
          </span>
        ) : null}
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span className="[overflow-wrap:anywhere]">{contactName}</span>
          <DirectionBadge direction={entry.direction} />
        </p>
      </div>
      <div className="text-right text-xs font-medium sm:justify-self-start sm:text-sm">
        <span className="sr-only">Saldo: </span>
        <SignedAmount cents={signedCents(entry)} className={pending ? undefined : "opacity-70"} />
      </div>
      <div className="flex items-center justify-end gap-2">
        <span className="hidden sm:inline-flex">
          <StatusBadge status={entry.status} />
        </span>
        {pending ? (
          <button
            type="button"
            onClick={onSettle}
            disabled={settling}
            aria-label={`Acertar ${description}`}
            title="Acertar"
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground outline-none transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-40"
          >
            <CheckIcon aria-hidden="true" size={13} weight="bold" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onReopen}
            disabled={settling}
            aria-label={`Reverter acerto de ${description}`}
            title="Voltar a pendente"
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground outline-none transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-40"
          >
            <ArrowCounterClockwiseIcon aria-hidden="true" size={14} />
          </button>
        )}
      </div>
    </li>
  );
}

function BalanceCard({
  label,
  cents,
  detail,
  tone,
  emphasis = false,
  testId,
}: {
  label: string;
  cents: Cents;
  detail: string;
  /** Verde da marca para receber; atenção para pagar. */
  tone?: "up" | "down";
  emphasis?: boolean;
  testId?: string;
}) {
  // Zero fica neutro: nem a receber nem a pagar.
  const color =
    cents === 0
      ? "text-foreground"
      : tone === "up" || (!tone && cents > 0)
        ? "text-primary"
        : "text-warning-foreground";

  return (
    <article className={cn("metric-card rounded-2xl p-4 sm:p-5", emphasis && "border-primary/25")}>
      <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p
        data-testid={testId}
        data-cents={cents}
        className={cn("mt-4 font-mono text-xl font-medium tracking-[-0.05em] min-[360px]:text-base min-[400px]:text-xl sm:text-2xl sm:tracking-[-0.04em]", color)}
      >
        {formatCents(cents, { signed: !tone })}
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground">{detail}</p>
    </article>
  );
}

function FooterValue({ label, cents, emphasis = false }: { label: string; cents: Cents; emphasis?: boolean }): ReactNode {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="text-[10px] tracking-[0.08em] text-muted-foreground uppercase">{label}</span>
      <span className={cn("font-mono text-sm", emphasis ? "text-primary" : "text-foreground")}>{formatCents(cents, { signed: true })}</span>
    </span>
  );
}

/**
 * Meses à vista para um toque, como a segmentação da planilha: o mês atual, os
 * anteriores com lançamentos e até dois próximos, das parcelas já geradas.
 */
function quickCompetences(competences: readonly string[], current: string) {
  const future = competences.filter((competence) => competence > current).slice(-2);
  const past = competences.filter((competence) => competence <= current);
  return [...future, ...past].slice(0, QUICK_MONTHS);
}

function groupByCompetence(entries: readonly LedgerEntry[]) {
  const groups: { competence: string; entries: LedgerEntry[] }[] = [];

  for (const entry of entries) {
    const last = groups.at(-1);
    if (last && last.competence === entry.competence) {
      last.entries.push(entry);
    } else {
      groups.push({ competence: entry.competence, entries: [entry] });
    }
  }

  return groups;
}
