import { randomUUID } from "node:crypto";

import { z } from "zod";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { FAMILY_EXPENSES_RESTORE_LOCK_KEY } from "@/lib/advisory-locks";
import { SCOPED_USER } from "@/lib/user-db";
import { getFamilyDb } from "@/modules/family-expenses/application/family-db";
import {
  FAMILY_BACKUP_FORMAT,
  FAMILY_BACKUP_TABLES,
  FAMILY_BACKUP_VERSION,
  type FamilyBackupCounts,
  type FamilyBackupFile,
  type FamilyBackupPreview,
  type FamilyBackupRow,
  type FamilyBackupTableKey,
} from "@/modules/family-expenses/domain/family-backup-format";
import { normalizeText } from "@/modules/family-expenses/domain/ledger";
import { decimalToCents, MAX_AMOUNT_CENTS } from "@/lib/money";
import { MAX_SERIES_COUNT } from "@/modules/family-expenses/domain/series";

// Backup de Gastos familiares (spec 084). A exportação lê os dados do usuário
// numa leitura consistente; a restauração substitui só as tabelas desta área,
// numa transação: a carteira de Investimentos e as concessões não mudam. A
// conferência é estrita: campo ou tabela desconhecidos, valores fora das regras
// e referências quebradas recusam o arquivo antes de gravar.

type Transaction = Prisma.TransactionClient;

export class FamilyBackupValidationError extends Error {}

const uuid = z.string().uuid();
const instant = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "data inválida");
/** Competência: o dia 1 de um mês, como a coluna DATE exportada. */
const monthStart = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01(T00:00:00(\.000)?Z)?$/, "competência inválida");
const amount = z.string().refine((value) => {
  try {
    const cents = decimalToCents(value);
    return cents > 0 && cents <= MAX_AMOUNT_CENTS;
  } catch {
    return false;
  }
}, "valor inválido");
const direction = z.enum(["RECEIVABLE", "PAYABLE"]);
const description = z.string().trim().min(1).max(120);

const ROW_SCHEMAS = {
  familyContacts: z
    .object({ id: uuid, name: z.string().trim().min(1).max(60), normalizedName: z.string().optional(), createdAt: instant })
    .strict(),
  familySeries: z
    .object({
      id: uuid,
      contactId: uuid,
      kind: z.enum(["INSTALLMENTS", "MONTHLY"]),
      description,
      direction,
      amount,
      firstCompetence: monthStart,
      count: z.number().int().min(1).max(MAX_SERIES_COUNT),
      createdAt: instant,
      updatedAt: instant,
    })
    .strict(),
  familyEntries: z
    .object({
      id: uuid,
      contactId: uuid,
      competence: monthStart,
      description,
      direction,
      amount,
      status: z.enum(["PENDING", "SETTLED"]),
      seriesId: uuid.nullable(),
      installment: z.number().int().min(1).max(MAX_SERIES_COUNT).nullable(),
      createdAt: instant,
      updatedAt: instant,
    })
    .strict(),
} satisfies Record<FamilyBackupTableKey, z.ZodType>;

const MODELS: Record<FamilyBackupTableKey, { model: "familyContact" | "familySeries" | "familyEntry"; table: string }> = {
  familyContacts: { model: "familyContact", table: "family_contacts" },
  familySeries: { model: "familySeries", table: "family_series" },
  familyEntries: { model: "familyEntry", table: "family_entries" },
};

const REFERENCES: Record<FamilyBackupTableKey, Record<string, FamilyBackupTableKey>> = {
  familyContacts: {},
  familySeries: { contactId: "familyContacts" },
  familyEntries: { contactId: "familyContacts", seriesId: "familySeries" },
};

type Delegate = {
  findMany(args: { orderBy: { id: "asc" } }): Promise<FamilyBackupRow[]>;
  createMany(args: { data: FamilyBackupRow[] }): Promise<{ count: number }>;
  deleteMany(): Promise<{ count: number }>;
  count(): Promise<number>;
};

