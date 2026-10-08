import {
  DIRECTIONS,
  filterEntries,
  NO_FILTERS,
  STATUSES,
  type LedgerEntry,
  type LedgerFilters,
  type LedgerSeries,
} from "@/modules/family-expenses/domain/ledger";

/**
 * Competência → pessoa → status → tipo. Cada lista considera só a busca e
 * os filtros anteriores; suas próprias seleções não escondem alternativas.
 * Ao mudar um filtro anterior, preserva as seleções que continuam disponíveis.
 * Competências permanecem intactas, inclusive quando não há lançamentos.
 */
export function resolveLedgerFilters(
  entries: readonly LedgerEntry[],
  filters: LedgerFilters,
  context: { contacts: ReadonlyMap<string, string>; series: ReadonlyMap<string, LedgerSeries> },
) {
  const byCompetence = filterEntries(
    entries,
    { ...NO_FILTERS, competences: filters.competences, search: filters.search },
    context,
  );
  const contactIds = [...new Set(byCompetence.map((entry) => entry.contactId))].sort((left, right) =>
    (context.contacts.get(left) ?? left).localeCompare(context.contacts.get(right) ?? right, "pt-BR"),
  );
  const availableContacts = new Set(contactIds);
  const contacts = filters.contacts.filter((id) => availableContacts.has(id));
  const byContact = filterEntries(byCompetence, { ...NO_FILTERS, contacts }, context);

  const availableStatuses = new Set(byContact.map((entry) => entry.status));
  const statuses = STATUSES.filter((status) => availableStatuses.has(status));
  const selectedStatuses = filters.statuses.filter((status) => availableStatuses.has(status));
  const byStatus = filterEntries(byContact, { ...NO_FILTERS, statuses: selectedStatuses }, context);

  const availableDirections = new Set(byStatus.map((entry) => entry.direction));
  const directions = DIRECTIONS.filter((direction) => availableDirections.has(direction));
  const selectedDirections = filters.directions.filter((direction) => availableDirections.has(direction));

  return {
    filters: { ...filters, contacts, statuses: selectedStatuses, directions: selectedDirections },
    contactIds,
    statuses,
    directions,
    entries: filterEntries(byStatus, { ...NO_FILTERS, directions: selectedDirections }, context),
  };
}

/**
 * A tela abre no mês atual e sempre representa uma pessoa (spec 086).
 * A busca não troca a pessoa: sem correspondência, a lista fica vazia.
 * As alternativas de pessoa dependem apenas das competências selecionadas
 * (competência → pessoa → status → tipo; mantido na spec 091).
 */
export function resolveFamilyWorkspaceFilters(
  entries: readonly LedgerEntry[],
  filters: LedgerFilters,
  context: { contacts: ReadonlyMap<string, string>; series: ReadonlyMap<string, LedgerSeries> },
  currentCompetence: string,
) {
  const competences = filters.competences.length > 0 ? filters.competences : [currentCompetence];
  const monthState = resolveLedgerFilters(entries, { ...NO_FILTERS, competences }, context);
  const contactId = filters.contacts.find((id) => monthState.contactIds.includes(id)) ?? monthState.contactIds[0];
  const contacts = contactId ? [contactId] : [];
  const state = resolveLedgerFilters(
    monthState.entries.filter((entry) => entry.contactId === contactId),
    { ...filters, competences, contacts },
    context,
  );

  return { ...state, contactIds: monthState.contactIds, filters: { ...state.filters, contacts } };
}

/** Doze meses para cada ano representado, inclusive meses sem lançamentos. */
export function fullYearCompetences(competences: readonly string[]) {
  const years = [...new Set(competences.map((competence) => competence.slice(0, 4)))].sort().reverse();
  return years.flatMap((year) => Array.from({ length: 12 }, (_, index) => `${year}-${String(12 - index).padStart(2, "0")}`));
}

/** Ao retirar o último mês, volta ao atual; no modo único, cada clique troca. */
export function selectCompetence(selected: string[], value: string, multiple: boolean, current: string) {
  if (!multiple) return [value];
  const next = selected.includes(value) ? selected.filter((month) => month !== value) : [...selected, value];
  return next.length > 0 ? next : [current];
}

/** Pendências reais, sem esconder trabalho por busca, status ou tipo. */
export function pendingFilterActivity(entries: readonly LedgerEntry[], filters: Pick<LedgerFilters, "competences" | "contacts">) {
  const months = new Set<string>();
  const contacts = new Set<string>();
  for (const entry of entries) {
    if (entry.status !== "PENDING") continue;
    if (filters.contacts.includes(entry.contactId)) months.add(entry.competence);
    if (filters.competences.includes(entry.competence)) contacts.add(entry.contactId);
  }
  return { months, contacts };
}
