import { randomUUID } from "node:crypto";

import { z } from "zod";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { INCOME_RESTORE_LOCK_KEY } from "@/lib/advisory-locks";
import { decimalToCents, MAX_AMOUNT_CENTS } from "@/lib/money";
import { SCOPED_USER } from "@/lib/user-db";
import { getIncomeDb } from "@/modules/income/application/income-db";
import {
  INCOME_BACKUP_ACCEPTED_VERSIONS,
  INCOME_BACKUP_FORMAT,
  INCOME_BACKUP_TABLES,
  INCOME_BACKUP_VERSION,
  type IncomeBackupCounts,
  type IncomeBackupFile,
  type IncomeBackupPreview,
  type IncomeBackupRow,
  type IncomeBackupTableKey,
} from "@/modules/income/domain/income-backup-format";
import { defaultTaxable, PAYSLIP_KINDS, PAYSLIP_PROBLEMS, payslipProblem, type PayslipKind } from "@/modules/income/domain/income";
import { HOUR_KINDS, MAX_MONTH_HOURS } from "@/modules/income/domain/income-hours";

// Backup de Recebimentos (spec 092). A exportação lê os dados do usuário numa
// leitura consistente; a restauração substitui só as tabelas desta área, numa
// transação: a carteira, Gastos familiares e as concessões não mudam. A
// conferência é estrita: campo ou tabela desconhecidos, valores fora das regras
// e referências quebradas recusam o arquivo antes de gravar.

type Transaction = Prisma.TransactionClient;

export class IncomeBackupValidationError extends Error {}

const uuid = z.string().uuid();
const instant = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "data inválida");
/** Data de uma coluna DATE: AAAA-MM-DD, com ou sem a meia-noite UTC exportada. */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/, "data inválida");
const monthStart = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01(T00:00:00(\.000)?Z)?$/, "mês inválido");

function decimal(minimumCents: number, maximumCents = MAX_AMOUNT_CENTS) {
  return z.string().refine((value) => {
    try {
      const cents = decimalToCents(value);
      return cents >= minimumCents && cents <= maximumCents;
    } catch {
      return false;
    }
  }, "valor inválido");
}

const optionalValue = decimal(0).nullable();
/** Horas com duas casas, de 0 às 744 de um mês de 31 dias. */
const optionalHours = decimal(0, MAX_MONTH_HOURS * 100).nullable();

const ROW_SCHEMAS = {
  incomeMonths: z
    .object({
      id: uuid,
      month: monthStart,
      netIncome: optionalValue,
      mealVoucher: optionalValue,
      cardSpend: optionalValue,
      pixSpend: optionalValue,
      mealVoucherSpend: optionalValue,
      createdAt: instant,
      updatedAt: instant,
    })
    .strict(),
  incomePayslips: z
    .object({
      id: uuid,
      incomeMonthId: uuid,
      kind: z.enum(PAYSLIP_KINDS),
      label: z.string().trim().max(60).nullable(),
      employer: z.string().trim().min(1).max(80),
      startsOn: day,
      endsOn: day,
      grossSalary: decimal(1),
      prorated: z.boolean(),
      taxable: z.boolean(),
      createdAt: instant,
      updatedAt: instant,
    })
    .strict(),
  incomeHourRecords: z
    .object({
      id: uuid,
      incomeMonthId: uuid,
      kind: z.enum(HOUR_KINDS),
      declaredHours: optionalHours,
      paidHours: optionalHours,
      workedHours: optionalHours,
      paidAmount: optionalValue,
      note: z.string().trim().max(200).nullable(),
      createdAt: instant,
      updatedAt: instant,
    })
    .strict(),
} satisfies Record<IncomeBackupTableKey, z.ZodType>;

const MODELS: Record<IncomeBackupTableKey, { model: "incomeMonth" | "incomePayslip" | "incomeHourRecord"; table: string }> = {
  incomeMonths: { model: "incomeMonth", table: "income_months" },
  incomePayslips: { model: "incomePayslip", table: "income_payslips" },
  incomeHourRecords: { model: "incomeHourRecord", table: "income_hour_records" },
};

