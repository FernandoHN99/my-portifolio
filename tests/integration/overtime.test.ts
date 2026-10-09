import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import ExcelJS from "exceljs";

import { databaseSchema, getPrismaClient } from "@/lib/prisma";
import { runAsUser } from "@/lib/user-db";
import { ModuleAccessError } from "@/modules/access/application/module-access";
import { getOvertimeView, type OvertimeMonthView } from "@/modules/income/application/get-overtime-view";
import { exportIncomeBackup, IncomeBackupValidationError, previewIncomeBackup, restoreIncomeBackup } from "@/modules/income/application/income-backup";
import { createIncomeMonth, IncomeEditError, type IncomeMonthInput } from "@/modules/income/application/income-editing";
import { deleteOvertimeMonth, saveOvertimeEntry, saveOvertimeRules, undoOvertimeChange, type EntryInput, type RuleInput } from "@/modules/income/application/overtime-editing";
import { applyOvertimeImport, previewOvertimeImport, type TimesheetFile } from "@/modules/income/application/overtime-import";
import { totalsFromDays } from "@/modules/income/domain/overtime";

// Spec 098, no banco: só roda no schema descartável `recebimentos_teste`
// (pnpm db:test-schema create recebimentos_teste). As folhas são geradas aqui
// com o layout das reais (cabeçalho na linha 7, um dia por linha até "Total").
const isolated = databaseSchema(process.env.DATABASE_URL ?? "") === "recebimentos_teste";
const prisma = getPrismaClient()!;
const owner = randomUUID();
const other = randomUUID();
const stranger = randomUUID();
const TODAY = "2026-10-08";
const as = <T>(userId: string, operation: () => Promise<T>) => runAsUser(userId, operation);

before(async () => {
  if (!isolated) return;
  for (const [id, label] of [
    [owner, "dono das horas"],
    [other, "outro com Recebimentos"],
    [stranger, "sem Recebimentos"],
  ]) {
    await prisma.user.create({ data: { id, name: label, email: `${id}@example.test` } });
  }
  await prisma.moduleGrant.createMany({ data: [{ userId: owner, module: "INCOME" }, { userId: other, module: "INCOME" }] });
});

after(async () => {
  if (!isolated) return;
  await prisma.user.deleteMany({ where: { id: { in: [owner, other, stranger] } } });
  await prisma.$disconnect();
});

