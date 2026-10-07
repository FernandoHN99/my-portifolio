import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { addCompetenceMonths, formatCompetence } from "@/modules/family-expenses/domain/competence";
import {
  displayDescription,
  filterEntries,
  NO_FILTERS,
  summarizeEntries,
  type LedgerEntry,
  type LedgerSeries,
} from "@/modules/family-expenses/domain/ledger";
import { centsToDecimal, decimalToCents, formatCents, parseAmountInput } from "@/modules/family-expenses/domain/money";
import { planSeriesEdit, plannedEntries } from "@/modules/family-expenses/domain/series";
import {
  convertSourceRows,
  identicalRows,
  parseSourceMoney,
  parseSourceMonth,
  parseSourceSheet,
} from "@/modules/family-expenses/domain/source-sheet";

// Specs 082 a 084: dinheiro exato, filtros e resumo, séries e leitura da
// planilha. Dados fictícios, exceto a conferência do arquivo real, que só roda
// quando ele existe na máquina (fica fora do Git).

test("valores digitados viram centavos exatos, sem ponto flutuante", () => {
  assert.equal(parseAmountInput("1.234,56"), 123456);
  assert.equal(parseAmountInput("1234,56"), 123456);
  assert.equal(parseAmountInput("1234.56"), 123456);
  assert.equal(parseAmountInput("R$ 15"), 1500);
  assert.equal(parseAmountInput("0,5"), 50);
  assert.equal(parseAmountInput("1.234"), 123400);
  assert.equal(parseAmountInput("0,1"), 10);
  assert.equal(parseAmountInput("-5"), null);
  assert.equal(parseAmountInput("1,234"), null);
  assert.equal(parseAmountInput("abc"), null);
  assert.equal(parseAmountInput(""), null);
  // 0,1 + 0,2 em centavos é exatamente 0,3.
  assert.equal(parseAmountInput("0,1")! + parseAmountInput("0,2")!, parseAmountInput("0,3"));
});

test("decimais do banco e do backup em centavos, nos dois sentidos", () => {
  assert.equal(decimalToCents("16"), 1600);
  assert.equal(decimalToCents("920.14"), 92014);
  assert.equal(decimalToCents("-15.28"), -1528);
  assert.equal(decimalToCents("0.5"), 50);
  assert.throws(() => decimalToCents("1.234"));
  assert.equal(centsToDecimal(92014), "920.14");
  assert.equal(centsToDecimal(5), "0.05");
  assert.equal(centsToDecimal(-1528), "-15.28");
  assert.equal(formatCents(-1528), "−R$ 15,28");
  assert.equal(formatCents(1528, { signed: true }), "+R$ 15,28");
});

test("competências somam meses sem depender do fuso", () => {
  assert.equal(addCompetenceMonths("2026-11", 2), "2027-01");
  assert.equal(addCompetenceMonths("2026-01", -1), "2025-12");
  assert.equal(formatCompetence("2026-10"), "Out/26");
});

const contacts = new Map([
  ["sandra", "Sandra"],
  ["marcela", "Marcela"],
]);

