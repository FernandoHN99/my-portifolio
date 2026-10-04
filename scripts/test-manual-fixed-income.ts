import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { PrismaClient } from "../src/generated/prisma/client";
import { databaseSchema, getPrismaClient } from "../src/lib/prisma";
import { runAsUser } from "../src/lib/user-db";
import { exportBackup, restoreBackup } from "../src/modules/backup/application/backup";
import { syncCdi, syncCdiRates, valueCdiPositions } from "../src/modules/portfolio/application/cdi-positions";
import { editPosition } from "../src/modules/portfolio/application/month-editing";
import { ensureMonthsUpToDate } from "../src/modules/portfolio/application/month-rollover";
import { addTransaction, liquidatePosition, removeTransaction, updateTransaction } from "../src/modules/portfolio/application/position-transactions";

// Integração da pausa do CDI (spec 065). O roteiro se recusa a usar o schema
// real e cria um usuário descartável no schema de teste indicado abaixo.
assert.equal(databaseSchema(process.env.DATABASE_URL ?? ""), "manual_fixed_income_065", "Use o schema manual_fixed_income_065.");
const prisma = getPrismaClient()!;
const userId = randomUUID();
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

async function main() {
  // Nem acesso ao banco nem consulta de provedor podem acontecer na pausa.
  const noAccess = new Proxy({}, { get: () => { throw new Error("A pausa tentou consultar uma dependência."); } }) as PrismaClient;
  assert.equal((await syncCdi(noAccess)).rates.state, "skipped");
  assert.equal((await syncCdiRates(noAccess, { monthIds: [] })).state, "skipped");
  assert.deepEqual(await valueCdiPositions(noAccess, { where: {} }), []);

  await prisma.user.create({ data: { id: userId, name: "Teste renda fixa manual", email: `${userId}@test.invalid` } });
  const institution = await prisma.institution.create({ data: { userId, name: "Teste", normalizedName: "teste" } });
  const account = await prisma.account.create({ data: { userId, institutionId: institution.id, name: "Principal" } });
  const asset = await prisma.asset.create({
    data: { userId, name: "CDB manual", normalizedKey: "private:teste:cdb manual:2026-10-01", baseCurrency: "BRL", cdiPercent: 105, appliedOn: day("2026-09-01"), maturityDate: day("2026-10-01") },
  });
  const cash = await prisma.asset.create({ data: { userId, name: "Caixa", normalizedKey: "private:teste:caixa", baseCurrency: "BRL", cashAccount: true } });
  const previous = await prisma.portfolioMonth.create({ data: { userId, referenceDate: day("2026-09-01"), status: "REVIEWED" } });
  const month = await prisma.portfolioMonth.create({ data: { userId, referenceDate: day("2026-10-01"), status: "DRAFT" } });
  const oldPosition = await prisma.position.create({ data: { userId, portfolioMonthId: previous.id, accountId: account.id, assetId: asset.id, openingQuantity: 1000, quantity: 1000, totalBrl: 1000 } });
  const position = await prisma.position.create({
    data: { userId, portfolioMonthId: month.id, accountId: account.id, assetId: asset.id, openingQuantity: 1000, quantity: "1020.30", totalBrl: "1020.30", calculationStartDate: day("2026-10-01"), calculatedIncomeBrl: "20.30100000", incomeCalculatedThrough: day("2026-10-02") },
  });
  const destination = await prisma.position.create({ data: { userId, portfolioMonthId: month.id, accountId: account.id, assetId: cash.id, openingQuantity: 100, quantity: 100, totalBrl: 100 } });
  await prisma.positionAllocation.create({ data: { userId, positionId: position.id, assetClass: "Renda fixa", subclass: "CDI", duration: "Curto", weight: 1 } });

  async function balance(id: string, expected: string) {
    const current = await prisma.position.findUniqueOrThrow({ where: { id } });
    assert.equal(current.quantity.toFixed(2), expected);
    assert.equal(current.totalBrl.toFixed(2), expected);
    return current;
  }
  const movement = (kind: "CONTRIBUTION" | "WITHDRAWAL" | "INCOME", amountBrl: string) => ({ positionId: position.id, kind, amountBrl, occurredOn: "2026-10-02", quantity: null, unitPriceBrl: null });

  await runAsUser(userId, async () => {
    await valueCdiPositions(prisma, { where: { id: position.id }, asOf: "2026-11-01" });
    await balance(position.id, "1020.30");
    await addTransaction({ monthId: month.id, transaction: movement("CONTRIBUTION", "500") });
    await balance(position.id, "1520.30");
    await addTransaction({ monthId: month.id, transaction: movement("INCOME", "50") });
    await balance(position.id, "1570.30");
    const contribution = await prisma.positionTransaction.findFirstOrThrow({ where: { positionId: position.id, kind: "CONTRIBUTION" } });
    await updateTransaction({ monthId: month.id, transactionId: contribution.id, transaction: movement("CONTRIBUTION", "1000") });
    await balance(position.id, "2070.30");
    await addTransaction({ monthId: month.id, transaction: movement("WITHDRAWAL", "200") });
    await balance(position.id, "1870.30");
    await assert.rejects(addTransaction({ monthId: month.id, transaction: movement("WITHDRAWAL", "5000") }), /retirada é maior/);
    await balance(position.id, "1870.30");
    const withdrawal = await prisma.positionTransaction.findFirstOrThrow({ where: { positionId: position.id, kind: "WITHDRAWAL" } });
    await removeTransaction({ monthId: month.id, transactionId: withdrawal.id });
    await balance(position.id, "2070.30");
    await balance(oldPosition.id, "1000.00");

    // Campos obsoletos de um formulário aberto antes da pausa também não
    // convertem juros em outra transação, nem limpam metadados existentes.
    await editPosition({
      monthId: month.id,
      edit: { positionId: position.id, cdiStartDate: null, strategy: "Reserva", asset: { name: "CDB revisado", liquidity: null, maturityDate: "2026-10-01", cdiPercent: null }, allocations: [{ assetClass: "Renda fixa", subclass: "CDI", duration: "Curto", weightPercent: "100" }] },
    });
    const kept = await balance(position.id, "2070.30");
    assert.equal(kept.calculatedIncomeBrl.toString(), "20.301");
    assert.equal(kept.calculationStartDate?.toISOString().slice(0, 10), "2026-10-01");
    assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).cdiPercent?.toString(), "105");
    assert.equal(await prisma.positionTransaction.count({ where: { positionId: position.id, kind: "INCOME" } }), 1);

    // Uma retirada total comum também pode usar os juros anteriores, sem
    // tratar a base nominal como o limite disponível para retirada.
    await addTransaction({ monthId: month.id, transaction: movement("WITHDRAWAL", "2070.30") });
    await balance(position.id, "0.00");
    const fullWithdrawal = await prisma.positionTransaction.findFirstOrThrow({ where: { positionId: position.id, kind: "WITHDRAWAL" } });
    await removeTransaction({ monthId: month.id, transactionId: fullWithdrawal.id });
    await balance(position.id, "2070.30");

    // Liquidação pelo saldo e com acerto para cima/baixo: crédito único,
    // título zerado e exclusão atômica de todas as pernas.
    for (const [received, cashBalance] of [["2070.30", "2170.30"], ["2000.00", "2100.00"], ["2100.00", "2200.00"]]) {
      await liquidatePosition({ monthId: month.id, liquidation: { positionId: position.id, destinationPositionId: destination.id, occurredOn: "2026-10-02", amountBrl: received } });
      await balance(position.id, "0.00");
      await balance(destination.id, cashBalance);
      await assert.rejects(liquidatePosition({ monthId: month.id, liquidation: { positionId: position.id, destinationPositionId: destination.id, occurredOn: "2026-10-02", amountBrl: received } }), /já está zerado/);
      const liquidation = await prisma.positionTransaction.findFirstOrThrow({ where: { positionId: position.id, transferId: { not: null }, kind: "WITHDRAWAL" } });
      await removeTransaction({ monthId: month.id, transactionId: liquidation.id });
      await balance(position.id, "2070.30");
      await balance(destination.id, "100.00");
    }

    const backup = await exportBackup();
    assert.ok(backup);
    const saved = backup.tables.positions.find((row) => row.id === position.id)!;
    assert.equal(saved.calculatedIncomeBrl, "20.301");
    await restoreBackup(backup);
    await balance(position.id, "2070.30");
    assert.equal((await prisma.position.findUniqueOrThrow({ where: { id: position.id } })).calculatedIncomeBrl.toString(), "20.301");

    await ensureMonthsUpToDate(day("2026-11-02"));
    const inherited = await prisma.position.findFirstOrThrow({ where: { userId, assetId: asset.id, portfolioMonth: { referenceDate: day("2026-11-01") } } });
    assert.equal(inherited.openingQuantity.toFixed(2), "2070.30");
    assert.equal(inherited.calculatedIncomeBrl.toString(), "0");
    assert.equal(await prisma.positionTransaction.count({ where: { positionId: inherited.id } }), 0);
    await balance(inherited.id, "2070.30");
    await balance(position.id, "2070.30");
  });
  console.info("Renda fixa manual: pausa sem consultas, saldo preservado, movimentos/correções, liquidação, backup e virada passaram no schema isolado.");
}

main().finally(async () => {
  // Account aponta à instituição com NoAction; retire primeiro as posições
  // e contas do usuário criado por este roteiro, antes da cascata do usuário.
  await prisma.$transaction([
    prisma.position.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    prisma.user.deleteMany({ where: { id: userId } }),
  ]);
  await prisma.$disconnect();
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
