import assert from "node:assert/strict";
import { test } from "node:test";

import { fullYearCompetences, pendingFilterActivity, resolveLedgerFilters, resolveFamilyWorkspaceFilters, selectCompetence } from "@/modules/family-expenses/domain/filters";
import {
  NO_FILTERS,
  type LedgerEntry,
  type LedgerFilters,
  type LedgerSeries,
} from "@/modules/family-expenses/domain/ledger";

function entry(partial: Partial<LedgerEntry> & Pick<LedgerEntry, "id">): LedgerEntry {
  return {
    competence: "2026-10",
    description: "Mercado",
    contactId: "ana",
    direction: "RECEIVABLE",
    amountCents: 1000,
    status: "PENDING",
    seriesId: null,
    installment: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

const context = {
  contacts: new Map([
    ["ana", "Ana"],
    ["bruno", "Bruno"],
    ["carol", "Carol"],
    ["zoe", "Zoé"],
    ["unused", "Pessoa sem lançamentos"],
  ]),
  series: new Map<string, LedgerSeries>([
    ["coffee", {
      id: "coffee", kind: "INSTALLMENTS", description: "Café", direction: "RECEIVABLE",
      amountCents: 1000, firstCompetence: "2026-08", count: 3, contactId: "ana",
    }],
  ]),
};

const entries = [
  entry({ id: "oct-bruno", contactId: "bruno", direction: "PAYABLE", status: "SETTLED" }),
  entry({ id: "oct-ana-pending", description: "Café", seriesId: "coffee", installment: 3 }),
  entry({ id: "oct-ana-settled", direction: "PAYABLE", status: "SETTLED" }),
  entry({ id: "sep-bruno", competence: "2026-09", contactId: "bruno", direction: "PAYABLE" }),
  entry({ id: "sep-carol", competence: "2026-09", contactId: "carol", status: "SETTLED" }),
  entry({ id: "nov-zoe", competence: "2026-11", contactId: "zoe" }),
];

test("competência limita as pessoas; filtros posteriores não escondem alternativas anteriores", () => {
  const state = resolveLedgerFilters(entries, {
    ...NO_FILTERS,
    competences: ["2026-10"],
    contacts: ["ana"],
    statuses: ["PENDING"],
    directions: ["RECEIVABLE"],
  }, context);

  assert.deepEqual(state.contactIds, ["ana", "bruno"]);
  assert.deepEqual(state.statuses, ["PENDING", "SETTLED"]);
  assert.deepEqual(state.directions, ["RECEIVABLE"]);
  assert.deepEqual(state.entries.map((row) => row.id), ["oct-ana-pending"]);
});

test("trocar competência preserva pessoas válidas e remove seleções sem dados em cada etapa", () => {
  const state = resolveLedgerFilters(entries, {
    ...NO_FILTERS,
    competences: ["2026-10"],
    contacts: ["carol", "bruno"],
    statuses: ["PENDING", "SETTLED"],
    directions: ["RECEIVABLE", "PAYABLE"],
  }, context);

  assert.deepEqual(state.filters.contacts, ["bruno"]);
  assert.deepEqual(state.statuses, ["SETTLED"]);
  assert.deepEqual(state.filters.statuses, ["SETTLED"]);
  assert.deepEqual(state.directions, ["PAYABLE"]);
  assert.deepEqual(state.filters.directions, ["PAYABLE"]);
  assert.deepEqual(state.entries.map((row) => row.id), ["oct-bruno"]);
});

test("status sem correspondência é removido antes de calcular os tipos disponíveis", () => {
  const state = resolveLedgerFilters(entries, {
    ...NO_FILTERS,
    competences: ["2026-10"],
    contacts: ["bruno"],
    statuses: ["PENDING"],
    directions: ["RECEIVABLE"],
  }, context);

  assert.deepEqual(state.filters.statuses, []);
  assert.deepEqual(state.directions, ["PAYABLE"]);
  assert.deepEqual(state.filters.directions, []);
  assert.deepEqual(state.entries.map((row) => row.id), ["oct-bruno"]);
});

test("multisseleção combina meses e pessoas antes de limitar status e tipos", () => {
  const state = resolveLedgerFilters(entries, {
    ...NO_FILTERS,
    competences: ["2026-09", "2026-10"],
    contacts: ["ana", "bruno"],
    statuses: ["PENDING"],
    directions: ["RECEIVABLE", "PAYABLE"],
  }, context);

  assert.deepEqual(state.contactIds, ["ana", "bruno", "carol"]);
  assert.deepEqual(state.filters.contacts, ["ana", "bruno"]);
  assert.deepEqual(state.statuses, ["PENDING", "SETTLED"]);
  assert.deepEqual(state.directions, ["RECEIVABLE", "PAYABLE"]);
  assert.deepEqual(state.entries.map((row) => row.id), ["oct-ana-pending", "sep-bruno"]);
});

test("busca restringe as opções usando os mesmos nomes, acentos e parcelas da lista", () => {
  const byDescription = resolveLedgerFilters(entries, { ...NO_FILTERS, search: "  CAFE (3/3) " }, context);
  assert.deepEqual(byDescription.contactIds, ["ana"]);
  assert.deepEqual(byDescription.statuses, ["PENDING"]);
  assert.deepEqual(byDescription.directions, ["RECEIVABLE"]);
  assert.deepEqual(byDescription.entries.map((row) => row.id), ["oct-ana-pending"]);

  const byName = resolveLedgerFilters(entries, { ...NO_FILTERS, search: "zoe" }, context);
  assert.deepEqual(byName.contactIds, ["zoe"]);
  assert.deepEqual(byName.entries.map((row) => row.id), ["nov-zoe"]);
});

test("nenhum resultado mantém competência e busca, mas esvazia as opções dependentes", () => {
  for (const upstream of [{ competences: ["2027-01"], search: "" }, { competences: ["2026-10"], search: "inexistente" }]) {
    const state = resolveLedgerFilters(entries, {
      ...NO_FILTERS,
      ...upstream,
      contacts: ["ana"],
      statuses: ["PENDING"],
      directions: ["RECEIVABLE"],
    }, context);

    assert.deepEqual(state.filters, { ...NO_FILTERS, ...upstream });
    assert.deepEqual(state.contactIds, []);
    assert.deepEqual(state.statuses, []);
    assert.deepEqual(state.directions, []);
    assert.deepEqual(state.entries, []);
  }
});

test("livro vazio não oferece pessoas sem lançamentos nem altera os filtros recebidos", () => {
  const filters: LedgerFilters = {
    ...NO_FILTERS,
    competences: ["2026-10"],
    contacts: ["ana"],
    statuses: ["PENDING"],
    directions: ["RECEIVABLE"],
  };
  const original = structuredClone(filters);
  const state = resolveLedgerFilters([], filters, context);

  assert.deepEqual(state.filters, { ...NO_FILTERS, competences: ["2026-10"] });
  assert.deepEqual(state.contactIds, []);
  assert.deepEqual(state.statuses, []);
  assert.deepEqual(state.directions, []);
  assert.deepEqual(state.entries, []);
  assert.deepEqual(filters, original);
});

test("tela abre no mês atual e na primeira pessoa em ordem alfabética", () => {
  const state = resolveFamilyWorkspaceFilters(entries, NO_FILTERS, context, "2026-10");
  assert.deepEqual(state.filters.competences, ["2026-10"]);
  assert.deepEqual(state.contactIds, ["ana", "bruno"]);
  assert.deepEqual(state.filters.contacts, ["ana"]);
  assert.deepEqual(state.entries.map((entry) => entry.id), ["oct-ana-pending", "oct-ana-settled"]);
});

test("uma única pessoa é mantida entre meses; se ausente, seleciona a primeira disponível", () => {
  const october = resolveFamilyWorkspaceFilters(entries, {
    ...NO_FILTERS, competences: ["2026-10"], contacts: ["bruno", "ana"],
  }, context, "2026-10");
  assert.deepEqual(october.filters.contacts, ["bruno"]);
  const september = resolveFamilyWorkspaceFilters(entries, {
    ...october.filters, competences: ["2026-09"],
  }, context, "2026-10");
  assert.deepEqual(september.filters.contacts, ["bruno"]);
  const november = resolveFamilyWorkspaceFilters(entries, {
    ...september.filters, competences: ["2026-11"],
  }, context, "2026-10");
  assert.deepEqual(november.filters.contacts, ["zoe"]);
});

test("busca sem resultado mantém pessoa e alternativas; nunca mostra lançamentos de outra", () => {
  const state = resolveFamilyWorkspaceFilters(entries, {
    ...NO_FILTERS, contacts: ["bruno"], search: "cafe",
  }, context, "2026-10");
  assert.deepEqual(state.filters.contacts, ["bruno"]);
  assert.deepEqual(state.contactIds, ["ana", "bruno"]);
  assert.deepEqual(state.entries, []);
});

test("mês atual sem dados não volta a meses antigos nem inventa uma pessoa", () => {
  const state = resolveFamilyWorkspaceFilters(entries, NO_FILTERS, context, "2027-01");
  assert.deepEqual(state.filters.competences, ["2027-01"]);
  assert.deepEqual(state.contactIds, []);
  assert.deepEqual(state.filters.contacts, []);
  assert.deepEqual(state.entries, []);
});

test("faixa inclui os doze meses dos anos escolhidos, inclusive vazios e históricos (spec 091)", () => {
  const months = fullYearCompetences(["2026-10", "2026-03", "2025-12"]);
  assert.equal(months.length, 24);
  assert.equal(months[0], "2026-12");
  assert.equal(months[11], "2026-01");
  assert.equal(months[12], "2025-12");
  assert.equal(months[23], "2025-01");
  assert.equal(new Set(months).size, 24);
});

test("meses múltiplos somam somente os lançamentos da pessoa selecionada", () => {
  const state = resolveFamilyWorkspaceFilters(entries, {
    ...NO_FILTERS, competences: ["2026-09", "2026-10"], contacts: ["bruno"],
  }, context, "2026-10");
  assert.deepEqual(state.filters.contacts, ["bruno"]);
  assert.deepEqual(state.entries.map((entry) => entry.id), ["oct-bruno", "sep-bruno"]);
});

test("seleção de competência alterna único/múltiplo e nunca fica vazia", () => {
  assert.deepEqual(selectCompetence(["2026-10"], "2026-09", false, "2026-10"), ["2026-09"]);
  assert.deepEqual(selectCompetence(["2026-10"], "2026-10", false, "2026-10"), ["2026-10"]);
  assert.deepEqual(selectCompetence(["2026-10"], "2026-09", true, "2026-10"), ["2026-10", "2026-09"]);
  assert.deepEqual(selectCompetence(["2026-10", "2026-09"], "2026-10", true, "2026-10"), ["2026-09"]);
  assert.deepEqual(selectCompetence(["2026-09"], "2026-09", true, "2026-10"), ["2026-10"]);
});


test("indicadores consideram pendências por pessoa/mês, mesmo quando os valores se anulam", () => {
  const activity = pendingFilterActivity([...entries, entry({ id: "cancel", direction: "PAYABLE" })], {
    competences: ["2026-10"], contacts: ["bruno"],
  });
  assert.deepEqual([...activity.months], ["2026-09"]);
  assert.deepEqual([...activity.contacts], ["ana"]);
  assert.equal(activity.months.has("2026-10"), false);
  assert.equal(activity.contacts.has("bruno"), false);
});
