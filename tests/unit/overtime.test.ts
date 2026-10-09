import assert from "node:assert/strict";
import test from "node:test";

import {
  CLT_FLOOR_RULE,
  defaultDayType,
  dsrDays,
  hourlyRates,
  parseHoursInput,
  payableByCategory,
  paymentDeadline,
  paymentTiming,
  paymentValue,
  reconcileOvertime,
  ruleFor,
  summarizeOvertime,
  totalsFromDays,
  transcribedHourlyRate,
  type OvertimeDay,
  type OvertimePayKind,
  type OvertimePayment,
  type OvertimeRule,
  type OvertimeTotals,
  type PayslipSalary,
  type WorkMonth,
} from "@/modules/income/domain/overtime";
import { parseTimesheetGrid, parseWeekday, sameTimesheet, type SheetCell, type SheetGrid } from "@/modules/income/domain/overtime-sheet";

// Spec 098: horas extras. Os números do fim vêm das folhas e dos holerites
// reais de 2026 (analisados na spec), com as respostas do usuário: 09/07 foi
// feriado e as 6 h a mais do holerite de julho regularizaram março. Os valores
// saem do salário bruto de Recebimentos e batem com os holerites ao centavo.

const day = (date: string, hours: number, dayType = defaultDayType(date)): OvertimeDay => ({ date, hours: hours * 100, dayType });

test("dia útil divide as horas a mais em até 2 h e além; fim de semana e feriado contam inteiros", () => {
  const totals = totalsFromDays(
    [day("2026-03-02", 9), day("2026-03-04", 16), day("2026-02-22", 11), day("2026-03-28", 2), day("2026-04-03", 5), day("2026-04-07", 3), day("2026-07-09", 8, "HOLIDAY")],
    800,
  );
  assert.deepEqual(totals, { weekday: 300, weekdayBeyond: 600, saturday: 200, sunday: 1100, holiday: 1300, shortfall: 500 });
});

test("calendário de São Paulo: feriados da lei, Sexta-feira Santa, 09/07, 25/01 e Corpus Christi; Carnaval fica dia útil", () => {
  assert.equal(defaultDayType("2026-04-03"), "HOLIDAY");
  assert.equal(defaultDayType("2026-11-20"), "HOLIDAY");
  assert.equal(defaultDayType("2026-06-04"), "HOLIDAY", "Corpus Christi, feriado na cidade");
  assert.equal(defaultDayType("2026-07-09"), "HOLIDAY", "feriado do estado");
  assert.equal(defaultDayType("2027-01-25"), "HOLIDAY", "aniversário da cidade");
  assert.equal(defaultDayType("2027-11-20"), "HOLIDAY", "feriado no sábado mantém o adicional do feriado");
  assert.equal(defaultDayType("2026-11-15"), "HOLIDAY", "feriado no domingo também pode ter regra própria");
  assert.equal(defaultDayType("2026-02-16"), "WORKDAY");
  assert.equal(defaultDayType("2026-02-22"), "SUNDAY");
  assert.equal(defaultDayType("2026-03-28"), "SATURDAY");
});

test("DSR: domingos e feriados do mês do holerite contra os demais dias, sábado incluído", () => {
  assert.deepEqual(dsrDays("2026-03"), { rest: 5, work: 26 });
  assert.deepEqual(dsrDays("2026-05"), { rest: 6, work: 25 }, "1º de maio");
  assert.deepEqual(dsrDays("2026-06"), { rest: 5, work: 25 }, "Corpus Christi");
  assert.deepEqual(dsrDays("2026-07"), { rest: 5, work: 26 }, "09/07");
  assert.deepEqual(dsrDays("2026-09"), { rest: 5, work: 25 }, "7 de setembro");
});

