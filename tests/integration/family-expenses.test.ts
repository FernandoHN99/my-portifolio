import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { after, before, test } from "node:test";

import { databaseSchema, getPrismaClient } from "@/lib/prisma";
import { runAsUser } from "@/lib/user-db";
import { ModuleAccessError } from "@/modules/access/application/module-access";
import { restoreBackup } from "@/modules/backup/application/backup";
import {
  exportFamilyBackup,
  FamilyBackupValidationError,
  restoreFamilyBackup,
} from "@/modules/family-expenses/application/family-backup";
import {
  createEntry,
  deleteEntries,
  FamilyEditError,
  settleEntries,
  reopenEntry,
  undoFamilyChange,
  updateEntry,
  updateSeries,
} from "@/modules/family-expenses/application/family-editing";
import { getFamilyLedger } from "@/modules/family-expenses/application/get-family-ledger";
import { filterEntries, NO_FILTERS, summarizeEntries } from "@/modules/family-expenses/domain/ledger";

// Specs 081 a 084, no banco: só roda no schema descartável `gastos_familiares_teste`
// (pnpm db:test-schema create gastos_familiares_teste). Na execução normal,
// em public, é ignorado sem gravar nada.
const isolated = databaseSchema(process.env.DATABASE_URL ?? "") === "gastos_familiares_teste";
const prisma = getPrismaClient()!;
const owner = randomUUID();
const friend = randomUUID();
const stranger = randomUUID();
const base = { direction: "RECEIVABLE" as const, status: "PENDING" as const, repeat: null };

before(async () => {
  if (!isolated) return;
  for (const [id, label] of [
    [owner, "dono"],
    [friend, "outro com a área"],
    [stranger, "amigo só com Investimentos"],
  ]) {
    await prisma.user.create({ data: { id, name: label, email: `${id}@example.test` } });
  }
  await prisma.moduleGrant.createMany({
    data: [
      { userId: owner, module: "FAMILY_EXPENSES" },
      { userId: friend, module: "FAMILY_EXPENSES" },
    ],
  });
});

after(async () => {
  if (!isolated) return;
  await prisma.user.deleteMany({ where: { id: { in: [owner, friend, stranger] } } });
  await prisma.$disconnect();
});

const as = <T>(userId: string, operation: () => Promise<T>) => runAsUser(userId, operation);

test("sem a concessão, leitura, gravação e backup da área são recusados", { skip: !isolated }, async () => {
  await assert.rejects(as(stranger, () => getFamilyLedger()), ModuleAccessError);
  await assert.rejects(
    as(stranger, () =>
      createEntry({ ...base, competence: "2026-10", description: "X", contact: { newContactName: "Sandra" }, amountCents: 100, requestId: randomUUID() }),
    ),
    ModuleAccessError,
  );
  await assert.rejects(as(stranger, () => exportFamilyBackup()), ModuleAccessError);
  assert.equal(await prisma.familyEntry.count({ where: { userId: stranger } }), 0);
});

test("lançamento único: repetir o pedido não duplica, e o saldo vem do tipo", { skip: !isolated }, async () => {
  const requestId = randomUUID();
  const input = { ...base, competence: "2026-10", description: "Spotify", contact: { newContactName: "Sandra" }, amountCents: 825, requestId };
  const first = await as(owner, () => createEntry(input));
  const again = await as(owner, () => createEntry(input));
  assert.deepEqual([first.created, again.repeated], [1, true]);

  const parallel = randomUUID();
  const results = await Promise.all(
    [1, 2, 3].map(() => as(owner, () => createEntry({ ...input, description: "Paralelo", requestId: parallel }))),
  );
  assert.equal(results.filter((result) => !result.repeated).length, 1);
  assert.equal(await prisma.familyEntry.count({ where: { userId: owner, description: "Paralelo" } }), 1);

  const stored = await prisma.familyEntry.findUniqueOrThrow({ where: { id: requestId } });
  assert.equal(stored.amount.toString(), "8.25");
  assert.equal(stored.competence.toISOString(), "2026-10-01T00:00:00.000Z");
});

test("pedidos simultâneos com a mesma pessoa nova gravam todos, sem duplicar a pessoa", { skip: !isolated }, async () => {
  const requests = [1, 2, 3, 4].map((index) => ({
    ...base,
    competence: "2026-10",
    description: `Simultâneo ${index}`,
    contact: { newContactName: "Pessoa Nova" },
    amountCents: 100 * index,
    requestId: randomUUID(),
  }));
  const results = await Promise.all(requests.map((input) => as(owner, () => createEntry(input))));
  assert.deepEqual(results.map((result) => result.repeated), [false, false, false, false]);
  assert.equal(await prisma.familyContact.count({ where: { userId: owner, normalizedName: "pessoa nova" } }), 1);
  assert.equal(await prisma.familyEntry.count({ where: { userId: owner, description: { startsWith: "Simultâneo" } } }), 4);
  await prisma.familyEntry.deleteMany({ where: { userId: owner, description: { startsWith: "Simultâneo" } } });
  await prisma.familyContact.deleteMany({ where: { userId: owner, normalizedName: "pessoa nova" } });
});

