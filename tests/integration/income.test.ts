import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { after, before, test } from "node:test";

import { databaseSchema, getPrismaClient } from "@/lib/prisma";
import { runAsUser } from "@/lib/user-db";
import { ModuleAccessError } from "@/modules/access/application/module-access";
import { getIncomeLedger } from "@/modules/income/application/get-income-ledger";
import { exportIncomeBackup, IncomeBackupValidationError, restoreIncomeBackup } from "@/modules/income/application/income-backup";
import {
  createIncomeMonth,
  deleteIncomeMonth,
  IncomeEditError,
  undoIncomeChange,
  updateIncomeMonth,
  type IncomeMonthInput,
} from "@/modules/income/application/income-editing";
import { summarizeYear } from "@/modules/income/domain/income";
import { getPensionData } from "@/modules/pension/application/get-pension-summary";
import { summarizePensionYear } from "@/modules/pension/domain/pension";

// Specs 088, 089 e 092, no banco: só roda no schema descartável `recebimentos_teste`
// (pnpm db:test-schema create recebimentos_teste). Na execução normal, em
// public, é ignorado sem gravar nada.
const isolated = databaseSchema(process.env.DATABASE_URL ?? "") === "recebimentos_teste";
const prisma = getPrismaClient()!;
const owner = randomUUID();
const other = randomUUID();
const stranger = randomUUID();

const EMPTY = { netIncomeCents: null, mealVoucherCents: null, cardSpendCents: null, pixSpendCents: null, mealVoucherSpendCents: null };

function september(overrides: Partial<IncomeMonthInput> = {}): IncomeMonthInput {
  return {
    month: "2026-09",
    values: { ...EMPTY, netIncomeCents: 1005882, mealVoucherCents: 110000, cardSpendCents: 200050 },
    payslips: [
      { kind: "SALARY", label: null, employer: "AMARIS", startsOn: "2026-09-01", endsOn: "2026-09-30", grossCents: 1544355, prorated: false, taxable: true },
      { kind: "VACATION", label: null, employer: "AMARIS", startsOn: "2026-09-08", endsOn: "2026-09-13", grossCents: 198939, prorated: false, taxable: true },
    ],
    ...overrides,
  };
}

before(async () => {
  if (!isolated) return;
  for (const [id, label] of [
    [owner, "dono"],
    [other, "outro com as áreas"],
    [stranger, "amigo só com Investimentos"],
  ]) {
    await prisma.user.create({ data: { id, name: label, email: `${id}@example.test` } });
  }
  await prisma.moduleGrant.createMany({
    data: [
      { userId: owner, module: "INCOME" },
      { userId: owner, module: "PENSION" },
      { userId: other, module: "INCOME" },
      { userId: other, module: "PENSION" },
    ],
  });
});