const REFERENCES: Record<IncomeBackupTableKey, Record<string, IncomeBackupTableKey>> = {
  incomeMonths: {},
  incomePayslips: { incomeMonthId: "incomeMonths" },
  incomeHourRecords: { incomeMonthId: "incomeMonths" },
};

type Delegate = {
  findMany(args: { orderBy: { id: "asc" } }): Promise<IncomeBackupRow[]>;
  createMany(args: { data: IncomeBackupRow[] }): Promise<{ count: number }>;
  deleteMany(): Promise<{ count: number }>;
  count(): Promise<number>;
};

function delegate(client: Transaction, key: IncomeBackupTableKey) {
  return (client as unknown as Record<string, Delegate>)[MODELS[key].model];
}

function serialize(row: IncomeBackupRow) {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([field]) => field !== "userId")
      .map(([field, value]) => [
        field,
        value instanceof Date ? value.toISOString() : Prisma.Decimal.isDecimal(value) ? (value as Prisma.Decimal).toString() : value,
      ]),
  );
}

/** Os recebimentos do usuário da sessão, numa leitura consistente. */
export async function exportIncomeBackup(now = new Date()): Promise<IncomeBackupFile> {
  const prisma = await getIncomeDb();
  const tables = await (prisma as PrismaClient).$transaction(
    async (transaction) => {
      const result = {} as Record<IncomeBackupTableKey, IncomeBackupRow[]>;

      for (const { key } of INCOME_BACKUP_TABLES) {
        result[key] = (await delegate(transaction, key).findMany({ orderBy: { id: "asc" } })).map(serialize);
      }

      return result;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 10_000, timeout: 60_000 },
  );

  return { format: INCOME_BACKUP_FORMAT, version: INCOME_BACKUP_VERSION, exportedAt: now.toISOString(), tables };
}

type ParsedBackup = { file: IncomeBackupFile; rows: Record<IncomeBackupTableKey, IncomeBackupRow[]> };

/** Confere o arquivo inteiro e devolve as linhas prontas para gravar. */
export function parseIncomeBackup(input: unknown): ParsedBackup {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new IncomeBackupValidationError("O arquivo não é um backup de Recebimentos.");
  }

  const candidate = input as Record<string, unknown>;

  if (candidate.format !== INCOME_BACKUP_FORMAT) {
    throw new IncomeBackupValidationError(
      candidate.format === "meu-portfolio-backup"
        ? "Este é o backup da carteira de Investimentos: restaure-o na Configuração."
        : candidate.format === "meu-portfolio-gastos-familiares"
          ? "Este é o backup de Gastos familiares: restaure-o na página dessa área."
          : "O arquivo não é um backup de Recebimentos.",
    );
  }

  if (typeof candidate.version !== "number" || !INCOME_BACKUP_ACCEPTED_VERSIONS.includes(candidate.version)) {
    throw new IncomeBackupValidationError(
      typeof candidate.version === "number" && candidate.version > INCOME_BACKUP_VERSION
        ? "O backup é de uma versão mais nova do aplicativo."
        : "O backup não informa uma versão conhecida do formato.",
    );
  }

  const fileVersion = candidate.version;

  if (typeof candidate.exportedAt !== "string" || Number.isNaN(Date.parse(candidate.exportedAt))) {
    throw new IncomeBackupValidationError("O backup não informa quando foi exportado.");
  }

  const tables = candidate.tables;

  if (!tables || typeof tables !== "object" || Array.isArray(tables)) {
    throw new IncomeBackupValidationError("O backup não tem as tabelas de dados.");
  }

  const known = new Set<string>(INCOME_BACKUP_TABLES.map((table) => table.key));
  const unknownTable = Object.keys(tables).find((key) => !known.has(key));

  if (unknownTable) {
    throw new IncomeBackupValidationError(`O backup tem dados que esta área não conhece (${unknownTable}).`);
  }

  const rows = {} as Record<IncomeBackupTableKey, IncomeBackupRow[]>;

  for (const { key } of INCOME_BACKUP_TABLES) {
    const list = (tables as Record<string, unknown>)[key] ?? [];

    if (!Array.isArray(list)) {
      throw new IncomeBackupValidationError(`A tabela ${key} do backup não é uma lista.`);
    }

    rows[key] = list.map((row, index) => {
      const parsed = ROW_SCHEMAS[key].safeParse(key === "incomePayslips" ? withTaxable(row, fileVersion) : row);

      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const field = issue?.path.join(".") || "registro";
        throw new IncomeBackupValidationError(`A linha ${index + 1} de ${key} tem ${field} inválido.`);
      }

      return parsed.data as IncomeBackupRow;
    });
  }

  checkConsistency(rows);
  return {
    file: { format: INCOME_BACKUP_FORMAT, version: fileVersion, exportedAt: candidate.exportedAt, tables: rows },
    rows: prepareRows(rows),
  };
}