const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/** Uma folha .xlsx como as do usuário. `yearOffset` arrasta o ano das datas, como no erro real. */
async function timesheet(name: string, start: string, hours: number[], { yearOffset = 0, sheetName = "Versão Dividida" } = {}): Promise<TimesheetFile> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.getCell("D1").value = "Fernando";
  sheet.getCell("A4").value = "Monthly Status Report";
  sheet.getRow(7).values = ["Date", "Week Day", "Worked", "Activities", "Project 1", "Hours"];
  hours.forEach((value, index) => {
    const date = new Date(`${start}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    const written = new Date(date);
    written.setUTCFullYear(written.getUTCFullYear() + (index > 0 ? yearOffset : 0));
    sheet.getRow(8 + index).values = [written, WEEKDAYS[date.getUTCDay()], { formula: `IF(F${8 + index}<>0,"Yes","No")` }, value ? "Atividade" : "-", "Porto Saúde", value];
  });
  sheet.getRow(8 + hours.length).values = ["Total", null, null, null, "-", { formula: `SUM(F8:F${7 + hours.length})` }];
  return { name, data: new Uint8Array(await workbook.xlsx.writeBuffer()) };
}

// 21/02 a 21/03/2026, com as horas da folha real de março (34 h a mais).
const MARCH = [0, 11, 8, 8, 8, 8, 8, 0, 0, 9, 12, 16, 8, 8, 0, 0, 11, 8, 8, 8, 8, 0, 0, 8, 8, 10, 13, 8, 0];
// 22/03 a 20/04/2026: 23 h a mais, uma falta de 5 h em 07/04 e a Sexta-feira Santa sem horas.
const APRIL = [0, 8, 15, 11, 10, 8, 2, 0, 8, 10, 8, 8, 0, 0, 0, 0, 3, 8, 15, 8, 0, 0, 8, 8, 8, 8, 8, 0, 0, 8];

function month(monthKey: string, overrides: Partial<IncomeMonthInput> = {}): IncomeMonthInput {
  return {
    month: monthKey,
    values: { netIncomeCents: null, mealVoucherCents: null, cardSpendCents: null, pixSpendCents: null, mealVoucherSpendCents: null },
    payslips: [],
    ...overrides,
  };
}

/** O holerite de salário de um mês em Recebimentos, de onde sai a hora normal. */
const salaryPayslip = (monthKey: string, grossCents: number) => ({
  kind: "SALARY" as const,
  label: null,
  employer: "Amaris",
  startsOn: `${monthKey}-01`,
  endsOn: `${monthKey}-28`,
  grossCents,
  prorated: false,
  taxable: true,
});

const view = () => as(owner, () => getOvertimeView(new Date("2026-10-08T12:00:00")));

/** O que o formulário envia ao salvar um mês aberto da tabela, sem mudar nada. */
function entryOf(current: OvertimeMonthView, patch: Partial<EntryInput> = {}): EntryInput {
  return {
    id: current.id,
    requestId: randomUUID(),
    attached: false,
    month: current.month,
    startsOn: current.startsOn,
    endsOn: current.endsOn,
    totals: { weekday: current.totals.weekday, weekdayBeyond: current.totals.weekdayBeyond, saturday: current.totals.saturday, sunday: current.totals.sunday, holiday: current.totals.holiday },
    compensated: current.compensated,
    note: current.note,
    dayTypes: [],
    payments: current.payments.map((payment) => ({ id: payment.id, paymentMonth: payment.paymentMonth, lines: payment.lines, note: payment.note })),
    ...patch,
  };
}

test("sem a concessão de Recebimentos, as horas extras recusam leitura e gravação", { skip: !isolated }, async () => {
  await assert.rejects(as(stranger, () => getOvertimeView()), ModuleAccessError);
  await assert.rejects(as(stranger, async () => previewOvertimeImport([await timesheet("03-Marco.xlsx", "2026-02-21", MARCH)], TODAY)), ModuleAccessError);
});

test("importar folhas: prévia, ano corrigido, mesma folha em dois arquivos e conflito", { skip: !isolated }, async () => {
  const marchFile = await timesheet("03-Marco.xlsx", "2026-02-21", MARCH, { yearOffset: 4 });
  const marchCopy = await timesheet("00-Controle.xlsx", "2026-02-21", MARCH, { sheetName: "Março" });
  const april = await timesheet("04-Abril.xlsx", "2026-03-22", APRIL);
  const preview = await as(owner, () => previewOvertimeImport([marchFile, marchCopy, april], TODAY));

  assert.deepEqual(
    preview.months.map((entry) => [entry.month, entry.startsOn, entry.endsOn, entry.worked, entry.state]),
    [
      ["2026-03", "2026-02-21", "2026-03-21", 3400, "new"],
      ["2026-04", "2026-03-22", "2026-04-20", 2300, "new"],
    ],
  );
  assert.match(preview.months[0].warnings[0], /28 datas estavam com o ano errado/);
  assert.equal(await prisma.overtimeMonth.count({ where: { userId: owner } }), 0, "a prévia não grava");

  const changedApril = await timesheet("Abril-v2.xlsx", "2026-03-22", APRIL.map((value, index) => (index === 1 ? 10 : value)));
  const conflict = await as(owner, () => previewOvertimeImport([april, changedApril], TODAY));
  assert.equal(conflict.months[0].state, "conflict");

  const saved = await as(owner, () => applyOvertimeImport([marchFile, april, changedApril], ["2026-03", "2026-04"], TODAY));
  assert.deepEqual(saved, ["2026-03"], "o mês em conflito não é gravado");
  await as(owner, () => applyOvertimeImport([april], ["2026-04"], TODAY));

  const again = await as(owner, () => previewOvertimeImport([marchFile, april], TODAY));
  assert.deepEqual(again.months.map((entry) => entry.state), ["same", "same"]);
  assert.equal(await prisma.overtimeDay.count({ where: { userId: owner } }), MARCH.length + APRIL.length);

  // Na criação com anexo, a importação já criou o mês; o Salvar o encontra
  // pela competência, mesmo com um requestId novo, e conserva os dias.
  const imported = (await view()).months.find((entry) => entry.month === "2026-04")!;
  const attached = entryOf(imported, { id: undefined, attached: true, note: "Folha anexada no formulário" });
  assert.deepEqual(await as(owner, () => saveOvertimeEntry(attached)), { monthId: imported.id });
  const savedEntry = (await view()).months.find((entry) => entry.month === "2026-04")!;
  assert.deepEqual([savedEntry.source, savedEntry.note, savedEntry.days.length], ["IMPORT", attached.note, APRIL.length]);
  assert.equal(await prisma.overtimeMonth.count({ where: { userId: owner } }), 2);
});

test("o mês aberto é todo editável: ajustes, horas à mão, tipo do dia e reimportação", { skip: !isolated }, async () => {
  const of = async (key: string) => (await view()).months.find((entry) => entry.month === key)!;
  let march = await of("2026-03");
  assert.equal(march.source, "IMPORT");

  await as(owner, () => saveOvertimeEntry(entryOf(march, { compensated: 800, note: "Folga em 06/04 compensou 8 h" })));
  await assert.rejects(as(owner, () => saveOvertimeEntry(entryOf(march, { compensated: 3500 }))), IncomeEditError, "mais que as extras");
  await assert.rejects(as(owner, () => saveOvertimeEntry(entryOf(march, { startsOn: "2026-02-25" }))), IncomeEditError, "o período corta os dias da folha");

  // Horas digitadas no mês da folha: ele vira "à mão" e mantém os dias; as da folha de volta, segue a folha.
  march = await of("2026-03");
  await as(owner, () => saveOvertimeEntry(entryOf(march, { totals: { ...entryOf(march).totals, weekday: 1500 } })));
  march = await of("2026-03");
  assert.deepEqual([march.source, march.totals.weekday, march.days.length], ["MANUAL", 1500, MARCH.length]);
  await as(owner, () => saveOvertimeEntry(entryOf(march, { totals: { ...entryOf(march).totals, weekday: 1100 } })));
  assert.equal((await of("2026-03")).source, "IMPORT");

  // 04/03 (16 h) vira feriado: o formulário refaz as horas pela folha e salva junto.
  march = await of("2026-03");
  const fourth = march.days.find((entry) => entry.date === "2026-03-04")!;
  const totals = totalsFromDays(
    march.days.map((entry) => (entry.id === fourth.id ? { ...entry, dayType: "HOLIDAY" as const } : entry)),
    march.rule.dailyHours,
  );
  await as(owner, () => saveOvertimeEntry(entryOf(march, { dayTypes: [{ dayId: fourth.id, dayType: "HOLIDAY" }], totals })));
  march = await of("2026-03");
  assert.deepEqual([march.source, march.totals.holiday, march.worked, march.payable], ["IMPORT", 1600, 4200, 3400]);
  await assert.rejects(as(other, () => saveOvertimeEntry(entryOf(march))), IncomeEditError, "mês de outro usuário");

  // Reimportar a mesma folha com um dia a mais de horas mantém o feriado, a compensação e a observação.
  const changed = await timesheet("03-Marco.xlsx", "2026-02-21", MARCH.map((value, index) => (index === 2 ? 10 : value)));
  const preview = await as(owner, () => previewOvertimeImport([changed], TODAY));
  assert.deepEqual([preview.months[0].totals.holiday, preview.months[0].worked], [1600, 4400], "a prévia inclui o feriado marcado à mão");
  await as(owner, () => applyOvertimeImport([changed], ["2026-03"], TODAY));
  march = await of("2026-03");
  await as(owner, () => saveOvertimeEntry(entryOf(march, { attached: true, totals: preview.months[0].totals })));
  march = await of("2026-03");
  assert.equal(march.source, "IMPORT", "salvar as horas da prévia mantém a declaração ligada à folha");
  assert.equal(march.days.find((entry) => entry.date === "2026-03-04")?.dayType, "HOLIDAY");
  assert.equal(march.days.find((entry) => entry.date === "2026-03-04")?.manualType, true);
  assert.deepEqual([march.worked, march.compensated, march.note], [4400, 800, "Folga em 06/04 compensou 8 h"]);

  // Voltar ao tipo do calendário tira a marca manual (a reimportação recriou os dias).
  const recreated = march.days.find((entry) => entry.date === "2026-03-04")!;
  const back = totalsFromDays(
    march.days.map((entry) => (entry.id === recreated.id ? { ...entry, dayType: "WORKDAY" as const } : entry)),
    march.rule.dailyHours,
  );
  await as(owner, () => saveOvertimeEntry(entryOf(march, { dayTypes: [{ dayId: recreated.id, dayType: "WORKDAY" }], totals: back })));
  const restored = await prisma.overtimeDay.findFirstOrThrow({ where: { userId: owner, date: new Date("2026-03-04") } });
  assert.equal(restored.manualType, false);
});

test("pagamentos: só as horas; o valor e o DSR saem do salário bruto do holerite", { skip: !isolated }, async () => {
  // Maio em Recebimentos: R$ 11.599,12 de bruto, com as 7 h a 75% de abril e o DSR delas. A
  // transcrição do holerite (spec 094) também permite conferir a hora normal.
  const may = randomUUID();
  await as(owner, () => createIncomeMonth({ ...month("2026-05", { payslips: [salaryPayslip("2026-05", 1159912)] }), requestId: may }));
  await prisma.incomeHourRecord.create({ data: { userId: owner, incomeMonthId: may, kind: "OVERTIME_75", paidHours: "7", paidAmount: "660.30" } });

  const of = async (key: string) => (await view()).months.find((entry) => entry.month === key)!;
  let march = await of("2026-03");
  let april = await of("2026-04");

  // Pagamento sem horas não fica; o de maio pagou 7 h de abril.
  await as(owner, () => saveOvertimeEntry(entryOf(march, { payments: [{ paymentMonth: "2026-04", lines: [], note: "Nada no holerite" }] })));
  await as(owner, () => saveOvertimeEntry(entryOf(april, { payments: [{ paymentMonth: "2026-05", lines: [{ kind: "OVERTIME_75", hours: 700 }], note: null }] })));
  await assert.rejects(
    as(owner, () =>
      saveOvertimeEntry(
        entryOf(april, {
          payments: [
            { paymentMonth: "2026-06", lines: [{ kind: "OVERTIME_50", hours: 100 }], note: null },
            { paymentMonth: "2026-06", lines: [{ kind: "OVERTIME_75", hours: 100 }], note: null },
          ],
        }),
      ),
    ),
    IncomeEditError,
    "dois pagamentos do mesmo holerite",
  );
  await assert.rejects(
    as(owner, () => saveOvertimeEntry(entryOf(april, { payments: [{ paymentMonth: "2026-06", lines: [{ kind: "OVERTIME_50", hours: 100 }, { kind: "OVERTIME_50", hours: 100 }], note: null }] }))),
    IncomeEditError,
  );
  await assert.rejects(
    prisma.overtimePayment.create({ data: { userId: owner, overtimeMonthId: april.id, paymentMonth: new Date("2026-06-15"), hours50: "1" } }),
    "o holerite é sempre o dia 1",
  );

  march = await of("2026-03");
  april = await of("2026-04");
  // Março: 36 h, 8 compensadas; abril: 23 h.
  assert.deepEqual([march.status, march.payable, march.paid, march.open, march.payments.length], ["OVERDUE", 2800, 0, 2800, 0]);
  assert.deepEqual([april.status, april.paid, april.open], ["PARTIAL", 700, 1600]);
  assert.deepEqual([april.receivedCents, april.dsrCents, april.rate?.month], [66030, 15847, "2026-05"], "R$ 660,30 e R$ 158,47, como no holerite de maio");
  assert.equal(Math.round(april.rate!.cents), 5390, "hora normal de R$ 53,90");

  // Abrir a linha e corrigir a declaração mantém o pagamento já preenchido.
  const original = april;
  await as(owner, () => saveOvertimeEntry(entryOf(april, { totals: { ...entryOf(april).totals, weekday: april.totals.weekday + 100 } })));
  april = await of("2026-04");
  assert.deepEqual([april.source, april.worked, april.paid, april.open], ["MANUAL", 2400, 700, 1700]);
  assert.deepEqual(april.payments, original.payments, "editar a declaração preserva as horas pagas e seus valores calculados");
  await as(owner, () => saveOvertimeEntry(entryOf(original)));
  april = await of("2026-04");

  // Corrigir o pagamento de abril (9 h no lugar de 7) mantém o registro; tirá-lo do formulário o exclui.
  const paymentId = april.payments[0].id;
  await as(owner, () => saveOvertimeEntry(entryOf(april, { payments: [{ id: paymentId, paymentMonth: "2026-05", lines: [{ kind: "OVERTIME_75", hours: 900 }], note: null }] })));
  april = await of("2026-04");
  assert.deepEqual([april.paid, april.payments[0].id], [900, paymentId]);
  const beforeRejectedSave = (await as(owner, () => exportIncomeBackup())).tables;
  await assert.rejects(
    as(owner, () => saveOvertimeEntry(entryOf(april, {
      note: "Esta edição deve ser desfeita com o pagamento inválido",
      dayTypes: [{ dayId: april.days[1].id, dayType: "HOLIDAY" }],
      payments: [{ id: randomUUID(), paymentMonth: "2026-05", lines: [{ kind: "OVERTIME_75", hours: 900 }], note: null }],
    }))),
    IncomeEditError,
    "pagamento de outro mês",
  );
  assert.deepEqual((await as(owner, () => exportIncomeBackup())).tables, beforeRejectedSave, "um pagamento inválido não salva parcialmente a declaração nem os dias");
  await as(owner, () => saveOvertimeEntry(entryOf(april, { payments: [] })));
  assert.equal(await prisma.overtimePayment.count({ where: { overtimeMonthId: april.id } }), 0);
  await as(owner, () => saveOvertimeEntry(entryOf(april, { payments: [{ paymentMonth: "2026-05", lines: [{ kind: "OVERTIME_75", hours: 700 }], note: null }] })));

  // Excluir o mês leva os pagamentos e o desfazer os devolve.
  const monthUndo = await as(owner, () => deleteOvertimeMonth(april.id));
  assert.equal(await prisma.overtimePayment.count({ where: { overtimeMonthId: april.id } }), 0);
  await assert.rejects(as(other, () => undoOvertimeChange(monthUndo.undoToken)), IncomeEditError);
  await as(owner, () => undoOvertimeChange(monthUndo.undoToken));
  assert.equal(await prisma.overtimePayment.count({ where: { overtimeMonthId: april.id } }), 1);
  assert.equal(await prisma.overtimeDay.count({ where: { overtimeMonthId: april.id } }), APRIL.length);
});

test("regras: versões e recálculo dos meses importados pela jornada", { skip: !isolated }, async () => {
  const base: RuleInput = {
    effectiveFrom: "2026-01",
    dailyHours: 800,
    weekdayPercent: 75,
    weekdayBeyondPercent: 100,
    saturdayPercent: 100,
    sundayPercent: 100,
    holidayPercent: 100,
    usualDailyLimit: null,
    exceptionalDailyLimit: null,
    netShortfall: false,
    note: null,
  };
  await assert.rejects(as(owner, () => saveOvertimeRules([base, { ...base }])), IncomeEditError, "mesmo mês duas vezes");
  await assert.rejects(as(owner, () => saveOvertimeRules([{ ...base, usualDailyLimit: 400, exceptionalDailyLimit: 200 }])), IncomeEditError);

  // Jornada de 9 h a partir de abril: as horas a mais de abril diminuem.
  await as(owner, () => saveOvertimeRules([base, { ...base, effectiveFrom: "2026-04", dailyHours: 900 }]));
  let view = await as(owner, () => getOvertimeView(new Date("2026-10-08T12:00:00")));
  assert.equal(view.months.find((entry) => entry.month === "2026-04")?.worked, 1800);
  assert.equal(view.months.find((entry) => entry.month === "2026-03")?.rule.weekdayPercent, 75);

  await as(owner, () => saveOvertimeRules([base]));
  view = await as(owner, () => getOvertimeView(new Date("2026-10-08T12:00:00")));
  assert.equal(view.months.find((entry) => entry.month === "2026-04")?.worked, 2300);
  assert.equal(await prisma.overtimeRule.count({ where: { userId: other } }), 0);
});

test("mês declarado à mão, exclusão e desfazer; um usuário não vê o do outro", { skip: !isolated }, async () => {
  const requestId = randomUUID();
  const input: EntryInput = {
    requestId,
    attached: false,
    month: "2026-09",
    startsOn: "2026-08-22",
    endsOn: "2026-09-21",
    totals: { weekday: 1400, weekdayBeyond: 0, saturday: 0, sunday: 0, holiday: 0 },
    compensated: 0,
    note: null,
    dayTypes: [],
    payments: [{ paymentMonth: "2026-10", lines: [{ kind: "OVERTIME_75", hours: 1400 }], note: null }],
  };
  await assert.rejects(as(stranger, () => saveOvertimeEntry(input)), ModuleAccessError);
  assert.equal(await prisma.overtimeMonth.count({ where: { userId: stranger } }), 0);
  assert.deepEqual(await as(owner, () => saveOvertimeEntry(input)), { monthId: requestId });
  assert.deepEqual(await as(owner, () => saveOvertimeEntry(input)), { monthId: requestId }, "repetir o pedido não duplica");
  assert.equal(await prisma.overtimePayment.count({ where: { overtimeMonthId: requestId } }), 1);
  await assert.rejects(as(owner, () => saveOvertimeEntry({ ...input, requestId: randomUUID() })), IncomeEditError, "mês já declarado");
  await assert.rejects(as(owner, () => saveOvertimeEntry({ ...input, requestId: randomUUID(), month: "2026-10" })), IncomeEditError, "período fora do mês");

  const september = (await view()).months.find((entry) => entry.month === "2026-09")!;
  assert.deepEqual([september.source, september.status, september.paid], ["MANUAL", "PAID", 1400]);
  // Outubro ainda sem salário: vale a hora de maio, o último holerite com salário.
  assert.equal(september.payments[0].rate?.month, "2026-05");

  await as(other, () => saveOvertimeEntry({ ...input, requestId: randomUUID(), payments: [] }));
  assert.equal((await as(other, () => getOvertimeView())).months.length, 1);
  await assert.rejects(as(other, () => deleteOvertimeMonth(requestId)), IncomeEditError);

  const { undoToken } = await as(owner, () => deleteOvertimeMonth(requestId));
  assert.equal(await prisma.overtimeMonth.count({ where: { id: requestId } }), 0);
  await assert.rejects(as(other, () => undoOvertimeChange(undoToken)), IncomeEditError);
  await as(owner, () => undoOvertimeChange(undoToken));
  assert.equal(await prisma.overtimeMonth.count({ where: { id: requestId } }), 1);
});

test("backup v4: ida e volta das horas extras e conversão das versões antigas", { skip: !isolated }, async () => {
  const exported = await as(owner, () => exportIncomeBackup());
  assert.equal(exported.version, 4);
  assert.equal(exported.tables.overtimeMonths.length, 3);
  assert.equal(exported.tables.overtimeDays.length, MARCH.length + APRIL.length);
  assert.equal(exported.tables.overtimeRules.length, 1);
  assert.equal(exported.tables.overtimePayments.length, 2);
  assert.ok(!("userId" in exported.tables.overtimeDays[0]));

  await as(owner, () => restoreIncomeBackup(exported));
  assert.deepEqual((await as(owner, () => exportIncomeBackup())).tables, exported.tables);

  const broken = (change: (file: typeof exported) => void) => {
    const file = structuredClone(exported);
    change(file);
    return as(owner, () => restoreIncomeBackup(file));
  };
  await assert.rejects(broken((file) => (file.tables.overtimeDays[0].overtimeMonthId = randomUUID())), IncomeBackupValidationError);
  await assert.rejects(broken((file) => (file.tables.overtimeDays[0].date = "2026-05-30")), IncomeBackupValidationError, "dia fora do período");
  await assert.rejects(broken((file) => (file.tables.overtimeMonths[0].endsOn = "2026-04-02")), IncomeBackupValidationError, "fim em outro mês");
  await assert.rejects(broken((file) => (file.tables.overtimeRules[0].weekdayPercent = 301)), IncomeBackupValidationError);
  await assert.rejects(broken((file) => file.tables.overtimeRules.push({ ...file.tables.overtimeRules[0], id: randomUUID() })), IncomeBackupValidationError);
  await assert.rejects(broken((file) => (file.tables.overtimePayments[0].overtimeMonthId = randomUUID())), IncomeBackupValidationError);
  await assert.rejects(broken((file) => file.tables.overtimePayments.push({ ...file.tables.overtimePayments[0], id: randomUUID() })), IncomeBackupValidationError, "dois pagamentos do mesmo holerite");
  await assert.rejects(broken((file) => (file.tables.incomeMonths[0].overtimeDsr = null)), IncomeBackupValidationError, "o DSR é calculado");

  // Os primeiros arquivos da versão 4 guardavam valores: a prévia informa que serão recalculados.
  const withValues = structuredClone(exported);
  Object.assign(withValues.tables.overtimePayments[0], { amount50: null, amount75: "660.30", amount100: null, dsrAmount: "158.47" });
  assert.match((await as(owner, () => previewIncomeBackup(withValues))).warnings![0], /serão recalculados/);
  await as(owner, () => restoreIncomeBackup(withValues));
  assert.deepEqual((await as(owner, () => exportIncomeBackup())).tables.overtimePayments, exported.tables.overtimePayments);

  // Versão 3: sem horas extras; as colunas antigas da linha do holerite saem se vazias.
  const v3 = structuredClone(exported);
  v3.version = 3;
  for (const row of v3.tables.incomeHourRecords) Object.assign(row, { declaredHours: null, workedHours: null });
  const legacy = { ...v3, tables: { incomeMonths: v3.tables.incomeMonths, incomePayslips: v3.tables.incomePayslips, incomeHourRecords: v3.tables.incomeHourRecords } };
  await as(owner, () => restoreIncomeBackup(legacy));
  assert.equal(await prisma.overtimeMonth.count({ where: { userId: owner } }), 0);
  assert.equal(await prisma.incomeHourRecord.count({ where: { userId: owner } }), exported.tables.incomeHourRecords.length);

  const filled = structuredClone(legacy);
  (filled.tables.incomeHourRecords[0] as Record<string, unknown>).workedHours = "10";
  await assert.rejects(as(owner, () => restoreIncomeBackup(filled)), IncomeBackupValidationError, "horas trabalhadas na linha do holerite");

  await as(owner, () => restoreIncomeBackup(exported));
  assert.equal(await prisma.overtimeMonth.count({ where: { userId: owner } }), 3);
});
