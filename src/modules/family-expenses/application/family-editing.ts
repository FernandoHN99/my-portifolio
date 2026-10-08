import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { FamilyEditError, getFamilyContext } from "@/modules/family-expenses/application/family-db";
import { competenceDate, competenceOf, type Competence } from "@/lib/competence";
import { normalizeText, type Direction, type EntryStatus, type SeriesKind } from "@/modules/family-expenses/domain/ledger";
import { centsToDecimal, type Cents } from "@/lib/money";
import { planSeriesEdit, plannedEntries } from "@/modules/family-expenses/domain/series";
import { SCOPED_USER } from "@/lib/user-db";

// Gravações de Gastos familiares (specs 082 e 083). Toda operação passa pelo
// cliente da área (concessão conferida, usuário da sessão) e roda numa
// transação: um lote ou uma série gravam inteiros ou nada. Os ids recebidos do
// navegador só indicam o registro; quem confere o dono é o escopo do cliente.

type Transaction = Prisma.TransactionClient;

export { FamilyEditError };

export type ContactRef = { contactId: string } | { newContactName: string };

export type EntryFields = {
  competence: Competence;
  description: string;
  contact: ContactRef;
  direction: Direction;
  amountCents: Cents;
};

export type NewEntryInput = EntryFields & {
  status: EntryStatus;
  /** Gera a série já com todas as competências (spec 083). */
  repeat: { kind: SeriesKind; count: number } | null;
  /** Id escolhido pelo navegador: repetir o mesmo pedido não grava de novo. */
  requestId: string;
};

const TRANSACTION = { maxWait: 10_000, timeout: 30_000 } as const;

async function transact<T>(operation: (transaction: Transaction, userId: string) => Promise<T>) {
  const { prisma, userId } = await getFamilyContext();
  return (prisma as PrismaClient).$transaction((transaction) => operation(transaction, userId), TRANSACTION);
}

/** A pessoa escolhida, conferida no escopo, ou uma nova com o nome digitado. */
async function resolveContact(transaction: Transaction, contact: ContactRef) {
  if ("contactId" in contact) {
    const found = await transaction.familyContact.findFirst({ where: { id: contact.contactId }, select: { id: true } });

    if (!found) {
      throw new FamilyEditError("Pessoa não encontrada. Atualize a página e tente de novo.");
    }

    return found.id;
  }

  const name = contact.newContactName.trim().replace(/\s+/g, " ");
  const normalizedName = normalizeText(name);
  const existing = await transaction.familyContact.findFirst({ where: { normalizedName }, select: { id: true } });

  if (existing) {
    return existing.id;
  }

  const created = await transaction.familyContact.create({
    data: { userId: SCOPED_USER, name, normalizedName },
    select: { id: true },
  });
  return created.id;
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Inclui um lançamento ou uma série. Repetir o pedido (duplo clique, nova
 * tentativa ou envio em paralelo) encontra o id já gravado e não duplica.
 */
export async function createEntry(input: NewEntryInput): Promise<{ created: number; repeated: boolean }> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await insertEntry(input);
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      // O id do pedido já gravado é repetição. Outra violação é a pessoa nova
      // criada ao mesmo tempo por outro pedido: na nova tentativa ela já existe.
      const prisma = (await getFamilyContext()).prisma;
      const [entry, series] = await Promise.all([
        prisma.familyEntry.count({ where: { id: input.requestId } }),
        prisma.familySeries.count({ where: { id: input.requestId } }),
      ]);

      if (entry + series > 0) {
        return { created: 0, repeated: true };
      }

      if (attempt > 0) {
        throw error;
      }
    }
  }
}

