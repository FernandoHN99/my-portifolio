import assert from "node:assert/strict";
import { test } from "node:test";

import {
  coversWholeMonth,
  dailyRateCents,
  daysWorked,
  defaultTaxable,
  incomeYears,
  monthBounds,
  monthTotals,
  payslipIncomeCents,
  payslipName,
  payslipProblem,
  savingsRatePercent,
  summarizeYear,
  taxableIncomeCents,
  type IncomeMonth,
  type Payslip,
} from "@/modules/income/domain/income";

// Spec 088: totais do mês e do ano e a renda dos holerites. Os valores de 2026
// são os da tabela de entradas e saídas do Excel (pedido do usuário, 07/10).

const SHEET_2026: [string, number | null, number | null, number | null, number | null, number | null][] = [
  ["2026-01", 776988, 66000, 99934, 166075, 61212],
  ["2026-02", 824639, 110000, 55169, 202525, 110000],
  ["2026-03", 920899, 110000, 163700, 215671, 110000],
  ["2026-04", 800813, 110000, 177984, 57368, 100000],
  ["2026-05", 860174, 110000, 220555, 172360, 100000],
  ["2026-06", 2049770, 110000, 283955, 79587, 100000],
  ["2026-07", 910655, 110000, 231512, 7345, 100000],
  ["2026-08", 1025847, 110000, 459619, 110738, 110000],
  ["2026-09", null, 110000, null, null, null],
];

function month(row: (typeof SHEET_2026)[number], payslips: Payslip[] = []): IncomeMonth {
  return {
    id: row[0],
    month: row[0],
    netIncomeCents: row[1],
    mealVoucherCents: row[2],
    cardSpendCents: row[3],
    pixSpendCents: row[4],
    mealVoucherSpendCents: row[5],
    payslips,
  };
}

function payslip(
  startsOn: string,
  endsOn: string,
  grossCents: number,
  prorated: boolean,
  kind: Payslip["kind"] = "SALARY",
  taxable = defaultTaxable(kind),
): Payslip {
  return { id: `${startsOn}:${endsOn}:${grossCents}`, kind, label: null, employer: "AMARIS", startsOn, endsOn, grossCents, prorated, taxable };
}

test("o ano de 2026 reproduz os totais do Excel", () => {
  const summary = summarizeYear(SHEET_2026.map((row) => month(row)), 2026);

  assert.equal(summary.totals.incomeCents, 9115785);
  assert.equal(summary.totals.spendCents, 3495309);
  assert.equal(summary.totals.balanceCents, 5620476);
  assert.deepEqual(
    summary.months.map((entry) => entry.totals.balanceCents),
    [515767, 566945, 541528, 575461, 477259, 1696228, 681798, 455490, 110000],
  );
});

test("campo não lançado é diferente de zero, e um mês só com holerite fica fora do gráfico", () => {
  const onlyPayslip = monthTotals({
    netIncomeCents: null,
    mealVoucherCents: null,
    cardSpendCents: null,
    pixSpendCents: null,
    mealVoucherSpendCents: null,
    payslips: [payslip("2025-06-01", "2025-06-30", 1050000, false)],
  });
  assert.equal(onlyPayslip.hasValues, false);
  assert.equal(onlyPayslip.grossCents, 1050000);

  const september = monthTotals(month(SHEET_2026[8]));
  assert.equal(september.hasValues, true);
  assert.equal(september.spendCents, 0);
  assert.equal(september.balanceCents, 110000);
});

test("renda proporcional com o mês de 30 dias, arredondada por linha como a planilha", () => {
  assert.equal(daysWorked("2025-03-01", "2025-03-02"), 2);
  assert.equal(daysWorked("2025-02-01", "2025-02-28"), 28);
  assert.equal(dailyRateCents(328250), 10942);
  assert.equal(payslipIncomeCents(payslip("2025-03-01", "2025-03-02", 328250, true)), 21883);
  assert.equal(payslipIncomeCents(payslip("2025-03-03", "2025-03-31", 700000, true)), 676667);
  assert.equal(payslipIncomeCents(payslip("2025-05-01", "2025-05-09", 700000, true)), 210000);
  assert.equal(payslipIncomeCents(payslip("2025-05-12", "2025-05-31", 1050000, true)), 700000);
  // "Necessário calcular: Não" usa o bruto inteiro, mesmo num período curto.
  assert.equal(payslipIncomeCents(payslip("2026-09-08", "2026-09-13", 198939, false)), 198939);
});