/**
 * Conversão das versões 1 e 2: sem `taxable`, o holerite fica tributável salvo
 * 13º e PLR, a regra de antes (spec 095). Da versão 3 em diante o campo é
 * obrigatório e a conferência estrita o cobra.
 */
function withTaxable(row: unknown, version: number) {
  if (version >= 3 || !row || typeof row !== "object" || Array.isArray(row) || "taxable" in row) {
    return row;
  }

  const { kind } = row as { kind?: unknown };
  return (PAYSLIP_KINDS as readonly unknown[]).includes(kind) ? { ...row, taxable: defaultTaxable(kind as PayslipKind) } : row;
}

const dateOnly = (value: unknown) => String(value).slice(0, 10);

/** Ids únicos, um registro por mês e por tipo de hora, referências presentes e períodos no mês. */
function checkConsistency(rows: Record<IncomeBackupTableKey, IncomeBackupRow[]>) {
  for (const { key } of INCOME_BACKUP_TABLES) {
    const ids = rows[key].map((row) => row.id as string);
    if (new Set(ids).size !== ids.length) {
      throw new IncomeBackupValidationError(`O backup repete ids em ${key}.`);
    }
  }

  const months = rows.incomeMonths.map((row) => dateOnly(row.month));
  if (new Set(months).size !== months.length) {
    throw new IncomeBackupValidationError("O backup tem dois registros para o mesmo mês.");
  }

  const monthById = new Map(rows.incomeMonths.map((row) => [row.id as string, dateOnly(row.month).slice(0, 7)]));

  for (const payslip of rows.incomePayslips) {
    const month = monthById.get(payslip.incomeMonthId as string);

    if (!month) {
      throw new IncomeBackupValidationError("O backup tem incomePayslips apontando para incomeMonths que não existe.");
    }

    const problem = payslipProblem(month, {
      kind: payslip.kind as (typeof PAYSLIP_KINDS)[number],
      label: payslip.label as string | null,
      employer: payslip.employer as string,
      startsOn: dateOnly(payslip.startsOn),
      endsOn: dateOnly(payslip.endsOn),
      grossCents: decimalToCents(payslip.grossSalary as string),
    });

    if (problem) {
      throw new IncomeBackupValidationError(`O backup tem um holerite de ${month} com problema: ${PAYSLIP_PROBLEMS[problem]}`);
    }
  }

  const hourKeys = new Set<string>();

  for (const record of rows.incomeHourRecords) {
    if (!monthById.has(record.incomeMonthId as string)) {
      throw new IncomeBackupValidationError("O backup tem incomeHourRecords apontando para incomeMonths que não existe.");
    }

    const key = `${record.incomeMonthId as string}:${record.kind as string}`;

    if (hourKeys.has(key)) {
      throw new IncomeBackupValidationError("O backup tem dois registros de horas do mesmo tipo no mesmo mês.");
    }

    hourKeys.add(key);
  }
}