async function insertEntry(input: NewEntryInput): Promise<{ created: number; repeated: boolean }> {
  return transact(async (transaction) => {
    const contactId = await resolveContact(transaction, input.contact);
    const amount = centsToDecimal(input.amountCents);

    if (!input.repeat) {
      await transaction.familyEntry.create({
        data: {
          id: input.requestId,
          userId: SCOPED_USER,
          contactId,
          competence: competenceDate(input.competence),
          description: input.description,
          direction: input.direction,
          amount,
          status: input.status,
        },
      });
      return { created: 1, repeated: false };
    }

    await transaction.familySeries.create({
      data: {
        id: input.requestId,
        userId: SCOPED_USER,
        contactId,
        kind: input.repeat.kind,
        description: input.description,
        direction: input.direction,
        amount,
        firstCompetence: competenceDate(input.competence),
        count: input.repeat.count,
      },
    });

    const planned = plannedEntries(input.competence, input.repeat.count);
    await transaction.familyEntry.createMany({
      data: planned.map((entry) => ({
        userId: SCOPED_USER,
        contactId,
        competence: competenceDate(entry.competence),
        description: input.description,
        direction: input.direction,
        amount,
        status: "PENDING" as const,
        seriesId: input.requestId,
        installment: entry.installment,
      })),
    });
    return { created: planned.length, repeated: false };
  });
}

/** Edita um lançamento só, mesmo dentro de uma série. */
export async function updateEntry(id: string, fields: EntryFields & { status: EntryStatus }) {
  await transact(async (transaction) => {
    const contactId = await resolveContact(transaction, fields.contact);
    const result = await transaction.familyEntry.updateMany({
      where: { id },
      data: {
        contactId,
        competence: competenceDate(fields.competence),
        description: fields.description,
        direction: fields.direction,
        amount: centsToDecimal(fields.amountCents),
        status: fields.status,
      },
    });

    if (result.count !== 1) {
      throw new FamilyEditError("Lançamento não encontrado. Atualize a página e tente de novo.");
    }
  });
}

/**
 * Edita a série toda (spec 083): os pendentes recebem os dados novos e a
 * competência pela posição na série; os acertados ficam como estão; a
 * quantidade nova cria ou tira pendentes no fim.
 */
export async function updateSeries(
  seriesId: string,
  request: EntryFields & { kind: SeriesKind; count: number },
): Promise<{ updated: number; created: number; removed: number }> {
  return transact(async (transaction, userId) => {
    // Trava a série do usuário: duas edições ao mesmo tempo não se misturam.
    const locked = await transaction.$queryRaw<{ id: string }[]>`
      SELECT "id"::text AS "id" FROM "family_series"
      WHERE "id" = ${seriesId}::uuid AND "user_id" = ${userId}::uuid FOR UPDATE`;
    const series = locked.length
      ? await transaction.familySeries.findFirst({ where: { id: seriesId }, select: { firstCompetence: true, count: true } })
      : null;

    if (!series) {
      throw new FamilyEditError("Série não encontrada. Atualize a página e tente de novo.");
    }

    const members = await transaction.familyEntry.findMany({
      where: { seriesId },
      select: { id: true, installment: true, status: true },
    });
    const plan = planSeriesEdit(
      members.map((member) => ({ id: member.id, installment: member.installment ?? 0, status: member.status })),
      { firstCompetence: competenceOf(series.firstCompetence), count: series.count },
      { firstCompetence: request.competence, count: request.count },
    );

    if (!plan.ok) {
      throw new FamilyEditError(plan.message);
    }

    const contactId = await resolveContact(transaction, request.contact);
    const amount = centsToDecimal(request.amountCents);
    const shared = { contactId, description: request.description, direction: request.direction, amount };

    await transaction.familySeries.updateMany({
      where: { id: seriesId },
      data: {
        ...shared,
        kind: request.kind,
        firstCompetence: competenceDate(request.competence),
        count: request.count,
      },
    });

    if (plan.remove.length > 0) {
      await transaction.familyEntry.deleteMany({ where: { id: { in: plan.remove }, seriesId, status: "PENDING" } });
    }

    for (const entry of plan.update) {
      await transaction.familyEntry.updateMany({
        where: { id: entry.id, seriesId, status: "PENDING" },
        data: { ...shared, competence: competenceDate(entry.competence) },
      });
    }

    if (plan.create.length > 0) {
      await transaction.familyEntry.createMany({
        data: plan.create.map((entry) => ({
          ...shared,
          userId: SCOPED_USER,
          competence: competenceDate(entry.competence),
          status: "PENDING" as const,
          seriesId,
          installment: entry.installment,
        })),
      });
    }

    return { updated: plan.update.length, created: plan.create.length, removed: plan.remove.length };
  });
}