function delegate(client: Transaction, key: FamilyBackupTableKey) {
  return (client as unknown as Record<string, Delegate>)[MODELS[key].model];
}

function serialize(row: FamilyBackupRow) {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([field]) => field !== "userId")
      .map(([field, value]) => [
        field,
        value instanceof Date ? value.toISOString() : Prisma.Decimal.isDecimal(value) ? (value as Prisma.Decimal).toString() : value,
      ]),
  );
}

/** Os gastos do usuário da sessão, numa leitura consistente. */
export async function exportFamilyBackup(now = new Date()): Promise<FamilyBackupFile> {
  const prisma = await getFamilyDb();
  const tables = await (prisma as PrismaClient).$transaction(
    async (transaction) => {
      const result = {} as Record<FamilyBackupTableKey, FamilyBackupRow[]>;

      for (const { key } of FAMILY_BACKUP_TABLES) {
        result[key] = (await delegate(transaction, key).findMany({ orderBy: { id: "asc" } })).map(serialize);
      }

      return result;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 10_000, timeout: 60_000 },
  );

  return { format: FAMILY_BACKUP_FORMAT, version: FAMILY_BACKUP_VERSION, exportedAt: now.toISOString(), tables };
}

type ParsedBackup = { file: FamilyBackupFile; rows: Record<FamilyBackupTableKey, FamilyBackupRow[]> };

/** Confere o arquivo inteiro e devolve as linhas prontas para gravar. */
export function parseFamilyBackup(input: unknown): ParsedBackup {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new FamilyBackupValidationError("O arquivo não é um backup de Gastos familiares.");
  }

  const candidate = input as Record<string, unknown>;

  if (candidate.format !== FAMILY_BACKUP_FORMAT) {
    throw new FamilyBackupValidationError(
      candidate.format === "meu-portfolio-backup"
        ? "Este é o backup da carteira de Investimentos: restaure-o na Configuração."
        : "O arquivo não é um backup de Gastos familiares.",
    );
  }

  if (candidate.version !== FAMILY_BACKUP_VERSION) {
    throw new FamilyBackupValidationError(
      typeof candidate.version === "number" && candidate.version > FAMILY_BACKUP_VERSION
        ? "O backup é de uma versão mais nova do aplicativo."
        : "O backup não informa uma versão conhecida do formato.",
    );
  }

  if (typeof candidate.exportedAt !== "string" || Number.isNaN(Date.parse(candidate.exportedAt))) {
    throw new FamilyBackupValidationError("O backup não informa quando foi exportado.");
  }

  const tables = candidate.tables;

  if (!tables || typeof tables !== "object" || Array.isArray(tables)) {
    throw new FamilyBackupValidationError("O backup não tem as tabelas de dados.");
  }

  const known = new Set<string>(FAMILY_BACKUP_TABLES.map((table) => table.key));
  const unknownTable = Object.keys(tables).find((key) => !known.has(key));

  if (unknownTable) {
    throw new FamilyBackupValidationError(`O backup tem dados que esta área não conhece (${unknownTable}).`);
  }

  const rows = {} as Record<FamilyBackupTableKey, FamilyBackupRow[]>;

  for (const { key } of FAMILY_BACKUP_TABLES) {
    const list = (tables as Record<string, unknown>)[key] ?? [];

    if (!Array.isArray(list)) {
      throw new FamilyBackupValidationError(`A tabela ${key} do backup não é uma lista.`);
    }

    rows[key] = list.map((row, index) => {
      const parsed = ROW_SCHEMAS[key].safeParse(row);

      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const field = issue?.path.join(".") || "registro";
        throw new FamilyBackupValidationError(`A linha ${index + 1} de ${key} tem ${field} inválido.`);
      }

      return parsed.data as FamilyBackupRow;
    });
  }

  checkConsistency(rows);
  return {
    file: {
      format: FAMILY_BACKUP_FORMAT,
      version: FAMILY_BACKUP_VERSION,
      exportedAt: candidate.exportedAt,
      tables: rows,
    },
    rows: prepareRows(rows),
  };
}