function entry(partial: Partial<LedgerEntry> & Pick<LedgerEntry, "id">): LedgerEntry {
  return {
    competence: "2026-10",
    description: "Gasto",
    contactId: "sandra",
    direction: "RECEIVABLE",
    amountCents: 1000,
    status: "PENDING",
    seriesId: null,
    installment: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

const sample = [
  entry({ id: "1", amountCents: 69688 }),
  entry({ id: "2", contactId: "marcela", amountCents: 4600 }),
  entry({ id: "3", direction: "PAYABLE", amountCents: 18700, status: "SETTLED" }),
  entry({ id: "4", competence: "2026-09", amountCents: 3300 }),
  entry({ id: "5", competence: "2026-09", contactId: "marcela", direction: "PAYABLE", amountCents: 1000 }),
];

test("resumo por pessoa: pendente, acertado e total assinados, com a receber e a pagar", () => {
  const summary = summarizeEntries(sample, contacts);
  const sandra = summary.people.find((person) => person.name === "Sandra")!;
  const marcela = summary.people.find((person) => person.name === "Marcela")!;

  assert.deepEqual(
    { pending: sandra.pendingCents, settled: sandra.settledCents, total: sandra.totalCents },
    { pending: 72988, settled: -18700, total: 54288 },
  );
  assert.deepEqual({ pending: marcela.pendingCents, total: marcela.totalCents }, { pending: 3600, total: 3600 });
  assert.equal(summary.totals.pendingCents, 76588);
  assert.equal(summary.totals.receivableCents, 76588);
  assert.equal(summary.totals.payableCents, 0);
  assert.equal(summary.people[0].name, "Sandra");
});

test("filtros combinados com vários valores governam a lista e os resumos", () => {
  const context = { contacts, series: new Map<string, LedgerSeries>() };
  const october = filterEntries(sample, { ...NO_FILTERS, competences: ["2026-10"] }, context);
  assert.deepEqual(october.map((row) => row.id), ["1", "2", "3"]);

  const pendingBoth = filterEntries(sample, { ...NO_FILTERS, competences: ["2026-09", "2026-10"], statuses: ["PENDING"] }, context);
  assert.equal(summarizeEntries(pendingBoth, contacts).totals.pendingCents, 69688 + 4600 + 3300 - 1000);

  // O filtro de tipo vale também para os indicadores: só DEVO.
  const payable = filterEntries(sample, { ...NO_FILTERS, directions: ["PAYABLE"] }, context);
  const summary = summarizeEntries(payable, contacts);
  assert.equal(summary.totals.totalCents, -18700 - 1000);
  assert.equal(summary.totals.payableCents, 1000);

  const nothing = filterEntries(sample, { ...NO_FILTERS, contacts: ["marcela"], statuses: ["SETTLED"] }, context);
  assert.equal(nothing.length, 0);
  assert.deepEqual(summarizeEntries(nothing, contacts).totals, {
    pendingCents: 0,
    settledCents: 0,
    totalCents: 0,
    count: 0,
    pendingCount: 0,
    receivableCents: 0,
    payableCents: 0,
  });

  const search = filterEntries(sample, { ...NO_FILTERS, search: "marcéla" }, context);
  assert.deepEqual(search.map((row) => row.id), ["2", "5"]);
});

test("séries geram todos os meses e numeram as parcelas", () => {
  const months = plannedEntries("2026-11", 3);
  assert.deepEqual(months, [
    { installment: 1, competence: "2026-11" },
    { installment: 2, competence: "2026-12" },
    { installment: 3, competence: "2027-01" },
  ]);
  const series: LedgerSeries = {
    id: "s",
    kind: "INSTALLMENTS",
    description: "Bicicleta",
    direction: "RECEIVABLE",
    amountCents: 15000,
    firstCompetence: "2026-11",
    count: 12,
    contactId: "sandra",
  };
  assert.equal(displayDescription({ description: "Bicicleta", installment: 6 }, series), "Bicicleta (6/12)");
  assert.equal(displayDescription({ description: "Spotify", installment: 2 }, { ...series, kind: "MONTHLY" }), "Spotify");
  assert.equal(displayDescription({ description: "Geladeira (1/2)", installment: null }, undefined), "Geladeira (1/2)");
});

test("editar a série muda só os pendentes e protege os acertados", () => {
  const members = [
    { id: "a", installment: 1, status: "SETTLED" as const },
    { id: "b", installment: 2, status: "SETTLED" as const },
    { id: "c", installment: 3, status: "PENDING" as const },
    { id: "d", installment: 4, status: "PENDING" as const },
  ];
  const previous = { firstCompetence: "2026-08", count: 4 };

  const grow = planSeriesEdit(members, previous, { firstCompetence: "2026-08", count: 6 });
  assert.ok(grow.ok);
  assert.deepEqual(grow.update.map((entry) => [entry.id, entry.competence]), [["c", "2026-10"], ["d", "2026-11"]]);
  assert.deepEqual(grow.create, [
    { installment: 5, competence: "2026-12" },
    { installment: 6, competence: "2027-01" },
  ]);
  assert.deepEqual(grow.remove, []);

  const shrink = planSeriesEdit(members, previous, { firstCompetence: "2026-08", count: 3 });
  assert.ok(shrink.ok);
  assert.deepEqual(shrink.remove, ["d"]);

  const belowSettled = planSeriesEdit(members, previous, { firstCompetence: "2026-08", count: 1 });
  assert.equal(belowSettled.ok, false);

  const moved = planSeriesEdit(members, previous, { firstCompetence: "2026-09", count: 4 });
  assert.equal(moved.ok, false);

  // Sem acertados, o mês inicial muda e os pendentes andam junto.
  const allPending = members.map((member) => ({ ...member, status: "PENDING" as const }));
  const shifted = planSeriesEdit(allPending, previous, { firstCompetence: "2026-09", count: 4 });
  assert.ok(shifted.ok);
  assert.equal(shifted.update[0].competence, "2026-09");

  // Um número excluído antes não volta ao editar.
  const withGap = members.filter((member) => member.id !== "c");
  const regrow = planSeriesEdit(withGap, previous, { firstCompetence: "2026-08", count: 5 });
  assert.ok(regrow.ok);
  assert.deepEqual(regrow.create.map((entry) => entry.installment), [5]);
});

test("leitura da planilha: meses em inglês, moeda brasileira e problemas sem descarte", () => {
  assert.equal(parseSourceMonth("Oct/23"), "2023-10");
  assert.equal(parseSourceMonth("Feb/26"), "2026-02");
  assert.equal(parseSourceMonth("Out/23"), null);
  assert.equal(parseSourceMoney(" R$ 1.234,56 "), 123456);
  assert.equal(parseSourceMoney("-R$ 187,00 "), -18700);
  assert.equal(parseSourceMoney("R$ 7,29"), 729);
  assert.equal(parseSourceMoney("7,29"), null);

  const text = [
    "Data\tNome\tPessoa\tTipo\tValor\tSaldo\tStatus",
    "Oct/23\tAveia\tSandra\tDEVE\t R$ 16,00 \t R$ 16,00 \tOK",
    "Jul/24\tGasolina\tMarcela\tDEVE\t-R$ 15,28 \t-R$ 15,28 \tOK",
    "Aug/25\tCigarro\tPapai\tDEVE\t R$ 12,50 \t R$ 12,50 \tOK",
    "Aug/25\tCigarro\tPapai\tDEVE\t R$ 12,50 \t R$ 12,50 \tOK",
    "Sep/26\tErrado\tVovó\tDEVO\t R$ 10,00 \t R$ 10,00 \tNOK",
    "",
  ].join("\n");
  const parsed = parseSourceSheet(text);
  assert.equal(parsed.rows.length, 5);
  assert.deepEqual(identicalRows(parsed.rows), [[4, 5]]);

  const undecided = convertSourceRows(parsed.rows, []);
  assert.deepEqual(undecided.issues.map((issue) => issue.line), [3, 6]);

  const decided = convertSourceRows(parsed.rows, [
    { line: 3, competence: "2024-07", description: "Gasolina", person: "Marcela", sourceType: "DEVE", valueCents: -1528 },
  ]);
  const gasoline = decided.converted.find((row) => row.line === 3)!;
  assert.deepEqual([gasoline.direction, gasoline.amountCents, gasoline.decision], ["PAYABLE", 1528, "swap-direction"]);
  assert.deepEqual(decided.issues.map((issue) => issue.line), [6]);

  // A decisão vale só para a linha descrita.
  const otherLine = convertSourceRows(parsed.rows, [
    { line: 9, competence: "2024-07", description: "Gasolina", person: "Marcela", sourceType: "DEVE", valueCents: -1528 },
  ]);
  assert.ok(otherLine.issues.some((issue) => issue.line === 3));
});

const SOURCE = "backups/gastos-familia/gastos-familia-dados-corretos-2026-10-07.txt";

test("arquivo correto: 494 lançamentos e os pendentes de set/26 e out/26 da planilha", { skip: !existsSync(SOURCE) }, () => {
  const parsed = parseSourceSheet(readFileSync(SOURCE, "utf8"));
  const { converted, issues } = convertSourceRows(parsed.rows, [
    { line: 168, competence: "2024-07", description: "Gasolina", person: "Marcela", sourceType: "DEVE", valueCents: -1528 },
    { line: 296, competence: "2025-04", description: "Gasolina Corolla", person: "Sandra", sourceType: "DEVO", valueCents: -3150 },
  ]);
  assert.equal(parsed.issues.length, 0);
  assert.equal(issues.length, 0);
  assert.equal(converted.length, 494);
  assert.equal(new Set(converted.map((row) => row.person)).size, 11);
  assert.equal(new Set(converted.map((row) => row.competence)).size, 37);
  assert.deepEqual(identicalRows(parsed.rows), [
    [328, 329],
    [396, 397],
  ]);

  const ledger: LedgerEntry[] = converted.map((row) => ({
    id: String(row.line),
    competence: row.competence,
    description: row.description,
    contactId: row.person,
    direction: row.direction,
    amountCents: row.amountCents,
    status: row.status,
    seriesId: null,
    installment: null,
    createdAt: String(row.line).padStart(4, "0"),
  }));
  const names = new Map(converted.map((row) => [row.person, row.person]));
  const pendingIn = (competence: string) =>
    Object.fromEntries(
      summarizeEntries(
        filterEntries(ledger, { ...NO_FILTERS, competences: [competence], statuses: ["PENDING"] }, { contacts: names, series: new Map() }),
        names,
      ).people.map((person) => [person.name, person.pendingCents]),
    );

  assert.deepEqual(pendingIn("2026-09"), { Vovó: 15500, Martina: 7390, Papai: 3850, Marcela: 4600, Sandra: 3300 });
  assert.deepEqual(pendingIn("2026-10"), { Sandra: 69688, Martina: 9600, Marcela: 4600 });

  // Saldo de cada linha igual ao da planilha, inclusive nas duas decididas.
  for (const row of converted) {
    assert.equal(row.direction === "RECEIVABLE" ? row.amountCents : -row.amountCents, row.balanceCents);
  }
});