/** Linhas no formato do Prisma: datas e instantes. */
function prepareRows(rows: Record<IncomeBackupTableKey, IncomeBackupRow[]>) {
  const date = (value: unknown) => new Date(`${dateOnly(value)}T00:00:00.000Z`);

  return {
    incomeMonths: rows.incomeMonths.map((row) => ({
      ...row,
      month: date(row.month),
      createdAt: new Date(row.createdAt as string),
      updatedAt: new Date(row.updatedAt as string),
    })),
    incomePayslips: rows.incomePayslips.map((row) => ({
      ...row,
      label: (row.label as string | null)?.trim() || null,
      startsOn: date(row.startsOn),
      endsOn: date(row.endsOn),
      createdAt: new Date(row.createdAt as string),
      updatedAt: new Date(row.updatedAt as string),
    })),
    incomeHourRecords: rows.incomeHourRecords.map((row) => ({
      ...row,
      note: (row.note as string | null)?.trim() || null,
      createdAt: new Date(row.createdAt as string),
      updatedAt: new Date(row.updatedAt as string),
    })),
  };
}

function countsOf(rows: Record<IncomeBackupTableKey, unknown[]>): IncomeBackupCounts {
  return Object.fromEntries(INCOME_BACKUP_TABLES.map(({ key }) => [key, rows[key].length])) as IncomeBackupCounts;
}

async function currentCounts(client: Transaction): Promise<IncomeBackupCounts> {
  const counts = {} as IncomeBackupCounts;
  for (const { key } of INCOME_BACKUP_TABLES) {
    counts[key] = await delegate(client, key).count();
  }
  return counts;
}

/** Resumo do arquivo ao lado dos recebimentos atuais, sem gravar nada. */
export async function previewIncomeBackup(input: unknown): Promise<IncomeBackupPreview> {
  const prisma = await getIncomeDb();
  const { file } = parseIncomeBackup(input);
  const months = file.tables.incomeMonths.map((row) => dateOnly(row.month).slice(0, 7)).sort();

  return {
    exportedAt: file.exportedAt,
    version: file.version,
    firstMonth: months[0] ?? null,
    lastMonth: months.at(-1) ?? null,
    file: countsOf(file.tables),
    current: await currentCounts(prisma as unknown as Transaction),
  };
}

/**
 * Ids do arquivo que outro usuário já usa ganham ids novos, e as referências
 * acompanham. Roda depois de apagar os dados do usuário; a consulta crua vê
 * todas as linhas, de propósito.
 */
async function replaceTakenIds(transaction: Transaction, rows: Record<IncomeBackupTableKey, IncomeBackupRow[]>) {
  const replaced = new Map<IncomeBackupTableKey, Map<string, string>>();
  const result = {} as Record<IncomeBackupTableKey, IncomeBackupRow[]>;

  for (const { key } of INCOME_BACKUP_TABLES) {
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
 * Substitui os recebimentos do usuário pelos do arquivo, numa transação.
 * Repetir a mesma restauração dá o mesmo resultado. Investimentos, Gastos
 * familiares, concessões e papéis não são tocados.
 */
export async function restoreIncomeBackup(input: unknown): Promise<IncomeBackupCounts> {
  const prisma = await getIncomeDb();
  const { rows } = parseIncomeBackup(input);

  return (prisma as PrismaClient).$transaction(
    async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${INCOME_RESTORE_LOCK_KEY})`;

      for (const { key } of [...INCOME_BACKUP_TABLES].reverse()) {
        await delegate(transaction, key).deleteMany();
      }

      const prepared = await replaceTakenIds(transaction, rows);

      for (const { key } of INCOME_BACKUP_TABLES) {
        const data = prepared[key].map((row) => ({ ...row, userId: SCOPED_USER }));
        for (let start = 0; start < data.length; start += 1_000) {
          await delegate(transaction, key).createMany({ data: data.slice(start, start + 1_000) });
        }
      }

      const counts = await currentCounts(transaction);
      const expected = countsOf(rows);
      const mismatch = INCOME_BACKUP_TABLES.find(({ key }) => counts[key] !== expected[key]);

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