test("compensação e falta abatem primeiro as faixas de menor adicional", () => {
  const totals: OvertimeTotals = { weekday: 300, weekdayBeyond: 600, saturday: 200, sunday: 1100, holiday: 0, shortfall: 500 };
  // 4 h compensadas: as 3 h de dia útil até 2 h e 1 h do sábado (50%) antes das de além de 2 h.
  assert.deepEqual(payableByCategory(totals, 400, CLT_FLOOR_RULE), { weekday: 0, weekdayBeyond: 600, saturday: 100, sunday: 1100, holiday: 0 });
  assert.deepEqual(payableByCategory(totals, 0, { ...CLT_FLOOR_RULE, netShortfall: true }), { weekday: 0, weekdayBeyond: 600, saturday: 0, sunday: 1100, holiday: 0 });
  assert.equal(CLT_FLOOR_RULE.netShortfall, false, "por padrão a falta não desconta das extras");
});

const rule = (effectiveFrom: string, patch: Partial<OvertimeRule> = {}): OvertimeRule => ({ ...CLT_FLOOR_RULE, id: effectiveFrom, effectiveFrom, ...patch });

test("versões da regra: cada mês usa a mais recente; antes de todas, o piso da CLT", () => {
  const rules = [rule("2026-09", { weekdayPercent: 75 }), rule("2026-01")];
  assert.equal(ruleFor("2025-12", rules), CLT_FLOOR_RULE);
  assert.equal(ruleFor("2026-05", rules).effectiveFrom, "2026-01");
  assert.equal(ruleFor("2026-10", rules).weekdayPercent, 75);
});

test("horas digitadas: decimal, vírgula e relógio", () => {
  assert.equal(parseHoursInput(""), null);
  assert.equal(parseHoursInput("9"), 900);
  assert.equal(parseHoursInput("173,33"), 17333);
  assert.equal(parseHoursInput("9:30"), 950);
  assert.equal(parseHoursInput("2 h"), 200);
  assert.ok(Number.isNaN(parseHoursInput("abc")));
});

test("prazo e momento do pagamento: 5º dia útil do mês seguinte ao holerite", () => {
  assert.equal(paymentDeadline("2026-04"), "2026-05-08");
  assert.equal(paymentDeadline("2026-10"), "2026-11-09");
  assert.equal(paymentTiming("2026-03", "2026-04"), "onTime");
  assert.equal(paymentTiming("2026-03", "2026-07"), "late");
  assert.equal(paymentTiming("2026-03", "2026-03"), "early");
});

// As horas a mais das folhas reais de 2026, por faixa (dia útil até 2 h, além de
// 2 h, sábado, domingo, feriado), com 09/07 como feriado.
const WORK_2026: [string, string, string, number, number, number, number, number][] = [
  ["2026-01", "2025-12-19", "2026-01-18", 0, 0, 0, 0, 0],
  ["2026-02", "2026-01-19", "2026-02-20", 9, 0, 0, 0, 0],
  ["2026-03", "2026-02-21", "2026-03-21", 11, 12, 0, 11, 0],
  ["2026-04", "2026-03-22", "2026-04-20", 10, 11, 2, 0, 0],
  ["2026-05", "2026-04-21", "2026-05-21", 26, 25, 0, 0, 0],
  ["2026-06", "2026-05-22", "2026-06-19", 2, 4, 0, 0, 0],
  ["2026-07", "2026-06-20", "2026-07-21", 5, 1, 7, 10, 8],
  ["2026-08", "2026-07-22", "2026-08-21", 13, 5, 6, 7, 0],
  ["2026-09", "2026-08-22", "2026-09-21", 14, 0, 0, 0, 0],
];

const workMonths: WorkMonth[] = WORK_2026.map(([month, startsOn, endsOn, weekday, beyond, saturday, sunday, holiday]) => ({
  id: month,
  month,
  startsOn,
  endsOn,
  totals: { weekday: weekday * 100, weekdayBeyond: beyond * 100, saturday: saturday * 100, sunday: sunday * 100, holiday: holiday * 100, shortfall: 0 },
  compensated: 0,
}));