test("o banco recusa valor zero ou negativo", { skip: !isolated }, async () => {
  const contact = await prisma.familyContact.findFirstOrThrow({ where: { userId: owner } });
  await assert.rejects(
    prisma.familyEntry.create({
      data: { userId: owner, contactId: contact.id, competence: new Date("2026-10-01"), description: "Zero", direction: "PAYABLE", amount: "0" },
    }),
  );
});

test("pessoas e lançamentos de um usuário não são alcançados por outro", { skip: !isolated }, async () => {
  const ownerLedger = await as(owner, () => getFamilyLedger());
  const target = ownerLedger.entries[0];

  const friendLedger = await as(friend, () => getFamilyLedger());
  assert.equal(friendLedger.entries.length, 0);
  assert.equal(friendLedger.contacts.length, 0);

  await assert.rejects(as(friend, () => settleEntries([target.id])), FamilyEditError);
  await assert.rejects(as(friend, () => deleteEntries({ ids: [target.id] })), FamilyEditError);
  await assert.rejects(
    as(friend, () =>
      updateEntry(target.id, { competence: "2026-10", description: "Invadido", contact: { contactId: target.contactId }, direction: "PAYABLE", amountCents: 1, status: "SETTLED" }),
    ),
    FamilyEditError,
  );
  // A pessoa do dono também não serve para um lançamento do outro.
  await assert.rejects(
    as(friend, () => createEntry({ ...base, competence: "2026-10", description: "X", contact: { contactId: target.contactId }, amountCents: 100, requestId: randomUUID() })),
    FamilyEditError,
  );

  const unchanged = await prisma.familyEntry.findUniqueOrThrow({ where: { id: target.id } });
  assert.deepEqual([unchanged.description, unchanged.status], [target.description, "PENDING"]);
});

test("acerto em lote é atômico: um id inválido não deixa nada acertado", { skip: !isolated }, async () => {
  const ledger = await as(owner, () => getFamilyLedger());
  const pending = ledger.entries.filter((entry) => entry.status === "PENDING").map((entry) => entry.id);
  await assert.rejects(as(owner, () => settleEntries([...pending, randomUUID()])), FamilyEditError);
  assert.equal(await prisma.familyEntry.count({ where: { userId: owner, status: "SETTLED" } }), 0);

  const result = await as(owner, () => settleEntries(pending));
  assert.equal(result.settled, pending.length);
  await assert.rejects(as(owner, () => settleEntries(pending)), FamilyEditError);

  await as(owner, () => undoFamilyChange(result.undoToken));
  assert.equal(await prisma.familyEntry.count({ where: { userId: owner, status: "SETTLED" } }), 0);
});

test("série parcelada: gera os meses, edita os pendentes e protege os acertados", { skip: !isolated }, async () => {
  const seriesId = randomUUID();
  const created = await as(owner, () =>
    createEntry({
      ...base,
      competence: "2026-11",
      description: "Bicicleta",
      contact: { newContactName: "Marcela" },
      amountCents: 15000,
      repeat: { kind: "INSTALLMENTS", count: 4 },
      requestId: seriesId,
    }),
  );
  assert.equal(created.created, 4);
  const members = await prisma.familyEntry.findMany({ where: { seriesId }, orderBy: { installment: "asc" } });
  assert.deepEqual(
    members.map((entry) => entry.competence.toISOString().slice(0, 7)),
    ["2026-11", "2026-12", "2027-01", "2027-02"],
  );

  await as(owner, () => settleEntries([members[0].id]));
  const contact = { contactId: members[0].contactId };
  const request = { competence: "2026-11", description: "Bicicleta aro 29", contact, direction: "RECEIVABLE" as const, amountCents: 16000, kind: "INSTALLMENTS" as const };

  const edited = await as(owner, () => updateSeries(seriesId, { ...request, count: 3 }));
  assert.deepEqual(edited, { updated: 2, created: 0, removed: 1 });
  const after = await prisma.familyEntry.findMany({ where: { seriesId }, orderBy: { installment: "asc" } });
  assert.deepEqual(
    after.map((entry) => [entry.installment, entry.description, entry.amount.toString(), entry.status]),
    [
      [1, "Bicicleta", "150", "SETTLED"],
      [2, "Bicicleta aro 29", "160", "PENDING"],
      [3, "Bicicleta aro 29", "160", "PENDING"],
    ],
  );

  await assert.rejects(as(owner, () => updateSeries(seriesId, { ...request, count: 0 })));
  await assert.rejects(as(owner, () => updateSeries(seriesId, { ...request, competence: "2026-12", count: 3 })), FamilyEditError);

  const grown = await as(owner, () => updateSeries(seriesId, { ...request, count: 5 }));
  assert.deepEqual(grown, { updated: 2, created: 2, removed: 0 });

  // Excluir os pendentes da série mantém o acertado; desfazer devolve tudo.
  const removed = await as(owner, () => deleteEntries({ seriesId }));
  assert.equal(removed.removed, 4);
  assert.equal(await prisma.familyEntry.count({ where: { seriesId } }), 1);
  await as(owner, () => undoFamilyChange(removed.undoToken));
  assert.equal(await prisma.familyEntry.count({ where: { seriesId } }), 5);
});