// Desfazer das exclusões e dos acertos, como o da carteira: o retrato fica na
// memória do servidor por alguns minutos, com o dono, e o navegador só recebe
// o token.

type EntrySnapshot = {
  id: string;
  contactId: string;
  competence: Date;
  description: string;
  direction: Direction;
  amount: string;
  status: EntryStatus;
  seriesId: string | null;
  installment: number | null;
  createdAt: Date;
};

type SeriesSnapshot = {
  id: string;
  contactId: string;
  kind: SeriesKind;
  description: string;
  direction: Direction;
  amount: string;
  firstCompetence: Date;
  count: number;
  createdAt: Date;
};

type UndoEntry =
  | { kind: "delete"; userId: string; expiresAt: number; entries: EntrySnapshot[]; series: SeriesSnapshot[] }
  | { kind: "settle"; userId: string; expiresAt: number; ids: string[] }
  | { kind: "reopen"; userId: string; expiresAt: number; ids: string[] };

const UNDO_TTL_MS = 10 * 60 * 1000;
const globalForUndo = globalThis as unknown as { familyUndo?: Map<string, UndoEntry> };
const undoStore: Map<string, UndoEntry> = (globalForUndo.familyUndo ??= new Map<string, UndoEntry>());

function storeUndo(entry: UndoEntry) {
  const now = Date.now();

  for (const [key, value] of undoStore) {
    if (value.expiresAt < now) {
      undoStore.delete(key);
    }
  }

  const token = randomUUID();
  undoStore.set(token, entry);
  return token;
}

const ENTRY_SNAPSHOT = {
  id: true,
  contactId: true,
  competence: true,
  description: true,
  direction: true,
  amount: true,
  status: true,
  seriesId: true,
  installment: true,
  createdAt: true,
} as const;

/**
 * Exclui lançamentos. Com `wholeSeries`, os pendentes da série do lançamento;
 * os acertados ficam. Uma série sem lançamentos sai junto. Devolve o token do
 * desfazer.
 */
export async function deleteEntries(input: { ids: string[] } | { seriesId: string }) {
  return transact(async (transaction, userId) => {
    const where = "ids" in input ? { id: { in: input.ids } } : { seriesId: input.seriesId, status: "PENDING" as const };
    const rows = await transaction.familyEntry.findMany({ where, select: ENTRY_SNAPSHOT });

    if (rows.length === 0 || ("ids" in input && rows.length !== new Set(input.ids).size)) {
      throw new FamilyEditError("Lançamento não encontrado. Atualize a página e tente de novo.");
    }

    await transaction.familyEntry.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });

    const touched = [...new Set(rows.map((row) => row.seriesId).filter((id): id is string => id !== null))];
    const emptied = touched.length
      ? await transaction.familySeries.findMany({ where: { id: { in: touched }, entries: { none: {} } } })
      : [];

    if (emptied.length > 0) {
      await transaction.familySeries.deleteMany({ where: { id: { in: emptied.map((series) => series.id) } } });
    }

    const token = storeUndo({
      kind: "delete",
      userId,
      expiresAt: Date.now() + UNDO_TTL_MS,
      entries: rows.map(({ amount, ...row }) => ({ ...row, amount: amount.toString() })),
      series: emptied.map((series) => ({
        id: series.id,
        contactId: series.contactId,
        kind: series.kind,
        description: series.description,
        direction: series.direction,
        amount: series.amount.toString(),
        firstCompetence: series.firstCompetence,
        count: series.count,
        createdAt: series.createdAt,
      })),
    });

    return { removed: rows.length, undoToken: token };
  });
}

/**
 * Acerta (NOK → OK) exatamente os lançamentos escolhidos, num lote atômico:
 * se algum não for do usuário, não existir ou já estiver acertado, nada muda.
 */