const payment = (workMonth: string, paymentMonth: string, lines: [OvertimePayKind, number][], note: string | null = null): OvertimePayment => ({
  id: `${workMonth}:${paymentMonth}`,
  workMonth,
  paymentMonth,
  lines: lines.map(([kind, hours]) => ({ kind, hours: hours * 100 })),
  note,
});

// Os pagamentos registrados (o holerite de julho dividido entre junho e março).
const PAYMENTS_2026 = [
  payment("2026-02", "2026-03", [["OVERTIME_75", 9]]),
  payment("2026-03", "2026-07", [["OVERTIME_50", 6]]),
  payment("2026-04", "2026-05", [["OVERTIME_75", 7]]),
  payment("2026-05", "2026-06", [["OVERTIME_50", 49], ["OVERTIME_100", 2]]),
  payment("2026-06", "2026-07", [["OVERTIME_50", 6]]),
  payment("2026-07", "2026-08", [["OVERTIME_50", 8], ["OVERTIME_100", 15]]),
  payment("2026-08", "2026-09", [["OVERTIME_75", 18], ["OVERTIME_100", 13]]),
];

// O salário bruto de cada holerite em Recebimentos (setembro teve férias).
const salary = (gross: number, fullMonth = true): PayslipSalary => ({ grossCents: Math.round(gross * 100), fullMonth });
const SALARIES_2026: Record<string, PayslipSalary> = {
  "2026-01": salary(10500),
  "2026-03": salary(11792.56),
  "2026-04": salary(10780.35),
  "2026-05": salary(11599.12),
  "2026-06": salary(15793.22),
  "2026-07": salary(12295.54),
  "2026-08": salary(13884.27),
  "2026-09": salary(13454.16, false),
};

test("hora normal pelo salário bruto: tira as extras e o DSR que o holerite pagou", () => {
  const rateAt = hourlyRates({ salaries: SALARIES_2026, payments: PAYMENTS_2026, rules: [rule("2026-01")] });
  const cents = (month: string) => Math.round(rateAt(month)!.cents * 100) / 100;

  assert.equal(cents("2026-04"), 5390.18, "R$ 10.780,35 ÷ 200 h");
  assert.equal(cents("2026-06"), 5390.18, "R$ 15.793,22 com 49 h a 50%, 2 h a 100% e o DSR");
  assert.equal(cents("2026-07"), 5552, "R$ 11.104,00 ÷ 200 h depois do dissídio");
  assert.deepEqual(rateAt("2026-09"), rateAt("2026-08"), "setembro teve férias: vale a hora de agosto");
  assert.equal(rateAt("2026-10")?.month, "2026-08", "outubro ainda sem salário");
  assert.equal(rateAt("2026-10")?.source, "gross", "o bruto dá uma estimativa");
  assert.equal(rateAt("2025-11")?.month, "2026-01", "antes de todos, o primeiro");
  assert.equal(hourlyRates({ salaries: {}, payments: [], rules: [] })("2026-10"), null);
});

test("hora transcrita: a linha normal tem prioridade, inclusive em férias, sem arredondar a hora", () => {
  const transcribedRate = transcribedHourlyRate([
    { kind: "OVERTIME_75", hours: 1800, cents: 174888 },
    { kind: "NORMAL", hours: 17333, cents: 962328 },
    { kind: "OVERTIME_100", hours: 1300, cents: 144352 },
  ])!;
  assert.deepEqual(transcribedRate, { cents: 96232800 / 17333, source: "normal" });
  const salaries = { "2026-09": { ...salary(13454.16, false), transcribedRate } };
  const rateWithPayments = hourlyRates({ salaries, payments: PAYMENTS_2026, rules: [] })("2026-09")!;
  const rateWithoutPayments = hourlyRates({ salaries, payments: [], rules: [] })("2026-09");
  assert.deepEqual(rateWithPayments, rateWithoutPayments, "atribuir ou corrigir horas não altera a base transcrita");
  assert.equal(rateWithPayments.month, "2026-09", "o mês proporcional usa a própria transcrição");
  assert.equal(rateWithPayments.source, "normal");
  assert.deepEqual(paymentValue(PAYMENTS_2026[6].lines, "2026-09", rateWithPayments)?.lines.map((line) => line.cents), [174888, 144352]);

  const fractional = transcribedHourlyRate([{ kind: "NORMAL", hours: 20000, cents: 1078035 }])!;
  assert.equal(fractional.cents, 5390.175);
  assert.equal(paymentValue([{ kind: "OVERTIME_50", hours: 4900 }], "2026-06", { ...fractional, month: "2026-06" })?.amountCents, 396178);
});