after(async () => {
  if (!isolated) return;
  // A carteira de teste sai na ordem das chaves compostas; o resto vai com o usuário.
  const userId = { in: [owner, other, stranger] };
  await prisma.positionTransaction.deleteMany({ where: { userId } });
  await prisma.position.deleteMany({ where: { userId } });
  await prisma.portfolioMonth.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.asset.deleteMany({ where: { userId } });
  await prisma.institution.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

const as = <T>(userId: string, operation: () => Promise<T>) => runAsUser(userId, operation);

test("sem a concessão, Recebimentos e Previdência recusam leitura, gravação e backup", { skip: !isolated }, async () => {
  await assert.rejects(as(stranger, () => getIncomeLedger()), ModuleAccessError);
  await assert.rejects(as(stranger, () => createIncomeMonth({ ...september(), requestId: randomUUID() })), ModuleAccessError);
  await assert.rejects(as(stranger, () => exportIncomeBackup()), ModuleAccessError);
  await assert.rejects(as(stranger, () => getPensionData()), ModuleAccessError);
  assert.equal(await prisma.incomeMonth.count({ where: { userId: stranger } }), 0);
});

test("mês com holerites: repetir o pedido não duplica, e o mês é único por usuário", { skip: !isolated }, async () => {
  const requestId = randomUUID();
  assert.deepEqual(await as(owner, () => createIncomeMonth({ ...september(), requestId })), { repeated: false });
  assert.deepEqual(await as(owner, () => createIncomeMonth({ ...september(), requestId })), { repeated: true });
  await assert.rejects(as(owner, () => createIncomeMonth({ ...september(), requestId: randomUUID() })), IncomeEditError);

  const ledger = await as(owner, () => getIncomeLedger());
  assert.equal(ledger.months.length, 1);
  assert.equal(ledger.months[0].payslips.length, 2);
  assert.equal(summarizeYear(ledger.months, 2026).totals.balanceCents, 1005882 + 110000 - 200050);
  assert.deepEqual(ledger.employers, ["AMARIS"]);

  // O outro usuário pode lançar o mesmo mês, e um não vê o do outro.
  await as(other, () => createIncomeMonth({ ...september(), requestId: randomUUID() }));
  assert.equal((await as(other, () => getIncomeLedger())).months.length, 1);
  await assert.rejects(as(other, () => deleteIncomeMonth(requestId)), IncomeEditError);
  assert.equal(await prisma.incomeMonth.count({ where: { id: requestId } }), 1);
});

test("salvar troca os holerites inteiros e recusa período fora do mês", { skip: !isolated }, async () => {
  const id = (await as(owner, () => getIncomeLedger())).months[0].id;
  await as(owner, () =>
    updateIncomeMonth(id, september({ payslips: [{ kind: "OTHER", label: "Bônus", employer: "AMARIS", startsOn: "2026-09-01", endsOn: "2026-09-30", grossCents: 100000, prorated: false, taxable: true }] })),
  );
  const saved = (await as(owner, () => getIncomeLedger())).months[0];
  assert.deepEqual(saved.payslips.map((payslip) => [payslip.kind, payslip.label]), [["OTHER", "Bônus"]]);

  await assert.rejects(
    as(owner, () =>
      updateIncomeMonth(id, september({ payslips: [{ kind: "SALARY", label: null, employer: "AMARIS", startsOn: "2026-08-31", endsOn: "2026-09-30", grossCents: 100, prorated: false, taxable: true }] })),
    ),
    IncomeEditError,
  );
  assert.equal((await as(owner, () => getIncomeLedger())).months[0].payslips.length, 1);
});

test("excluir o mês leva os holerites, e o desfazer devolve tudo", { skip: !isolated }, async () => {
  const before = (await as(owner, () => getIncomeLedger())).months;
  const { undoToken } = await as(owner, () => deleteIncomeMonth(before[0].id));
  assert.equal(await prisma.incomePayslip.count({ where: { userId: owner } }), 0);

  // Só o dono desfaz.
  await assert.rejects(as(other, () => undoIncomeChange(undoToken)), IncomeEditError);
  await as(owner, () => undoIncomeChange(undoToken));
  assert.deepEqual((await as(owner, () => getIncomeLedger())).months, before);
});

test("o banco recusa bruto zero, valor negativo e período invertido", { skip: !isolated }, async () => {
  const month = await prisma.incomeMonth.findFirstOrThrow({ where: { userId: owner } });
  const payslip = { userId: owner, incomeMonthId: month.id, employer: "X", startsOn: new Date("2026-09-01"), endsOn: new Date("2026-09-30") };
  await assert.rejects(prisma.incomePayslip.create({ data: { ...payslip, grossSalary: "0" } }));
  await assert.rejects(prisma.incomePayslip.create({ data: { ...payslip, grossSalary: "10", endsOn: new Date("2026-08-01") } }));
  await assert.rejects(prisma.incomeMonth.update({ where: { id: month.id }, data: { pixSpend: "-1" } }));
});

test("backup da área: ida e volta exata, estrito e sem tocar na carteira", { skip: !isolated }, async () => {
  const institution = await prisma.institution.create({ data: { userId: owner, name: "Inter", normalizedName: "inter" } });
  const exported = await as(owner, () => exportIncomeBackup());
  assert.equal(exported.tables.incomeMonths.length, 1);
  assert.ok(!("userId" in exported.tables.incomeMonths[0]));

  await as(owner, () => restoreIncomeBackup(exported));
  assert.deepEqual((await as(owner, () => exportIncomeBackup())).tables, exported.tables);
  assert.equal(await prisma.institution.count({ where: { id: institution.id } }), 1);

  const withUser = structuredClone(exported);
  (withUser.tables.incomeMonths[0] as Record<string, unknown>).userId = owner;
  await assert.rejects(as(owner, () => restoreIncomeBackup(withUser)), IncomeBackupValidationError);
  await assert.rejects(
    as(owner, () => restoreIncomeBackup({ format: "meu-portfolio-backup", version: 5, exportedAt: new Date().toISOString(), tables: {} })),
    IncomeBackupValidationError,
  );
});

test("Previdência: aportes só das posições de previdência do próprio usuário", { skip: !isolated }, async () => {
  const institution = await prisma.institution.findFirstOrThrow({ where: { userId: owner } });
  const account = await prisma.account.create({ data: { userId: owner, institutionId: institution.id, name: "Principal" } });
  const [pension, legacy, fund] = await Promise.all([
    prisma.asset.create({ data: { userId: owner, normalizedKey: "p1", name: "Previdência - Grão FIM", baseCurrency: "BRL", assetType: "pension" } }),
    // Ativo antigo, sem tipo: o nome basta para ser previdência.
    prisma.asset.create({ data: { userId: owner, normalizedKey: "p2", name: "Previdência antiga", baseCurrency: "BRL" } }),
    prisma.asset.create({ data: { userId: owner, normalizedKey: "f1", name: "CDB", baseCurrency: "BRL", assetType: "fixed-income" } }),
  ]);
  const month = await prisma.portfolioMonth.create({ data: { userId: owner, referenceDate: new Date("2026-09-01") } });
  const position = (assetId: string) =>
    prisma.position.create({ data: { userId: owner, portfolioMonthId: month.id, accountId: account.id, assetId, quantity: "1000", totalBrl: "1000" } });
  const [p1, p2, p3] = await Promise.all([position(pension.id), position(legacy.id), position(fund.id)]);
  const movement = (positionId: string, kind: "OPENING" | "CONTRIBUTION" | "INCOME", amount: string, transferId: string | null = null) =>
    prisma.positionTransaction.create({
      data: { userId: owner, positionId, kind, occurredOn: new Date("2026-09-02"), quantity: amount, amountBrl: amount, transferId },
    });
  await movement(p1.id, "CONTRIBUTION", "2000");
  await movement(p1.id, "INCOME", "50");
  await movement(p1.id, "CONTRIBUTION", "300", randomUUID());
  await movement(p2.id, "OPENING", "500");
  await movement(p3.id, "CONTRIBUTION", "999");

  const data = await as(owner, () => getPensionData());
  const year = summarizePensionYear(data.contributions, data.periods, 2026);
  assert.equal(year.contributedCents, 250000);
  assert.deepEqual(year.contributions.map((contribution) => contribution.kind).sort(), ["CONTRIBUTION", "OPENING"]);
  assert.equal(year.taxableCents, 100000);

  // O outro usuário não vê nada disso.
  const others = await as(other, () => getPensionData());
  assert.equal(others.contributions.length, 0);
});

const SHEET = "backups/recebimentos/recebimentos-planilha-2026-10-07.backup.json";

test("carga da planilha: 21 meses e 24 holerites, idempotente e reconciliada", { skip: !isolated || !existsSync(SHEET) }, async () => {
  const file = JSON.parse(readFileSync(SHEET, "utf8")) as unknown;
  await as(other, () => restoreIncomeBackup(file));
  await as(other, () => restoreIncomeBackup(file));
  const ledger = await as(other, () => getIncomeLedger());
  assert.equal(ledger.months.length, 21);
  assert.equal(ledger.months.flatMap((month) => month.payslips).length, 24);

  const totals = summarizeYear(ledger.months, 2026).totals;
  assert.deepEqual([totals.incomeCents, totals.spendCents, totals.balanceCents], [9115785, 3495309, 5620476]);

  const data = await as(other, () => getPensionData());
  assert.equal(summarizePensionYear(data.contributions, data.periods, 2025).taxableCents, 10315050);
  assert.equal(summarizePensionYear(data.contributions, data.periods, 2026).taxableCents, 11517370);
});

// Spec 094: horas do mês. Só o banco e o backup; nenhuma tela as usa ainda.
const march = (): IncomeMonthInput => ({
  month: "2026-03",
  values: { ...EMPTY, netIncomeCents: 874199 },
  payslips: [{ kind: "SALARY", label: null, employer: "AMARIS", startsOn: "2026-03-01", endsOn: "2026-03-31", grossCents: 1179256, prorated: false, taxable: true }],
});

test("horas do mês: uma linha por tipo, limites do banco, escopo e desfazer da exclusão", { skip: !isolated }, async () => {
  const requestId = randomUUID();
  await as(owner, () => createIncomeMonth({ ...march(), requestId }));

  const hours = { userId: owner, incomeMonthId: requestId };
  await prisma.incomeHourRecord.create({
    data: { ...hours, kind: "NORMAL", declaredHours: "200", paidHours: "200", workedHours: "210.5", paidAmount: "10780.35", note: "teste" },
  });
  await prisma.incomeHourRecord.create({ data: { ...hours, kind: "OVERTIME_75", paidHours: "9", paidAmount: "848.95" } });

  // Nulo é "não informado": a linha só com o tipo vale.
  await prisma.incomeHourRecord.create({ data: { ...hours, kind: "OVERTIME_50" } });
  await prisma.incomeHourRecord.delete({ where: { incomeMonthId_kind: { incomeMonthId: requestId, kind: "OVERTIME_50" } } });

  await assert.rejects(prisma.incomeHourRecord.create({ data: { ...hours, kind: "NORMAL", paidHours: "1" } }), "um registro por mês e tipo");
  await assert.rejects(prisma.incomeHourRecord.create({ data: { ...hours, kind: "OVERTIME_100", workedHours: "-1" } }), "horas negativas");
  await assert.rejects(prisma.incomeHourRecord.create({ data: { ...hours, kind: "OVERTIME_100", declaredHours: "744.01" } }), "mais que o mês");
  await assert.rejects(prisma.incomeHourRecord.create({ data: { ...hours, kind: "OVERTIME_100", paidAmount: "-0.01" } }), "valor negativo");
  await assert.rejects(
    prisma.incomeHourRecord.create({ data: { userId: other, incomeMonthId: requestId, kind: "OVERTIME_100" } }),
    "o mês de outro usuário não aceita horas",
  );

  // Salvar o mês troca os holerites, não as horas.
  await as(owner, () => updateIncomeMonth(requestId, march()));
  assert.equal(await prisma.incomeHourRecord.count({ where: hours }), 2);

  const before = await prisma.incomeHourRecord.findMany({ where: hours, orderBy: { kind: "asc" } });
  const { undoToken } = await as(owner, () => deleteIncomeMonth(requestId));
  assert.equal(await prisma.incomeHourRecord.count({ where: hours }), 0, "as horas saem com o mês");

  await as(owner, () => undoIncomeChange(undoToken));
  const after = await prisma.incomeHourRecord.findMany({ where: hours, orderBy: { kind: "asc" } });
  // O desfazer grava de novo, então só o updatedAt muda.
  const stable = (rows: typeof before) => rows.map((row) => ({ ...row, updatedAt: null }));
  assert.deepEqual(stable(after), stable(before), "o desfazer devolve as horas com os mesmos valores");
});

test("backup das horas: ida e volta exata e conferência estrita", { skip: !isolated }, async () => {
  const exported = await as(owner, () => exportIncomeBackup());
  assert.equal(exported.version, 3);
  assert.equal(exported.tables.incomeHourRecords.length, 2);
  assert.ok(!("userId" in exported.tables.incomeHourRecords[0]));

  await as(owner, () => restoreIncomeBackup(exported));
  assert.deepEqual((await as(owner, () => exportIncomeBackup())).tables, exported.tables);

  const broken = (change: (file: ReturnType<typeof structuredClone<typeof exported>>) => void) => {
    const file = structuredClone(exported);
    change(file);
    return as(owner, () => restoreIncomeBackup(file));
  };
  const first = (file: typeof exported) => file.tables.incomeHourRecords[0] as Record<string, unknown>;

  await assert.rejects(broken((file) => (first(file).userId = owner)), IncomeBackupValidationError, "userId");
  await assert.rejects(broken((file) => (first(file).kind = "OVERTIME_200")), IncomeBackupValidationError, "tipo desconhecido");
  await assert.rejects(broken((file) => (first(file).workedHours = "744.01")), IncomeBackupValidationError, "mais que o mês");
  await assert.rejects(broken((file) => (first(file).paidAmount = "-1")), IncomeBackupValidationError, "valor negativo");
  await assert.rejects(broken((file) => (first(file).incomeMonthId = randomUUID())), IncomeBackupValidationError, "mês que não existe");
  await assert.rejects(
    broken((file) => file.tables.incomeHourRecords.push({ ...first(file), id: randomUUID() })),
    IncomeBackupValidationError,
    "mesmo tipo duas vezes no mês",
  );
  await assert.rejects(broken((file) => (file.version = 4)), IncomeBackupValidationError, "versão mais nova");

  // A versão 1 não tem a tabela de horas: vale como vazia.
  const v1 = { ...structuredClone(exported), version: 1, tables: { ...exported.tables, incomeHourRecords: undefined } };
  await as(owner, () => restoreIncomeBackup(v1));
  assert.equal(await prisma.incomeHourRecord.count({ where: { userId: owner } }), 0);
});

const PAYSLIPS_2026 = "backups/recebimentos/recebimentos-holerites-2026-10-08.backup.json";

test(
  "carga dos holerites de 2026: 13º de junho, 18 linhas de horas, julho e setembro corrigidos",
  { skip: !isolated || !existsSync(PAYSLIPS_2026) },
  async () => {
    const file = JSON.parse(readFileSync(PAYSLIPS_2026, "utf8")) as unknown;
    await as(other, () => restoreIncomeBackup(file));
    await as(other, () => restoreIncomeBackup(file));

    const ledger = await as(other, () => getIncomeLedger());
    assert.equal(ledger.months.length, 21);
    assert.equal(ledger.months.flatMap((month) => month.payslips).length, 25);

    // Diferenças para a planilha da spec 092: o líquido de julho é o do holerite
    // (+R$ 0,10) e as férias de setembro não contam duas vezes (renda tributável
    // −R$ 1.989,39). O 13º de junho não entra na renda tributável.
    const totals = summarizeYear(ledger.months, 2026).totals;
    assert.deepEqual([totals.incomeCents, totals.spendCents, totals.balanceCents], [9115795, 3495309, 5620486]);
    const data = await as(other, () => getPensionData());
    assert.equal(summarizePensionYear(data.contributions, data.periods, 2026).taxableCents, 11517370 - 198939);

    const monthOf = (competence: string) => ledger.months.find((month) => month.month === competence)!;
    assert.equal(monthOf("2026-07").netIncomeCents, 910665);
    // O arquivo é da versão 2, sem `taxable`: a conversão usa o tipo, como era antes.
    assert.deepEqual(
      ledger.months.flatMap((month) => month.payslips).filter((payslip) => !payslip.taxable).map((payslip) => payslip.kind),
      ["THIRTEENTH"],
    );
    const september = monthOf("2026-09").payslips;
    assert.equal(september.reduce((sum, payslip) => sum + payslip.grossCents, 0), 1544355, "setembro tem o total do holerite, sem duplicar as férias");
    assert.deepEqual(september.map((payslip) => payslip.kind).sort(), ["SALARY", "VACATION"]);

    const records = await prisma.incomeHourRecord.findMany({ where: { userId: other }, include: { month: true } });
    assert.equal(records.length, 18);
    assert.ok(records.every((record) => record.declaredHours === null && record.workedHours === null));

    const of = (month: string, kind: "NORMAL" | "OVERTIME_50" | "OVERTIME_75" | "OVERTIME_100") =>
      records.find((record) => record.month.month.toISOString().startsWith(month) && record.kind === kind);
    assert.equal(of("2026-09", "NORMAL")?.paidHours?.toString(), "173.33");
    assert.equal(of("2026-09", "OVERTIME_75")?.paidHours?.toString(), "18");
    assert.equal(of("2026-09", "OVERTIME_100")?.paidAmount?.toString(), "1443.52");
    assert.equal(of("2026-06", "OVERTIME_50")?.paidHours?.toString(), "49");
    assert.equal(of("2026-03", "OVERTIME_75")?.paidAmount?.toString(), "848.95");
    assert.equal(of("2026-04", "OVERTIME_50"), undefined);

    // Horas normais, extras e DSR de agosto somam o total de vencimentos do holerite.
    const august = records.filter((record) => record.month.month.toISOString().startsWith("2026-08"));
    const paidCents = august.reduce((sum, record) => sum + Math.round(Number(record.paidAmount) * 100), 0);
    assert.equal(paidCents + 44843, 1388427);

    // O escopo por usuário vale para as horas: cada um exporta só as suas.
    assert.equal((await as(other, () => exportIncomeBackup())).tables.incomeHourRecords.length, 18);
    assert.equal((await as(owner, () => exportIncomeBackup())).tables.incomeHourRecords.length, 0);
  },
);

// Spec 095: cada linha do holerite diz se é tributável; o tipo só sugere o padrão.
test("tributável por holerite: gravar, trocar, desfazer e converter backups antigos", { skip: !isolated }, async () => {
  const requestId = randomUUID();
  const line = (kind: "SALARY" | "THIRTEENTH", taxable: boolean, grossCents: number) => ({
    kind,
    label: null,
    employer: "AMARIS",
    startsOn: "2026-11-01",
    endsOn: "2026-11-30",
    grossCents,
    prorated: false,
    taxable,
  });
  const month = (taxableSalary: boolean, taxableThirteenth: boolean): IncomeMonthInput => ({
    month: "2026-11",
    values: EMPTY,
    payslips: [line("SALARY", taxableSalary, 1000000), line("THIRTEENTH", taxableThirteenth, 500000)],
  });
  const flags = async () =>
    (await as(owner, () => getIncomeLedger())).months
      .find((entry) => entry.id === requestId)!
      .payslips.map((payslip) => [payslip.kind, payslip.taxable] as const)
      .sort(([a], [b]) => a.localeCompare(b));
  const pension = async () => {
    const data = await as(owner, () => getPensionData());
    return summarizePensionYear(data.contributions, data.periods, 2026)
      .periods.filter((period) => period.month === "2026-11")
      .map((period) => [period.kind, period.counted] as const)
      .sort(([a], [b]) => a.localeCompare(b));
  };

  // Marcação contrária ao padrão do tipo: salário fora e 13º dentro.
  await as(owner, () => createIncomeMonth({ ...month(false, true), requestId }));
  assert.deepEqual(await flags(), [["SALARY", false], ["THIRTEENTH", true]]);
  assert.deepEqual(await pension(), [["SALARY", false], ["THIRTEENTH", true]], "a Previdência segue a marcação");

  await as(owner, () => updateIncomeMonth(requestId, month(true, false)));
  assert.deepEqual(await flags(), [["SALARY", true], ["THIRTEENTH", false]]);

  const { undoToken } = await as(owner, () => deleteIncomeMonth(requestId));
  await as(owner, () => undoIncomeChange(undoToken));
  assert.deepEqual(await flags(), [["SALARY", true], ["THIRTEENTH", false]], "o desfazer devolve a marcação");

  // Versão 3: `taxable` obrigatório e na ida e volta.
  const exported = await as(owner, () => exportIncomeBackup());
  assert.ok(exported.tables.incomePayslips.every((row) => typeof row.taxable === "boolean"));
  await as(owner, () => restoreIncomeBackup(exported));
  assert.deepEqual((await as(owner, () => exportIncomeBackup())).tables, exported.tables);

  const without = (version: number, which: "first" | "all") => {
    const file = structuredClone(exported);
    file.version = version;
    file.tables.incomePayslips.forEach((row, index) => {
      if (which === "all" || index === 0) delete (row as Record<string, unknown>).taxable;
    });
    return file;
  };
  await assert.rejects(as(owner, () => restoreIncomeBackup(without(3, "first"))), IncomeBackupValidationError, "na versão 3, sem taxable");

  // Versões 1 e 2 não têm o campo: a conversão usa o tipo (13º fora, o resto dentro).
  await as(owner, () => restoreIncomeBackup(without(2, "all")));
  assert.deepEqual(await flags(), [["SALARY", true], ["THIRTEENTH", false]]);
  await as(owner, () => restoreIncomeBackup(without(1, "all")));
  assert.deepEqual(await flags(), [["SALARY", true], ["THIRTEENTH", false]]);
});
