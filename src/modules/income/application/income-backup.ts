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
import { DAY_TYPES, MAX_PERCENT } from "@/modules/income/domain/overtime";

// Backup de Recebimentos (spec 092; horas extras desde a versão 4, spec 098). A exportação lê os dados do usuário numa
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
const monthHours = decimal(0, MAX_MONTH_HOURS * 100);
const optionalHours = monthHours.nullable();
const percent = z.number().int().min(0).max(MAX_PERCENT);

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
      paidHours: optionalHours,
      paidAmount: optionalValue,
      note: z.string().trim().max(200).nullable(),
      createdAt: instant,
      updatedAt: instant,
    })
    .strict(),
  overtimeRules: z
    .object({
      id: uuid,
      effectiveFrom: monthStart,
      dailyHours: decimal(100, 1200),
      weekdayPercent: percent,
      weekdayBeyondPercent: percent,
      saturdayPercent: percent,
      sundayPercent: percent,
      holidayPercent: percent,
      usualDailyLimit: decimal(0, 1600).nullable(),
      exceptionalDailyLimit: decimal(0, 1600).nullable(),
      netShortfall: z.boolean(),
      note: z.string().trim().max(300).nullable(),
      createdAt: instant,
      updatedAt: instant,
    })
    .strict(),
  overtimeMonths: z
    .object({
      id: uuid,
      month: monthStart,
      startsOn: day,
      endsOn: day,
      source: z.enum(["IMPORT", "MANUAL"]),
      weekdayHours: monthHours,
      weekdayBeyondHours: monthHours,
      saturdayHours: monthHours,
      sundayHours: monthHours,
      holidayHours: monthHours,
      shortfallHours: monthHours,
      compensatedHours: monthHours,
      sourceName: z.string().trim().max(200).nullable(),
      importWarnings: z.array(z.string().max(400)).max(40),
      note: z.string().trim().max(500).nullable(),
      createdAt: instant,
      updatedAt: instant,
    })
    .strict(),
  overtimeDays: z
    .object({
      id: uuid,
      overtimeMonthId: uuid,
      date: day,
      hours: decimal(0, 2400),
      dayType: z.enum(DAY_TYPES),
      manualType: z.boolean(),
      activity: z.string().max(300).nullable(),
      createdAt: instant,
      updatedAt: instant,
    })
    .strict(),
  overtimePayments: z
    .object({
      id: uuid,
      overtimeMonthId: uuid,
      paymentMonth: monthStart,
      hours50: monthHours,
      hours75: monthHours,
      hours100: monthHours,
      note: z.string().trim().max(500).nullable(),
      createdAt: instant,
      updatedAt: instant,
    })
    .strict(),
} satisfies Record<IncomeBackupTableKey, z.ZodType>;

const MODELS: Record<IncomeBackupTableKey, { model: string; table: string }> = {
  incomeMonths: { model: "incomeMonth", table: "income_months" },
  incomePayslips: { model: "incomePayslip", table: "income_payslips" },
  incomeHourRecords: { model: "incomeHourRecord", table: "income_hour_records" },
  overtimeRules: { model: "overtimeRule", table: "overtime_rules" },
  overtimeMonths: { model: "overtimeMonth", table: "overtime_months" },
  overtimeDays: { model: "overtimeDay", table: "overtime_days" },
  overtimePayments: { model: "overtimePayment", table: "overtime_payments" },
};

const REFERENCES: Record<IncomeBackupTableKey, Record<string, IncomeBackupTableKey>> = {
  incomeMonths: {},
  incomePayslips: { incomeMonthId: "incomeMonths" },
  incomeHourRecords: { incomeMonthId: "incomeMonths" },
  overtimeRules: {},
  overtimeMonths: {},
  overtimeDays: { overtimeMonthId: "overtimeMonths" },
  overtimePayments: { overtimeMonthId: "overtimeMonths" },
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
      const parsed = ROW_SCHEMAS[key].safeParse(convertRow(key, row, fileVersion));

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

/** Linhas das versões antigas no formato atual; a conferência estrita vem depois. */
function convertRow(key: IncomeBackupTableKey, row: unknown, version: number) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return row;
  }

  if (key === "incomePayslips") return withTaxable(row, version);
  if (key === "incomeHourRecords" && version < 4) return withoutWorkedHours(row);
  if (key === "overtimePayments") return withoutPaymentValues(row);
  return row;
}

/**
 * Os primeiros arquivos da versão 4, antes de publicada, guardavam o valor e o
 * DSR de cada pagamento; agora os valores são calculados pela base do holerite.
 * A prévia informa a conversão para que o arquivo original seja preservado.
 */
const PAYMENT_VALUE_KEYS: readonly string[] = ["amount50", "amount75", "amount100", "dsrAmount"];

function withoutPaymentValues(row: object) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !PAYMENT_VALUE_KEYS.includes(key)));
}

/**
 * Conversão das versões 1 e 2: sem `taxable`, o holerite fica tributável salvo
 * 13º e PLR, a regra de antes (spec 095). Da versão 3 em diante o campo é
 * obrigatório e a conferência estrita o cobra.
 */
function withTaxable(row: object, version: number) {
  if (version >= 3 || "taxable" in row) {
    return row;
  }

  const { kind } = row as { kind?: unknown };
  return (PAYSLIP_KINDS as readonly unknown[]).includes(kind) ? { ...row, taxable: defaultTaxable(kind as PayslipKind) } : row;
}