test("sem hora normal, as extras transcritas dão a base; linhas incompletas ou zeradas não entram", () => {
  const transcribedRate = transcribedHourlyRate([
    { kind: "NORMAL", hours: 0, cents: 1110400 },
    { kind: "OVERTIME_50", hours: 100, cents: 0 },
    { kind: "OVERTIME_75", hours: 1800, cents: 174888 },
    { kind: "OVERTIME_100", hours: 1300, cents: 144352 },
  ])!;
  assert.deepEqual(transcribedRate, { cents: 5552, source: "overtime" });
  assert.equal(transcribedHourlyRate([{ kind: "NORMAL", hours: 20000, cents: 0 }]), null);
  assert.equal(transcribedHourlyRate([]), null);
  const rate = hourlyRates({ salaries: { "2026-09": { grossCents: 0, fullMonth: false, transcribedRate } }, payments: [], rules: [] })("2026-10");
  assert.deepEqual(rate, { ...transcribedRate, month: "2026-09" }, "só a transcrição basta e vale como reserva para o mês seguinte");
});

test("valor do pagamento: horas × hora normal × adicional e o DSR do mês do holerite, como no holerite de setembro", () => {
  const value = paymentValue(PAYMENTS_2026[6].lines, "2026-09", { cents: 5552, month: "2026-08", source: "normal" })!;
  assert.deepEqual(
    value.lines.map((line) => line.cents),
    [174888, 144352],
  );
  assert.deepEqual([value.amountCents, value.dsrCents], [319240, 63848]);
  assert.equal(paymentValue(PAYMENTS_2026[6].lines, "2026-09", null), null);
});

test("conciliação de 2026: março, abril e o feriado de julho vencidos; setembro a vencer", () => {
  const { months } = reconcileOvertime({ workMonths, payments: PAYMENTS_2026, rules: [rule("2026-01")], salaries: SALARIES_2026, today: "2026-10-08" });
  const of = (month: string) => months.find((entry) => entry.month === month)!;

  assert.deepEqual(
    months.map((month) => [month.month, month.status, month.payable / 100, month.paid / 100, month.open / 100]),
    [
      ["2026-01", "NONE", 0, 0, 0],
      ["2026-02", "PAID", 9, 9, 0],
      ["2026-03", "PARTIAL", 34, 6, 28],
      ["2026-04", "PARTIAL", 23, 7, 16],
      ["2026-05", "PAID", 51, 51, 0],
      ["2026-06", "PAID", 6, 6, 0],
      ["2026-07", "PARTIAL", 31, 23, 8],
      ["2026-08", "PAID", 31, 31, 0],
      ["2026-09", "UPCOMING", 14, 0, 14],
    ],
  );
  assert.equal(of("2026-03").paidLate, 600);
  assert.equal(of("2026-03").receivedCents, 49968);
  assert.equal(of("2026-02").estimatedCents, 72767, "9 h a 50% de R$ 53,90");
  assert.deepEqual([of("2026-02").receivedCents, of("2026-02").dsrCents], [84895, 16326], "a empresa pagou 75%; R$ 848,95 e R$ 163,26 no holerite");
  assert.deepEqual([of("2026-05").receivedCents, of("2026-05").dsrCents], [417739, 83548], "R$ 3.961,78 + R$ 215,61 e R$ 835,48");
  assert.equal(of("2026-09").rate?.month, "2026-08");

  // O holerite de julho pagou 12 h: 6 de junho, no prazo, e 6 de março, com atraso.
  assert.deepEqual(of("2026-03").payments.map((payment) => [payment.paymentMonth, payment.hours, payment.timing]), [["2026-07", 600, "late"]]);
  assert.deepEqual(of("2026-06").payments.map((payment) => [payment.paymentMonth, payment.hours, payment.timing]), [["2026-07", 600, "onTime"]]);

  const summary = summarizeOvertime(months);
  assert.deepEqual([summary.worked, summary.paid, summary.overdue, summary.awaiting, summary.overdueMonths, summary.nextDue], [19900, 13300, 5200, 1400, 3, "2026-10"]);
  assert.equal(summary.receivedCents, 1221024, "a soma dos holerites, ao centavo");
  assert.equal(summary.dsrCents, 243630);
});

