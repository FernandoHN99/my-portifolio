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
      { kind: "SALARY", label: null, employer: "AMARIS", startsOn: "2026-09-01", endsOn: "2026-09-30", grossCents: 1544355, prorated: false },
      { kind: "VACATION", label: null, employer: "AMARIS", startsOn: "2026-09-08", endsOn: "2026-09-13", grossCents: 198939, prorated: false },
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
    updateIncomeMonth(id, september({ payslips: [{ kind: "OTHER", label: "Bônus", employer: "AMARIS", startsOn: "2026-09-01", endsOn: "2026-09-30", grossCents: 100000, prorated: false }] })),
  );
  const saved = (await as(owner, () => getIncomeLedger())).months[0];
  assert.deepEqual(saved.payslips.map((payslip) => [payslip.kind, payslip.label]), [["OTHER", "Bônus"]]);

  await assert.rejects(
    as(owner, () =>
      updateIncomeMonth(id, september({ payslips: [{ kind: "SALARY", label: null, employer: "AMARIS", startsOn: "2026-08-31", endsOn: "2026-09-30", grossCents: 100, prorated: false }] })),
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