/** Ids únicos, nomes únicos, referências presentes e séries bem numeradas. */
function checkConsistency(rows: Record<FamilyBackupTableKey, FamilyBackupRow[]>) {
  for (const { key } of FAMILY_BACKUP_TABLES) {
    const ids = rows[key].map((row) => row.id as string);
    if (new Set(ids).size !== ids.length) {
      throw new FamilyBackupValidationError(`O backup repete ids em ${key}.`);
    }
  }

  const names = rows.familyContacts.map((row) => normalizeText(row.name as string));
  if (new Set(names).size !== names.length) {
    throw new FamilyBackupValidationError("O backup tem duas pessoas com o mesmo nome.");
  }

  for (const [key, references] of Object.entries(REFERENCES) as [FamilyBackupTableKey, Record<string, FamilyBackupTableKey>][]) {
    for (const [field, target] of Object.entries(references)) {
      const targets = new Set(rows[target].map((row) => row.id));
      const broken = rows[key].find((row) => row[field] !== null && !targets.has(row[field]));
      if (broken) {
        throw new FamilyBackupValidationError(`O backup tem ${key} apontando para ${target} que não existe.`);
      }
    }
  }

  const seriesById = new Map(rows.familySeries.map((series) => [series.id, series]));
  const numbers = new Set<string>();

  for (const entry of rows.familyEntries) {
    if ((entry.seriesId === null) !== (entry.installment === null)) {
      throw new FamilyBackupValidationError("O backup tem um lançamento de série sem o número dele.");
    }

    if (entry.seriesId !== null) {
      const key = `${entry.seriesId}:${entry.installment}`;
      const series = seriesById.get(entry.seriesId);
      if (numbers.has(key) || !series || (entry.installment as number) > (series.count as number)) {
        throw new FamilyBackupValidationError("O backup tem a numeração de uma série repetida ou fora da quantidade.");
      }
      numbers.add(key);
    }
  }
}

/** Linhas no formato do Prisma: datas, decimais e nomes normalizados. */
function prepareRows(rows: Record<FamilyBackupTableKey, FamilyBackupRow[]>) {
  const day = (value: unknown) => new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);

  return {
    familyContacts: rows.familyContacts.map((row) => ({
      id: row.id,
      name: row.name,
      normalizedName: normalizeText(row.name as string),
      createdAt: new Date(row.createdAt as string),
    })),
    familySeries: rows.familySeries.map((row) => ({
      ...row,
      firstCompetence: day(row.firstCompetence),
      createdAt: new Date(row.createdAt as string),
      updatedAt: new Date(row.updatedAt as string),
    })),
    familyEntries: rows.familyEntries.map((row) => ({
      ...row,
      competence: day(row.competence),
      createdAt: new Date(row.createdAt as string),
      updatedAt: new Date(row.updatedAt as string),
    })),
  };
}

function countsOf(rows: Record<FamilyBackupTableKey, unknown[]>): FamilyBackupCounts {
  return Object.fromEntries(FAMILY_BACKUP_TABLES.map(({ key }) => [key, rows[key].length])) as FamilyBackupCounts;
}

async function currentCounts(client: Transaction): Promise<FamilyBackupCounts> {
  const counts = {} as FamilyBackupCounts;
  for (const { key } of FAMILY_BACKUP_TABLES) {
    counts[key] = await delegate(client, key).count();
  }
  return counts;
}