test("situação pelo prazo: a vencer até o 5º dia útil; depois, não pago ou pago em parte", () => {
  const september = [workMonths[8]];
  const at = (today: string, payments: OvertimePayment[] = []) => reconcileOvertime({ workMonths: september, payments, rules: [], today }).months[0].status;

  assert.equal(at("2026-11-09"), "UPCOMING", "no dia do prazo ainda não venceu");
  assert.equal(at("2026-11-10"), "OVERDUE");
  assert.equal(at("2026-11-10", [payment("2026-09", "2026-10", [])]), "OVERDUE", "o holerite registrado sem horas deste mês");
  assert.equal(at("2026-11-10", [payment("2026-09", "2026-10", [["OVERTIME_75", 4]])]), "PARTIAL");
  assert.equal(at("2026-11-02", [payment("2026-09", "2026-10", [["OVERTIME_75", 14]])]), "PAID");
  assert.equal(at("2026-12-02", [payment("2026-09", "2026-11", [["OVERTIME_75", 14]])]), "PAID_LATE");

  const overpaid = reconcileOvertime({ workMonths: september, payments: [payment("2026-09", "2026-10", [["OVERTIME_50", 16]])], rules: [], today: "2026-11-02" }).months[0];
  assert.deepEqual([overpaid.status, overpaid.open, overpaid.overpaid], ["PAID", 0, 200]);
});

test("sem salário em Recebimentos, as horas contam e os valores ficam em branco", () => {
  const { months } = reconcileOvertime({ workMonths: [workMonths[1]], payments: [PAYMENTS_2026[0]], rules: [], today: "2026-10-08" });
  assert.deepEqual([months[0].paid, months[0].estimatedCents, months[0].receivedCents, months[0].payments[0].dsrCents], [900, null, null, null]);
});

// Uma folha como as do usuário: cabeçalho na linha 7, dias até "Total".
function sheet(rows: [unknown, string, number | SheetCell][], name = "Versão Dividida"): SheetGrid {
  const header: SheetCell[] = ["Date", "Week Day", "Worked", "Activities", "Project 1", "Hours", "Project 2", "Hours"];
  return {
    name,
    rows: [
      [],
      [null, null, null, "Fernando"],
      [],
      ["Monthly Status Report"],
      ["Year", null, 2025],
      [],
      header,
      ...rows.map(([date, weekday, hours]) => [date as SheetCell, weekday, { formula: "IF(F8<>0,\"Yes\",\"No\")" }, "-", "Porto Saúde", hours, null, null] as SheetCell[]),
      ["Total", null, null, null, "-", { formula: "SUM(F8:F40)", result: 0 }],
    ],
  };
}

const utc = (text: string) => new Date(`${text}T00:00:00.000Z`);

