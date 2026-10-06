import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { Prisma } from "../src/generated/prisma/client";
import { databaseSchema, getPrismaClient } from "../src/lib/prisma";
import { runAsUser } from "../src/lib/user-db";
import { exportBackup, restoreBackup } from "../src/modules/backup/application/backup";
import { syncCdi, valueCdiPositions } from "../src/modules/portfolio/application/cdi-positions";
import { editPosition, type PositionEdit } from "../src/modules/portfolio/application/month-editing";
import { ensureMonthsUpToDate } from "../src/modules/portfolio/application/month-rollover";
import { addTransaction, liquidatePosition, removeTransaction } from "../src/modules/portfolio/application/position-transactions";
import { businessDaysBetween, isBusinessDay } from "../src/modules/portfolio/domain/business-days";

// Integração do rendimento automático (spec 079), com CDI simulado: liga e
// desliga pela flag do ativo, pós-fixado pelo CDI e prefixado pela taxa ao ano,
// cada movimentação rendendo desde o próprio dia; rendimento manual bloqueado;
// liquidação no dia do resgate; backup; virada do mês e o fechamento completado
// quando a taxa do último dia útil sai depois. Também a liquidação de uma renda
// fixa manual (spec 076). O roteiro se recusa a usar o schema real e cria um
// usuário descartável no schema de teste indicado abaixo.
assert.equal(databaseSchema(process.env.DATABASE_URL ?? ""), "auto_income_079", "Use o schema auto_income_079.");
const prisma = getPrismaClient()!;
const userId = randomUUID();
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const Decimal = Prisma.Decimal.clone({ precision: 40, rounding: Prisma.Decimal.ROUND_HALF_UP });
const CDI_DAILY = "0.055131";
const cdiFactor = new Decimal(1).plus(new Decimal(CDI_DAILY).div(100).mul("1.1"));
const preFactor = (days: number) => new Decimal("1.12").pow(new Decimal(days).div(252));
const money = (value: InstanceType<typeof Decimal>) => value.toDecimalPlaces(2).toFixed(2);
// Outubro de 2026 tem 21 dias úteis (12/10 é feriado).
const preClose = new Decimal(5000).mul(preFactor(21));

function businessDays(from: string, until: string) {
  const days: string[] = [];
  for (let cursor = from; cursor < until; cursor = new Date(day(cursor).getTime() + 86_400_000).toISOString().slice(0, 10)) {
    if (isBusinessDay(cursor)) days.push(cursor);
  }
  return days;
}