/** Resumo do arquivo ao lado dos gastos atuais, sem gravar nada. */
export async function previewFamilyBackup(input: unknown): Promise<FamilyBackupPreview> {
  const prisma = await getFamilyDb();
  const { file } = parseFamilyBackup(input);
  const competences = file.tables.familyEntries.map((entry) => String(entry.competence).slice(0, 7)).sort();
  const pendingCents = file.tables.familyEntries
    .filter((entry) => entry.status === "PENDING")
    .reduce((sum, entry) => sum + (entry.direction === "RECEIVABLE" ? 1 : -1) * decimalToCents(entry.amount as string), 0);

  return {
    exportedAt: file.exportedAt,
    version: file.version,
    firstCompetence: competences[0] ?? null,
    lastCompetence: competences.at(-1) ?? null,
    pendingCents,
    file: countsOf(file.tables),
    current: await currentCounts(prisma as unknown as Transaction),
  };
}

/**
 * Ids do arquivo que outro usuário já usa ganham ids novos, e as referências
 * acompanham. Roda depois de apagar os dados do usuário; a consulta crua vê
 * todas as linhas, de propósito.
 */
async function replaceTakenIds(transaction: Transaction, rows: Record<FamilyBackupTableKey, FamilyBackupRow[]>) {
  const replaced = new Map<FamilyBackupTableKey, Map<string, string>>();
  const result = {} as Record<FamilyBackupTableKey, FamilyBackupRow[]>;

  for (const { key } of FAMILY_BACKUP_TABLES) {
    let tableRows = rows[key];

    for (const [field, target] of Object.entries(REFERENCES[key])) {
      const map = replaced.get(target);
      if (map && map.size > 0) {
        tableRows = tableRows.map((row) =>
          typeof row[field] === "string" && map.has(row[field] as string) ? { ...row, [field]: map.get(row[field] as string) } : row,
        );
      }
    }

    const ids = tableRows.map((row) => row.id as string);
    const taken = ids.length
      ? await transaction.$queryRawUnsafe<{ id: string }[]>(
          `SELECT "id"::text AS "id" FROM "${MODELS[key].table}" WHERE "id" = ANY($1::uuid[])`,
          ids,
        )
      : [];
    const map = new Map(taken.map(({ id }) => [id, randomUUID()]));

    if (map.size > 0) {
      tableRows = tableRows.map((row) => (map.has(row.id as string) ? { ...row, id: map.get(row.id as string) } : row));
    }

    replaced.set(key, map);
    result[key] = tableRows;
  }

  return result;
}

/**
 * Substitui os gastos do usuário pelos do arquivo, numa transação. Repetir a
 * mesma restauração dá o mesmo resultado: o lote não se duplica. Investimentos,
 * concessões e papéis não são tocados.
 */
export async function restoreFamilyBackup(input: unknown): Promise<FamilyBackupCounts> {
  const prisma = await getFamilyDb();
  const { rows } = parseFamilyBackup(input);

  return (prisma as PrismaClient).$transaction(
    async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${FAMILY_EXPENSES_RESTORE_LOCK_KEY})`;

      for (const { key } of [...FAMILY_BACKUP_TABLES].reverse()) {
        await delegate(transaction, key).deleteMany();
      }

      const prepared = await replaceTakenIds(transaction, rows);

      for (const { key } of FAMILY_BACKUP_TABLES) {
        const data = prepared[key].map((row) => ({ ...row, userId: SCOPED_USER }));
        for (let start = 0; start < data.length; start += 1_000) {
          await delegate(transaction, key).createMany({ data: data.slice(start, start + 1_000) });
        }
      }

      const counts = await currentCounts(transaction);
      const expected = countsOf(rows);
      const mismatch = FAMILY_BACKUP_TABLES.find(({ key }) => counts[key] !== expected[key]);

      if (mismatch) {
        throw new Error(
          `A restauração gravou ${counts[mismatch.key]} linhas em ${mismatch.key}, e o backup tem ${expected[mismatch.key]}.`,
        );
      }

      return counts;
    },
    { maxWait: 15_000, timeout: 120_000 },
  );
}