test("folha: anos arrastados errado são corrigidos pelo dia da semana, e o mês é o do fim do período", () => {
  const result = parseTimesheetGrid(
    sheet([
      [utc("2030-02-21"), "sábado", 0],
      [utc("2030-02-22"), "domingo", 11],
      [utc("2030-02-23"), "segunda-feira", 8],
      [utc("2030-03-02"), "segunda-feira", 9],
    ]),
    "03-Marco.xlsx",
    "2026-10-08",
  );
  assert.equal(result.kind, "month");
  if (result.kind !== "month") return;
  assert.equal(result.sheet.month, "2026-03");
  assert.deepEqual(result.sheet.days.map((entry) => [entry.date, entry.hours, entry.dayType]), [
    ["2026-02-21", 0, "SATURDAY"],
    ["2026-02-22", 1100, "SUNDAY"],
    ["2026-02-23", 800, "WORKDAY"],
    ["2026-03-02", 900, "WORKDAY"],
  ]);
  assert.match(result.sheet.warnings[0], /4 datas estavam com o ano errado/);
  assert.match(result.sheet.warnings[1], /pula de 23\/02\/2026 para 02\/03\/2026/);
});

test("folha: o ano escrito fica quando bate com os dias da semana, mesmo que outro ano também bata", () => {
  const result = parseTimesheetGrid(sheet([[utc("2031-11-24"), "segunda-feira", 10], [utc("2031-11-25"), "terça-feira", 8]]), "11-Novembro.xlsx", "2026-10-08");
  assert.ok(result.kind === "month" && result.sheet.month === "2031-11" && result.sheet.warnings.length === 0);
});

test("folha: dia da semana divergente avisa e vale a data; nome de outro mês avisa", () => {
  const result = parseTimesheetGrid(sheet([[utc("2026-05-20"), "quarta-feira", 8], [utc("2026-05-21"), "quarta-feira", 8]]), "04-Abril.xlsx", "2026-10-08");
  assert.equal(result.kind, "month");
  if (result.kind !== "month") return;
  assert.deepEqual(result.sheet.warnings, [
    "21/05/2026 está marcado como quarta-feira, mas é quinta-feira; vale a data.",
    "O nome indica abr, mas o período termina em 21/05/2026; vale o período.",
  ]);
});

test("folha: aba sem cabeçalho é ignorada; hora por fórmula sem valor salvo e dia repetido recusam", () => {
  assert.equal(parseTimesheetGrid({ name: "Resumo", rows: [["Mês", "Horas - Declaradas 100%"]] }, "controle.xlsx", "2026-10-08").kind, "skipped");
  const missing = parseTimesheetGrid(sheet([[utc("2026-09-01"), "terça-feira", { formula: "8+1" }]]), "set.xlsx", "2026-10-08");
  assert.equal(missing.kind, "error");
  const repeated = parseTimesheetGrid(sheet([[utc("2026-09-01"), "terça-feira", 8], [utc("2026-09-01"), "terça-feira", 8]]), "set.xlsx", "2026-10-08");
  assert.equal(repeated.kind, "error");
});

test("folha: a mesma folha em dois arquivos é a mesma", () => {
  const a = parseTimesheetGrid(sheet([[utc("2026-09-01"), "terça-feira", 10]]), "09-Setemro.xlsx", "2026-10-08");
  const b = parseTimesheetGrid(sheet([[utc("2026-09-01"), "terça-feira", 10]], "Setembro"), "00-Controle.xlsx", "2026-10-08");
  const c = parseTimesheetGrid(sheet([[utc("2026-09-01"), "terça-feira", 9]], "Setembro"), "00-Controle.xlsx", "2026-10-08");
  assert.ok(a.kind === "month" && b.kind === "month" && c.kind === "month");
  if (a.kind !== "month" || b.kind !== "month" || c.kind !== "month") return;
  assert.ok(sameTimesheet(a.sheet, b.sheet));
  assert.ok(!sameTimesheet(a.sheet, c.sheet));
  assert.equal(parseWeekday("Sáb"), 6);
});