test("a marcação da linha decide a renda tributável; o tipo só sugere o padrão", () => {
  assert.deepEqual(
    (["SALARY", "VACATION", "OTHER", "THIRTEENTH", "PROFIT_SHARING"] as const).map(defaultTaxable),
    [true, true, true, false, false],
  );

  // Trocar a marcação muda a renda tributável, nunca a renda da linha.
  const thirteenth = payslip("2026-06-01", "2026-06-30", 554285, false, "THIRTEENTH", true);
  const salary = payslip("2026-06-01", "2026-06-30", 1579322, false, "SALARY", false);
  assert.equal(taxableIncomeCents(thirteenth), 554285);
  assert.equal(taxableIncomeCents(salary), 0);
  assert.equal(payslipIncomeCents(salary), 1579322);

  // Bruto e bruto tributável do mês e do ano: só as linhas marcadas entram no segundo.
  const june = month(["2026-06", null, null, null, null, null], [payslip("2026-06-01", "2026-06-30", 1579322, false), payslip("2026-06-01", "2026-06-30", 554285, false, "THIRTEENTH")]);
  assert.equal(monthTotals(june).grossCents, 2133607);
  assert.equal(monthTotals(june).taxableGrossCents, 1579322);
  assert.equal(summarizeYear([june], 2026).totals.taxableGrossCents, 1579322);
  assert.equal(summarizeYear([{ ...june, payslips: june.payslips.map((item) => ({ ...item, taxable: true })) }], 2026).totals.taxableGrossCents, 2133607);
});

test("13º salário e PLR ficam fora da renda tributável", () => {
  assert.equal(taxableIncomeCents(payslip("2026-12-01", "2026-12-31", 1000000, false, "THIRTEENTH")), 0);
  assert.equal(taxableIncomeCents(payslip("2026-03-01", "2026-03-31", 500000, false, "PROFIT_SHARING")), 0);
  assert.equal(taxableIncomeCents(payslip("2026-09-08", "2026-09-13", 198939, false, "VACATION")), 198939);
  assert.equal(payslipName({ kind: "VACATION", label: null }), "Férias");
  assert.equal(payslipName({ kind: "OTHER", label: "Bônus" }), "Bônus");
});

test("o período do holerite precisa caber no mês do registro", () => {
  const base = { kind: "SALARY" as const, label: null, employer: "AMARIS", grossCents: 100 };
  assert.deepEqual(monthBounds("2024-02"), { first: "2024-02-01", last: "2024-02-29" });
  assert.equal(coversWholeMonth("2026-09", "2026-09-01", "2026-09-30"), true);
  assert.equal(coversWholeMonth("2026-09", "2026-09-08", "2026-09-13"), false);
  assert.equal(payslipProblem("2026-09", { ...base, startsOn: "2026-09-01", endsOn: "2026-09-30" }), null);
  assert.equal(payslipProblem("2026-09", { ...base, startsOn: "2026-08-31", endsOn: "2026-09-30" }), "outside");
  assert.equal(payslipProblem("2026-09", { ...base, startsOn: "2026-09-13", endsOn: "2026-09-08" }), "order");
  assert.equal(payslipProblem("2026-09", { ...base, startsOn: "2026-09-31", endsOn: "2026-09-30" }), "dates");
  assert.equal(payslipProblem("2026-09", { ...base, employer: " ", startsOn: "2026-09-01", endsOn: "2026-09-30" }), "employer");
  assert.equal(payslipProblem("2026-09", { ...base, kind: "OTHER", startsOn: "2026-09-01", endsOn: "2026-09-30" }), "label");
  assert.equal(payslipProblem("2026-09", { ...base, grossCents: 0, startsOn: "2026-09-01", endsOn: "2026-09-30" }), "gross");
});

test("os anos vão do mais recente ao mais antigo, sempre com o atual", () => {
  assert.deepEqual(incomeYears([{ month: "2025-01" }, { month: "2026-03" }], 2027), [2027, 2026, 2025]);
});

test("taxa de poupança: balanço como parte das entradas, sem entradas não há taxa", () => {
  assert.equal(savingsRatePercent(842988, 515767), 61);
  assert.equal(savingsRatePercent(2159770, 1696228), 79);
  assert.equal(savingsRatePercent(100000, -25000), -25);
  assert.equal(savingsRatePercent(0, 0), null);
});

test("rodapé da tabela: total e média de cada coluna, só dos meses com valor", () => {
  const months = [
    ...SHEET_2026.map((row) =>
      month(row, row[0] === "2026-08" ? [payslip("2026-08-01", "2026-08-31", 1388427, false)] : []),
    ),
    month(["2025-12", null, null, null, null, null], [payslip("2025-12-01", "2025-12-31", 1050000, false)]),
  ];
  const { columns, launched } = summarizeYear(months, 2026);

  assert.equal(launched, 9);
  assert.deepEqual(columns.income, { totalCents: 9115785, averageCents: Math.round(9115785 / 9), months: 9 });
  assert.deepEqual(columns.spend, { totalCents: 3495309, averageCents: Math.round(3495309 / 9), months: 9 });
  assert.equal(columns.balance.totalCents, 5620476);
  // Setembro só tem VA/VR: a média do líquido considera os oito meses que o têm.
  assert.equal(columns.net.months, 8);
  assert.equal(columns.net.averageCents, Math.round((776988 + 824639 + 920899 + 800813 + 860174 + 2049770 + 910655 + 1025847) / 8));
  assert.equal(columns.mealVoucher.months, 9);
  assert.equal(columns.card.months, 8);
  // O bruto vem dos holerites, e dezembro de 2025 é de outro ano.
  assert.deepEqual(columns.gross, { totalCents: 1388427, averageCents: 1388427, months: 1 });
  assert.equal(summarizeYear([], 2026).columns.income.averageCents, 0);
});
