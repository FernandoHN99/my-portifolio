import type { Competence } from "@/modules/family-expenses/domain/competence";
import type { Cents } from "@/modules/family-expenses/domain/money";

// Livro de Gastos familiares (spec 082): quem deve a quem. Cada lançamento tem
// valor positivo; o saldo é derivado do tipo (DEVE soma, DEVO subtrai) e nunca
// guardado. Os filtros combinam competência, pessoa, status e tipo, cada um com
// vários valores, e governam igualmente a lista e os resumos.

export type Direction = "RECEIVABLE" | "PAYABLE";
export type EntryStatus = "PENDING" | "SETTLED";
export type SeriesKind = "INSTALLMENTS" | "MONTHLY";

export const DIRECTIONS: readonly Direction[] = ["RECEIVABLE", "PAYABLE"];
export const STATUSES: readonly EntryStatus[] = ["PENDING", "SETTLED"];

/** Os nomes da planilha: DEVE e DEVO, OK e NOK. */
export const DIRECTION_LABELS: Record<Direction, string> = { RECEIVABLE: "Deve", PAYABLE: "Devo" };
export const DIRECTION_MEANINGS: Record<Direction, string> = {
  RECEIVABLE: "a pessoa me deve",
  PAYABLE: "eu devo à pessoa",
};
export const STATUS_LABELS: Record<EntryStatus, string> = { PENDING: "Pendente", SETTLED: "Acertado" };

export type LedgerSeries = {
  id: string;
  kind: SeriesKind;
  description: string;
  direction: Direction;
  amountCents: Cents;
  firstCompetence: Competence;
  count: number;
  contactId: string;
};

export type LedgerEntry = {
  id: string;
  competence: Competence;
  description: string;
  contactId: string;
  direction: Direction;
  amountCents: Cents;
  status: EntryStatus;
  seriesId: string | null;
  installment: number | null;
  createdAt: string;
};

export type LedgerContact = { id: string; name: string };

export type LedgerFilters = {
  competences: Competence[];
  contacts: string[];
  statuses: EntryStatus[];
  directions: Direction[];
  search: string;
};

export const NO_FILTERS: LedgerFilters = { competences: [], contacts: [], statuses: [], directions: [], search: "" };

export function signedCents(entry: Pick<LedgerEntry, "direction" | "amountCents">): Cents {
  return entry.direction === "RECEIVABLE" ? entry.amountCents : -entry.amountCents;
}

/**
 * Descrição mostrada: as parcelas de uma série parcelada levam "(i/N)", com o
 * total atual da série. Lançamentos sem série mostram o texto como foi gravado,
 * inclusive os "(1/2)" trazidos da planilha.
 */
export function displayDescription(entry: Pick<LedgerEntry, "description" | "installment">, series: LedgerSeries | undefined) {
  return series?.kind === "INSTALLMENTS" && entry.installment !== null
    ? `${entry.description} (${entry.installment}/${series.count})`
    : entry.description;
}

export function normalizeText(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

export function hasFilters(filters: LedgerFilters) {
  return (
    filters.competences.length + filters.contacts.length + filters.statuses.length + filters.directions.length > 0 ||
    filters.search.trim() !== ""
  );
}

/** Os lançamentos que passam por todos os filtros ativos. */
export function filterEntries(
  entries: readonly LedgerEntry[],
  filters: LedgerFilters,
  context: { contacts: ReadonlyMap<string, string>; series: ReadonlyMap<string, LedgerSeries> },
) {
  const competences = new Set(filters.competences);
  const contacts = new Set(filters.contacts);
  const statuses = new Set(filters.statuses);
  const directions = new Set(filters.directions);
  const search = normalizeText(filters.search);

  return entries.filter((entry) => {
    if (competences.size > 0 && !competences.has(entry.competence)) return false;
    if (contacts.size > 0 && !contacts.has(entry.contactId)) return false;
    if (statuses.size > 0 && !statuses.has(entry.status)) return false;
    if (directions.size > 0 && !directions.has(entry.direction)) return false;

    if (search) {
      const series = entry.seriesId ? context.series.get(entry.seriesId) : undefined;
      const text = `${displayDescription(entry, series)} ${context.contacts.get(entry.contactId) ?? ""}`;
      if (!normalizeText(text).includes(search)) return false;
    }

    return true;
  });
}

export type Balance = { pendingCents: Cents; settledCents: Cents; totalCents: Cents };

export type PersonBalance = Balance & {
  contactId: string;
  name: string;
  count: number;
  pendingCount: number;
};

export type LedgerSummary = {
  people: PersonBalance[];
  totals: Balance & {
    count: number;
    pendingCount: number;
    /** Soma dos saldos pendentes positivos por pessoa: o que tenho a receber. */
    receivableCents: Cents;
    /** Soma dos saldos pendentes negativos por pessoa, em módulo: o que tenho a pagar. */
    payableCents: Cents;
  };
};

/**
 * Saldo por pessoa como a tabela dinâmica da planilha: Pendente (NOK), Acertado
 * (OK) e Total, a soma assinada dos lançamentos recebidos (já filtrados). As
 * pessoas vêm pelo maior saldo pendente em módulo e, empatadas, pelo nome.
 */
export function summarizeEntries(entries: readonly LedgerEntry[], contacts: ReadonlyMap<string, string>): LedgerSummary {
  const byContact = new Map<string, PersonBalance>();

  for (const entry of entries) {
    const signed = signedCents(entry);
    const person =
      byContact.get(entry.contactId) ??
      byContact
        .set(entry.contactId, {
          contactId: entry.contactId,
          name: contacts.get(entry.contactId) ?? "—",
          pendingCents: 0,
          settledCents: 0,
          totalCents: 0,
          count: 0,
          pendingCount: 0,
        })
        .get(entry.contactId)!;

    person.count += 1;
    person.totalCents += signed;

    if (entry.status === "PENDING") {
      person.pendingCents += signed;
      person.pendingCount += 1;
    } else {
      person.settledCents += signed;
    }
  }

  const people = [...byContact.values()].sort(
    (left, right) =>
      Math.abs(right.pendingCents) - Math.abs(left.pendingCents) || left.name.localeCompare(right.name, "pt-BR"),
  );

  const totals = people.reduce(
    (sum, person) => ({
      pendingCents: sum.pendingCents + person.pendingCents,
      settledCents: sum.settledCents + person.settledCents,
      totalCents: sum.totalCents + person.totalCents,
      count: sum.count + person.count,
      pendingCount: sum.pendingCount + person.pendingCount,
      receivableCents: sum.receivableCents + Math.max(person.pendingCents, 0),
      payableCents: sum.payableCents + Math.max(-person.pendingCents, 0),
    }),
    { pendingCents: 0, settledCents: 0, totalCents: 0, count: 0, pendingCount: 0, receivableCents: 0, payableCents: 0 },
  );

  return { people, totals };
}

/** Ordem da tabela: competência mais recente primeiro e, no mês, a de inclusão. */
export function compareEntries(left: LedgerEntry, right: LedgerEntry) {
  return (
    right.competence.localeCompare(left.competence) ||
    left.createdAt.localeCompare(right.createdAt) ||
    (left.installment ?? 0) - (right.installment ?? 0) ||
    left.id.localeCompare(right.id)
  );
}