test("backup da área: ida e volta exata, estrito e sem tocar na carteira", { skip: !isolated }, async () => {
  const month = await prisma.portfolioMonth.create({ data: { userId: owner, referenceDate: new Date("2026-10-01"), status: "DRAFT" } });
  const exported = await as(owner, () => exportFamilyBackup());
  await as(owner, () => restoreFamilyBackup(exported));
  const again = await as(owner, () => exportFamilyBackup());
  assert.deepEqual(again.tables, exported.tables);
  assert.ok(await prisma.portfolioMonth.findUnique({ where: { id: month.id } }), "a carteira continua");

  // O mesmo arquivo em outro usuário ganha ids novos e não mexe no dono.
  await as(friend, () => restoreFamilyBackup(exported));
  assert.equal(await prisma.familyEntry.count({ where: { userId: friend } }), exported.tables.familyEntries.length);
  assert.equal(await prisma.familyEntry.count({ where: { userId: owner } }), exported.tables.familyEntries.length);

  // Concessões e campos de outro usuário não entram por um backup.
  const withUser = { ...exported, tables: { ...exported.tables, familyEntries: exported.tables.familyEntries.map((row) => ({ ...row, userId: stranger })) } };
  await assert.rejects(as(owner, () => restoreFamilyBackup(withUser)), FamilyBackupValidationError);
  const withGrants = { ...exported, tables: { ...exported.tables, moduleGrants: [{ userId: stranger, module: "FAMILY_EXPENSES" }] } };
  await assert.rejects(as(owner, () => restoreFamilyBackup(withGrants)), FamilyBackupValidationError);
  assert.equal(await prisma.moduleGrant.count({ where: { userId: stranger } }), 0);

  // Restaurar a carteira (um backup antigo, sem esta área) não apaga os gastos.
  await as(owner, () => restoreBackup({ format: "meu-portfolio-backup", version: 5, exportedAt: new Date().toISOString(), tables: {} }));
  assert.equal(await prisma.familyEntry.count({ where: { userId: owner } }), exported.tables.familyEntries.length);
});

const CONVERTED = "backups/gastos-familia/gastos-familia-dados-corretos-2026-10-07.backup.json";

test("carga do arquivo convertido: 494 lançamentos, idempotente e reconciliada", { skip: !isolated || !existsSync(CONVERTED) }, async () => {
  const file = JSON.parse(readFileSync(CONVERTED, "utf8")) as unknown;
  await as(friend, () => restoreFamilyBackup(file));
  await as(friend, () => restoreFamilyBackup(file));
  const ledger = await as(friend, () => getFamilyLedger());
  assert.equal(ledger.entries.length, 494);
  assert.equal(ledger.contacts.length, 11);

  const names = new Map(ledger.contacts.map((contact) => [contact.id, contact.name]));
  const context = { contacts: names, series: new Map() };
  const pending = (competence: string) =>
    summarizeEntries(filterEntries(ledger.entries, { ...NO_FILTERS, competences: [competence], statuses: ["PENDING"] }, context), names).totals
      .pendingCents;
  assert.equal(pending("2026-09"), 34640);
  assert.equal(pending("2026-10"), 83888);
  assert.equal(summarizeEntries(ledger.entries, names).totals.totalCents, 3160370);
});


test("reverter acerto preserva o lançamento, isola o dono e permite desfazer", { skip: !isolated }, async () => {
  const requestId = randomUUID();
  await as(owner, () => createEntry({ ...base, status: "SETTLED", competence: "2026-07", description: "Reversão", contact: { newContactName: "Reversão" }, amountCents: 1234, requestId }));
  const before = await prisma.familyEntry.findUniqueOrThrow({ where: { id: requestId } });
  await assert.rejects(as(stranger, () => reopenEntry(requestId)), ModuleAccessError);
  await assert.rejects(as(friend, () => reopenEntry(requestId)), FamilyEditError);
  const result = await as(owner, () => reopenEntry(requestId));
  const after = await prisma.familyEntry.findUniqueOrThrow({ where: { id: requestId } });
  assert.equal(after.status, "PENDING");
  assert.deepEqual({ ...after, status: before.status, updatedAt: before.updatedAt }, before);
  await assert.rejects(as(owner, () => reopenEntry(requestId)), FamilyEditError);
  await assert.rejects(as(friend, () => undoFamilyChange(result.undoToken)), FamilyEditError);
  await as(owner, () => undoFamilyChange(result.undoToken));
  assert.equal((await prisma.familyEntry.findUniqueOrThrow({ where: { id: requestId } })).status, "SETTLED");
});