async function main() {
  await prisma.user.create({ data: { id: userId, name: "Teste rendimento automático", email: `${userId}@test.invalid` } });
  const institution = await prisma.institution.create({ data: { userId, name: "Teste", normalizedName: "teste" } });
  const account = await prisma.account.create({ data: { userId, institutionId: institution.id, name: "Principal" } });
  const asset = (name: string, extra: Partial<Prisma.AssetUncheckedCreateInput>) =>
    prisma.asset.create({ data: { userId, name, normalizedKey: `private:teste:${name.toLowerCase()}`, baseCurrency: "BRL", ...extra } });
  const post = await asset("CDB pos", { maturityDate: day("2027-10-01") });
  const pre = await asset("CDB pre", { maturityDate: day("2027-10-01") });
  const manual = await asset("CDB manual", {});
  const cash = await asset("Caixa", { cashAccount: true });
  await prisma.portfolioMonth.create({ data: { userId, referenceDate: day("2026-09-01"), status: "REVIEWED" } });
  const month = await prisma.portfolioMonth.create({ data: { userId, referenceDate: day("2026-10-01"), status: "DRAFT" } });
  // A rentabilidade é de cada classificação do rateio (spec 079).
  const position = async (assetId: string, opening: string, subclass: string, ratePercent: number | null) => {
    const created = await prisma.position.create({
      data: { userId, portfolioMonthId: month.id, accountId: account.id, assetId, openingQuantity: opening, quantity: opening, totalBrl: opening },
    });
    await prisma.positionAllocation.create({
      data: { userId, positionId: created.id, assetClass: "Renda Fixa", subclass, duration: "Curto", weight: 1, ratePercent },
    });
    return created;
  };
  const postPosition = await position(post.id, "10000", "Pós-fixado", 110);
  const prePosition = await position(pre.id, "5000", "Prefixado", 12);
  const manualPosition = await position(manual.id, "1000", "Pós-fixado", null);
  await position(cash.id, "100", "Pós-fixado", null);

  // CDI simulado de outubro, sem o último dia útil (30/10): ele só sai depois
  // da virada do mês, como acontece com o Banco Central.
  const october = businessDays("2026-10-01", "2026-11-01");
  assert.equal(october.length, 21);
  await clearRates();
  await prisma.rateObservation.createMany({
    data: october.slice(0, -1).map((date) => ({ indexer: "CDI", date: day(date), dailyPercent: CDI_DAILY, source: "teste", fetchedAt: day("2026-10-01") })),
  });
  await prisma.rateCoverage.create({
    data: { indexer: "CDI", fromDate: day("2026-09-01"), throughDate: day("2026-10-29"), lastPublishedDate: day("2026-10-29"), fetchedAt: day("2026-10-01") },
  });

  async function balance(id: string, expected: string) {
    const current = await prisma.position.findUniqueOrThrow({ where: { id } });
    assert.equal(current.quantity.toFixed(2), expected);
    assert.equal(current.totalBrl.toFixed(2), expected);
    return current;
  }
  const movement = (positionId: string, kind: "CONTRIBUTION" | "WITHDRAWAL" | "INCOME", amountBrl: string) => ({
    positionId,
    kind,
    amountBrl,
    occurredOn: "2026-10-02",
    quantity: null,
    unitPriceBrl: null,
  });
  const edit = (positionId: string, name: string, subclass: string, ratePercent: string | null, autoIncome: boolean) =>
    editPosition({
      monthId: month.id,
      edit: {
        positionId,
        strategy: null,
        asset: { name, liquidity: null, maturityDate: "2027-10-01", autoIncome } satisfies PositionEdit["asset"],
        allocations: [{ assetClass: "Renda Fixa", subclass, duration: "Curto", weightPercent: "100", ratePercent }],
      },
    });
  const monthClose = (id: string) => valueCdiPositions(prisma, { where: { id }, asOf: "2026-11-01" });

  await runAsUser(userId, async () => {
    // Sem a flag, o rendimento é manual, como antes.
    await addTransaction({ monthId: month.id, transaction: movement(postPosition.id, "INCOME", "50") });
    await balance(postPosition.id, "10050.00");

    // Ligar com um rendimento manual no mês somaria duas vezes.
    await assert.rejects(edit(postPosition.id, "CDB pos", "Pós-fixado", "110", true), /rendimento registrado à mão/);
    await balance(postPosition.id, "10050.00");
    const handIncome = await prisma.positionTransaction.findFirstOrThrow({ where: { positionId: postPosition.id, kind: "INCOME" } });
    await removeTransaction({ monthId: month.id, transactionId: handIncome.id });
    await balance(postPosition.id, "10000.00");

    // Pós-fixado: a base rende desde o dia 1 pelo CDI × 110%; o aporte, desde o
    // próprio dia. A flag sem taxa na classificação, ou com uma classificação
    // sem cálculo automático, é recusada.
    await assert.rejects(edit(manualPosition.id, "CDB manual", "Pós-fixado", null, true), /ter a rentabilidade/);
    await assert.rejects(edit(manualPosition.id, "CDB manual", "IPCA", null, true), /pós-fixada ou prefixada/);
    await assert.rejects(edit(manualPosition.id, "CDB manual", "IPCA", "6", false), /Só as classificações pós-fixadas ou prefixadas/);
    await edit(postPosition.id, "CDB pos", "Pós-fixado", "110", true);
    assert.equal((await prisma.position.findUniqueOrThrow({ where: { id: postPosition.id } })).calculationStartDate?.toISOString().slice(0, 10), "2026-10-01");
    await addTransaction({ monthId: month.id, transaction: movement(postPosition.id, "CONTRIBUTION", "1000") });
    await monthClose(postPosition.id);
    const postUntil29 = new Decimal(10000).mul(cdiFactor.pow(20)).plus(new Decimal(1000).mul(cdiFactor.pow(19)));
    const valued = await balance(postPosition.id, money(postUntil29));
    assert.equal(valued.incomeCalculatedThrough?.toISOString().slice(0, 10), "2026-10-29");
    assert.equal(valued.calculatedIncomeBrl.toDecimalPlaces(2).toFixed(2), money(postUntil29.minus(11000)));

    // O rendimento vem da taxa: nada de rendimento manual nem retirada acima
    // do saldo daquele dia (02/10: um dia de CDI mais o aporte).
    await assert.rejects(addTransaction({ monthId: month.id, transaction: movement(postPosition.id, "INCOME", "10") }), /calculado automaticamente/);
    await assert.rejects(addTransaction({ monthId: month.id, transaction: movement(postPosition.id, "WITHDRAWAL", "11010") }), /retirada é maior/);
    await monthClose(postPosition.id);
    await balance(postPosition.id, money(postUntil29));

    // Prefixado: (1 + 12%)^(dias úteis/252), sem depender de taxa publicada.
    await edit(prePosition.id, "CDB pre", "Prefixado", "12", true);
    await monthClose(prePosition.id);
    await balance(prePosition.id, money(preClose));

    // Desligar guarda o calculado como "Rendimento automático até…", sem mudar
    // o saldo; religar o recalcula no lugar dele.
    await edit(postPosition.id, "CDB pos", "Pós-fixado", "110", false);
    const folded = await prisma.positionTransaction.findFirstOrThrow({ where: { positionId: postPosition.id, kind: "INCOME" } });
    assert.equal(folded.note, "Rendimento automático até 29/10/2026");
    assert.equal(folded.amountBrl.toFixed(2), money(postUntil29.minus(11000)));
    const off = await balance(postPosition.id, money(postUntil29));
    assert.equal(off.calculationStartDate, null);
    await addTransaction({ monthId: month.id, transaction: movement(postPosition.id, "WITHDRAWAL", "1") });
    await balance(postPosition.id, money(postUntil29.minus(1)));
    const one = await prisma.positionTransaction.findFirstOrThrow({ where: { positionId: postPosition.id, kind: "WITHDRAWAL" } });
    await removeTransaction({ monthId: month.id, transactionId: one.id });
    await edit(postPosition.id, "CDB pos", "Pós-fixado", "110", true);
    assert.equal(await prisma.positionTransaction.count({ where: { positionId: postPosition.id, kind: "INCOME" } }), 0);
    await monthClose(postPosition.id);
    await balance(postPosition.id, money(postUntil29));

    // Liquidar fecha o cálculo no dia do resgate (01/10 rendeu), com o acerto
    // para o valor recebido; apagar a liquidação e salvar religa o cálculo.
    await liquidatePosition({ monthId: month.id, liquidation: { positionId: prePosition.id, occurredOn: "2026-10-02", amountBrl: "5000.00" } });
    const liquidated = await balance(prePosition.id, "0.00");
    assert.equal(liquidated.calculationStartDate, null);
    const legs = await prisma.positionTransaction.findMany({ where: { positionId: prePosition.id }, orderBy: { createdAt: "asc" } });
    const oneDay = money(new Decimal(5000).mul(preFactor(1)).minus(5000));
    assert.deepEqual(
      legs.map((leg) => [leg.kind, leg.amountBrl.toFixed(2), leg.note]),
      [
        ["INCOME", oneDay, "Rendimento automático até 01/10/2026"],
        ["INCOME", `-${oneDay}`, "Liquidação: recebido abaixo do saldo"],
        ["WITHDRAWAL", "5000.00", "Liquidação"],
      ],
    );
    for (const leg of legs.filter((entry) => entry.note?.startsWith("Liquidação")).reverse()) {
      await removeTransaction({ monthId: month.id, transactionId: leg.id });
    }
    await edit(prePosition.id, "CDB pre", "Prefixado", "12", true);
    await monthClose(prePosition.id);
    await balance(prePosition.id, money(preClose));

    // Liquidação de uma renda fixa manual (spec 076): pelo saldo e com acerto
    // para cima e para baixo, sem liquidar duas vezes.
    for (const received of ["1000.00", "990.00", "1010.00"]) {
      await liquidatePosition({ monthId: month.id, liquidation: { positionId: manualPosition.id, occurredOn: "2026-10-02", amountBrl: received } });
      await balance(manualPosition.id, "0.00");
      await assert.rejects(
        liquidatePosition({ monthId: month.id, liquidation: { positionId: manualPosition.id, occurredOn: "2026-10-02", amountBrl: received } }),
        /já está liquidada/,
      );
      const manualLegs = (await prisma.positionTransaction.findMany({ where: { positionId: manualPosition.id, note: { startsWith: "Liquidação" } } }))
        .sort((left, right) => Number(right.kind === "WITHDRAWAL") - Number(left.kind === "WITHDRAWAL"));
      assert.equal(manualLegs.length, received === "1000.00" ? 1 : 2);
      for (const leg of manualLegs) {
        await removeTransaction({ monthId: month.id, transactionId: leg.id });
      }
      await balance(manualPosition.id, "1000.00");
    }

    // Backup: a flag e a taxa de cada classificação vão e voltam; um arquivo
    // sem os campos novos restaura com o cálculo desligado.
    const backup = await exportBackup();
    assert.ok(backup);
    assert.equal(backup.tables.assets.find((row) => row.id === pre.id)!.autoIncome, true);
    assert.equal(backup.tables.positionAllocations.find((row) => row.positionId === prePosition.id)!.ratePercent, "12");
    const without = (rows: Record<string, unknown>[], field: string) =>
      rows.map((row) => Object.fromEntries(Object.entries(row).filter(([name]) => name !== field)));
    const older = structuredClone(backup);
    older.tables.assets = without(older.tables.assets, "autoIncome");
    older.tables.positionAllocations = without(older.tables.positionAllocations, "ratePercent");
    await restoreBackup(older);
    assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: pre.id } })).autoIncome, false);
    assert.equal((await prisma.positionAllocation.findFirstOrThrow({ where: { positionId: prePosition.id } })).ratePercent, null);
    await restoreBackup(backup);
    assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: pre.id } })).autoIncome, true);
    assert.equal((await prisma.positionAllocation.findFirstOrThrow({ where: { positionId: prePosition.id } })).ratePercent?.toString(), "12");
    await balance(postPosition.id, money(postUntil29));

    // Virada: o fechamento de outubro vira a base de novembro, que rende desde
    // o dia 1 só onde a flag está ligada.
    await ensureMonthsUpToDate(day("2026-11-02"));
    const inherited = async (assetId: string) =>
      prisma.position.findFirstOrThrow({ where: { userId, assetId, portfolioMonth: { referenceDate: day("2026-11-01") } } });
    const postNovember = await inherited(post.id);
    assert.equal(postNovember.openingQuantity.toFixed(2), money(postUntil29));
    assert.equal(postNovember.calculationStartDate?.toISOString().slice(0, 10), "2026-11-01");
    assert.equal((await prisma.positionAllocation.findFirstOrThrow({ where: { positionId: postNovember.id } })).ratePercent?.toString(), "110");
    assert.equal((await inherited(pre.id)).openingQuantity.toFixed(2), money(preClose));
    assert.equal((await inherited(manual.id)).calculationStartDate, null);
    assert.equal((await inherited(cash.id)).calculationStartDate, null);
  });

  // O CDI de 30/10 sai depois da virada: o job completa o fechamento de
  // outubro, já revisado, e leva o saldo à base de novembro.
  const fetched: string[] = [];
  const report = await syncCdi(prisma, {
    now: new Date("2026-11-03T15:00:00.000Z"),
    fetchRates: async (start, end) => {
      fetched.push(`${start}..${end}`);
      return [{ date: "2026-10-30", dailyPercent: CDI_DAILY }];
    },
  });
  assert.deepEqual(fetched, ["2026-10-30..2026-11-03"]);
  assert.equal(report.rates.through, "2026-10-30");
  const postClose = new Decimal(10000).mul(cdiFactor.pow(21)).plus(new Decimal(1000).mul(cdiFactor.pow(20)));
  assert.equal(businessDaysBetween("2026-10-02", "2026-11-01"), 20);
  const october30 = await prisma.position.findUniqueOrThrow({ where: { id: postPosition.id } });
  assert.equal(october30.quantity.toFixed(2), money(postClose));
  assert.equal(october30.incomeCalculatedThrough?.toISOString().slice(0, 10), "2026-10-30");
  const november = await prisma.position.findFirstOrThrow({ where: { userId, assetId: post.id, portfolioMonth: { referenceDate: day("2026-11-01") } } });
  assert.equal(november.openingQuantity.toFixed(2), money(postClose));
  assert.equal(november.quantity.toFixed(2), money(postClose));
  // Novembro começa num domingo, e 02/11 é feriado: o prefixado ainda não rendeu.
  const preNovember = await prisma.position.findFirstOrThrow({ where: { userId, assetId: pre.id, portfolioMonth: { referenceDate: day("2026-11-01") } } });
  assert.equal(preNovember.quantity.toFixed(2), money(preClose));

  console.info("Rendimento automático: flag, pós-fixado pelo CDI, prefixado, bloqueios, desligar e religar, liquidação, backup, virada e fechamento completado passaram no schema isolado.");
}

// As taxas são de todos; no schema de teste, só as deste roteiro existem.
async function clearRates() {
  await prisma.rateObservation.deleteMany({ where: { indexer: "CDI" } });
  await prisma.rateCoverage.deleteMany({ where: { indexer: "CDI" } });
}

main().finally(async () => {
  await clearRates();
  // Account aponta à instituição com NoAction; retire primeiro as posições
  // e contas do usuário criado por este roteiro, antes da cascata do usuário.
  await prisma.$transaction([
    prisma.position.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    prisma.user.deleteMany({ where: { id: userId } }),
  ]);
  await prisma.$disconnect();
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