export async function settleEntries(ids: string[]) {
  const unique = [...new Set(ids)];

  return transact(async (transaction, userId) => {
    const result = await transaction.familyEntry.updateMany({
      where: { id: { in: unique }, status: "PENDING" },
      data: { status: "SETTLED" },
    });

    if (result.count !== unique.length) {
      throw new FamilyEditError(
        "Algum lançamento escolhido já estava acertado ou não existe mais. Nada foi alterado; atualize a página.",
      );
    }

    const token = storeUndo({ kind: "settle", userId, expiresAt: Date.now() + UNDO_TTL_MS, ids: unique });
    return { settled: result.count, undoToken: token };
  });
}

/** Volta um acerto, inclusive antigo, a pendente sem reenviar os demais campos. */
export async function reopenEntry(id: string) {
  return transact(async (transaction, userId) => {
    const result = await transaction.familyEntry.updateMany({
      where: { id, status: "SETTLED" },
      data: { status: "PENDING" },
    });
    if (result.count !== 1) {
      throw new FamilyEditError("Este lançamento já está pendente ou não existe mais. Atualize a página.");
    }
    return { undoToken: storeUndo({ kind: "reopen", userId, expiresAt: Date.now() + UNDO_TTL_MS, ids: [id] }) };
  });
}

/** Desfaz uma exclusão, um acerto ou uma reversão recente do mesmo usuário. */
export async function undoFamilyChange(token: string) {
  const entry = undoStore.get(token);

  if (!entry || entry.expiresAt < Date.now()) {
    undoStore.delete(token);
    throw new FamilyEditError("Não é mais possível desfazer esta alteração.");
  }

  await transact(async (transaction, userId) => {
    // O retrato só volta para o próprio dono.
    if (userId !== entry.userId) {
      throw new FamilyEditError("Não é mais possível desfazer esta alteração.");
    }

    if (entry.kind === "settle") {
      await transaction.familyEntry.updateMany({ where: { id: { in: entry.ids }, status: "SETTLED" }, data: { status: "PENDING" } });
      return;
    }

    if (entry.kind === "reopen") {
      const result = await transaction.familyEntry.updateMany({ where: { id: { in: entry.ids }, status: "PENDING" }, data: { status: "SETTLED" } });
      if (result.count !== entry.ids.length) throw new FamilyEditError("O lançamento mudou. Não é mais possível desfazer esta reversão.");
      return;
    }

    if (entry.series.length > 0) {
      await transaction.familySeries.createMany({
        data: entry.series.map((series) => ({ ...series, userId: SCOPED_USER })),
        skipDuplicates: true,
      });
    }

    await transaction.familyEntry.createMany({
      data: entry.entries.map((row) => ({ ...row, userId: SCOPED_USER })),
      skipDuplicates: true,
    });
  });

  undoStore.delete(token);
}

/** Renomeia uma pessoa; o nome continua único entre as pessoas do usuário. */
export async function renameContact(id: string, name: string) {
  const clean = name.trim().replace(/\s+/g, " ");

  try {
    await transact(async (transaction) => {
      const result = await transaction.familyContact.updateMany({
        where: { id },
        data: { name: clean, normalizedName: normalizeText(clean) },
      });

      if (result.count !== 1) {
        throw new FamilyEditError("Pessoa não encontrada. Atualize a página e tente de novo.");
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new FamilyEditError(`Já existe uma pessoa chamada ${clean}.`);
    }
    throw error;
  }
}

/** Inclui uma pessoa sem lançamentos, como "Outros". */
export async function createContact(name: string) {
  return transact((transaction) => resolveContact(transaction, { newContactName: name }));
}

/** Remove uma pessoa sem lançamentos; com lançamentos, recusa. */
export async function deleteContact(id: string) {
  await transact(async (transaction) => {
    const used = await transaction.familyEntry.count({ where: { contactId: id } });
    const usedBySeries = await transaction.familySeries.count({ where: { contactId: id } });

    if (used + usedBySeries > 0) {
      throw new FamilyEditError("Esta pessoa tem lançamentos: exclua ou mude a pessoa deles antes.");
    }

    const result = await transaction.familyContact.deleteMany({ where: { id } });

    if (result.count !== 1) {
      throw new FamilyEditError("Pessoa não encontrada. Atualize a página e tente de novo.");
    }
  });
}