/**
 * Versões 2 e 3: as horas declaradas e trabalhadas saíram da linha do holerite
 * (spec 098), porque são do mês de trabalho. Vazias, somem; com valor, o arquivo
 * é recusado em vez de perder o dado sem avisar.
 */
function withoutWorkedHours(row: object) {
  const { declaredHours, workedHours, ...rest } = row as { declaredHours?: unknown; workedHours?: unknown };

  if ((declaredHours ?? null) !== null || (workedHours ?? null) !== null) {
    throw new IncomeBackupValidationError(
      "O backup tem horas declaradas ou trabalhadas na linha do holerite; elas agora ficam nos meses de horas extras. Lance-as lá e exporte de novo.",
    );
  }

  return rest;
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

  const ruleMonths = rows.overtimeRules.map((row) => dateOnly(row.effectiveFrom));
  if (new Set(ruleMonths).size !== ruleMonths.length) {
    throw new IncomeBackupValidationError("O backup tem duas regras de horas extras a partir do mesmo mês.");
  }

  for (const rule of rows.overtimeRules) {
    const usual = rule.usualDailyLimit === null ? null : decimalToCents(rule.usualDailyLimit as string);
    const exceptional = rule.exceptionalDailyLimit === null ? null : decimalToCents(rule.exceptionalDailyLimit as string);
    if (usual !== null && exceptional !== null && exceptional < usual) {
      throw new IncomeBackupValidationError("O backup tem uma regra de horas extras com o limite excepcional abaixo do habitual.");
    }
  }

  const workMonths = rows.overtimeMonths.map((row) => dateOnly(row.month));
  if (new Set(workMonths).size !== workMonths.length) {
    throw new IncomeBackupValidationError("O backup tem dois meses de horas extras na mesma competência.");
  }

  const periodById = new Map<string, { startsOn: string; endsOn: string }>();

  for (const month of rows.overtimeMonths) {
    const startsOn = dateOnly(month.startsOn);
    const endsOn = dateOnly(month.endsOn);
    const span = (Date.parse(endsOn) - Date.parse(startsOn)) / 86_400_000;

    if (span < 0 || span >= 45 || endsOn.slice(0, 7) !== dateOnly(month.month).slice(0, 7)) {
      throw new IncomeBackupValidationError(`O backup tem um mês de horas extras (${dateOnly(month.month).slice(0, 7)}) com período inválido.`);
    }

    periodById.set(month.id as string, { startsOn, endsOn });
  }

  const dayKeys = new Set<string>();

  for (const day of rows.overtimeDays) {
    const period = periodById.get(day.overtimeMonthId as string);

    if (!period) {
      throw new IncomeBackupValidationError("O backup tem overtimeDays apontando para overtimeMonths que não existe.");
    }

    const date = dateOnly(day.date);
    if (date < period.startsOn || date > period.endsOn) {
      throw new IncomeBackupValidationError(`O backup tem o dia ${date} fora do período do mês de horas extras.`);
    }

    const key = `${day.overtimeMonthId as string}:${date}`;
    if (dayKeys.has(key)) {
      throw new IncomeBackupValidationError("O backup repete um dia no mesmo mês de horas extras.");
    }
    dayKeys.add(key);
  }

  const paymentKeys = new Set<string>();

  for (const payment of rows.overtimePayments) {
    if (!periodById.has(payment.overtimeMonthId as string)) {
      throw new IncomeBackupValidationError("O backup tem overtimePayments apontando para overtimeMonths que não existe.");
    }

    const key = `${payment.overtimeMonthId as string}:${dateOnly(payment.paymentMonth)}`;
    if (paymentKeys.has(key)) {
      throw new IncomeBackupValidationError("O backup tem dois pagamentos do mesmo holerite para o mesmo mês de horas extras.");
    }
    paymentKeys.add(key);
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
    overtimeRules: rows.overtimeRules.map((row) => ({
      ...row,
      effectiveFrom: date(row.effectiveFrom),
      note: (row.note as string | null)?.trim() || null,
      createdAt: new Date(row.createdAt as string),
      updatedAt: new Date(row.updatedAt as string),
    })),
    overtimeMonths: rows.overtimeMonths.map((row) => ({
      ...row,
      month: date(row.month),
      startsOn: date(row.startsOn),
      endsOn: date(row.endsOn),
      note: (row.note as string | null)?.trim() || null,
      createdAt: new Date(row.createdAt as string),
      updatedAt: new Date(row.updatedAt as string),
    })),
    overtimeDays: rows.overtimeDays.map((row) => ({
      ...row,
      date: date(row.date),
      createdAt: new Date(row.createdAt as string),
      updatedAt: new Date(row.updatedAt as string),
    })),
    overtimePayments: rows.overtimePayments.map((row) => ({
      ...row,
      paymentMonth: date(row.paymentMonth),
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
  const original = input as { tables: { overtimePayments?: Record<string, unknown>[] } };
  const legacyValues = original.tables.overtimePayments?.some((row) => PAYMENT_VALUE_KEYS.some((key) => key in row));

  return {
    exportedAt: file.exportedAt,
    version: file.version,
    firstMonth: months[0] ?? null,
    lastMonth: months.at(-1) ?? null,
    file: countsOf(file.tables),
    current: await currentCounts(prisma as unknown as Transaction),
    warnings: legacyValues ? ["Os valores e o DSR dos pagamentos de horas extras serão recalculados pelos holerites. Guarde o arquivo original para consultar os valores registrados nele."] : [],
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
