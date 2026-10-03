import { Prisma } from "@/generated/prisma/client";
import { DEFAULT_TARGETS_LOCK_KEY, MONTH_ROLLOVER_LOCK_KEY, QUOTE_REFRESH_LOCK_KEY } from "@/lib/advisory-locks";
import { getPrismaClient } from "@/lib/prisma";
import {
  BACKUP_FORMAT,
  BACKUP_TABLES,
  BACKUP_VERSION,
  type BackupCounts,
  type BackupFile,
  type BackupPreview,
  type BackupRow,
  type BackupTableKey,
} from "@/modules/backup/domain/backup-format";
import { ensureDefaultTargetPlan } from "@/modules/portfolio/application/target-plan-editing";

// Backup completo do aplicativo (spec 042). A exportação lê todas as tabelas
// numa transação de leitura consistente; a restauração apaga tudo e grava o
// arquivo de volta, com os mesmos identificadores, numa única transação. Se
// qualquer linha falhar, nada muda.
//
// Datas e decimais vão como texto, que o Prisma aceita de volta; os inteiros
// grandes (BigInt) vão como texto e voltam a BigInt pela lista `bigints`.
// Arquivos de versões anteriores passam por `UPGRADES` antes da conferência.
// Mudanças no schema seguem o roteiro de docs/backup-format.md.

type Transaction = Prisma.TransactionClient;

type Delegate = {
  findMany(args: { orderBy: { id: "asc" } }): Promise<BackupRow[]>;
  createMany(args: { data: BackupRow[] }): Promise<{ count: number }>;
  deleteMany(): Promise<{ count: number }>;
  count(): Promise<number>;
};

type TableSpec = {
  model: string;
  fields: Record<string, string>;
  /** Campos BigInt, guardados como texto no arquivo. */
  bigints?: string[];
  /** Campos Json opcionais: nulo no arquivo vira nulo do banco. */
  nullableJson?: string[];
  /** Tabela com id autoincremental, cuja sequência é ajustada depois. */
  serial?: string;
};

const TABLE_SPECS: Record<BackupTableKey, TableSpec> = {
  dataImports: { model: "dataImport", fields: Prisma.DataImportScalarFieldEnum },
  institutions: { model: "institution", fields: Prisma.InstitutionScalarFieldEnum },
  accounts: { model: "account", fields: Prisma.AccountScalarFieldEnum },
  assets: { model: "asset", fields: Prisma.AssetScalarFieldEnum },
  portfolioMonths: { model: "portfolioMonth", fields: Prisma.PortfolioMonthScalarFieldEnum },
  positions: { model: "position", fields: Prisma.PositionScalarFieldEnum },
  positionAllocations: { model: "positionAllocation", fields: Prisma.PositionAllocationScalarFieldEnum },
  marketQuotes: { model: "marketQuote", fields: Prisma.MarketQuoteScalarFieldEnum },
  targetPlans: { model: "targetPlan", fields: Prisma.TargetPlanScalarFieldEnum },
  allocationTargets: { model: "allocationTarget", fields: Prisma.AllocationTargetScalarFieldEnum },
  quoteRefreshRuns: { model: "quoteRefreshRun", fields: Prisma.QuoteRefreshRunScalarFieldEnum },
  quoteRefreshResults: {
    model: "quoteRefreshResult",
    fields: Prisma.QuoteRefreshResultScalarFieldEnum,
    bigints: ["id"],
    serial: "quote_refresh_results",
  },
  dailyQuotes: { model: "dailyQuote", fields: Prisma.DailyQuoteScalarFieldEnum },
};

const INSERT_CHUNK = 1_000;

type RawTables = Record<string, unknown>;

/**
 * Conversões de arquivos antigos, da versão da chave para a seguinte. Cada
 * mudança de formato acrescenta um passo aqui (docs/backup-format.md).
 */
const UPGRADES: Record<number, (tables: RawTables) => RawTables> = {
  // 1 → 2 (spec 047): saem as tabelas e as colunas da importação do Excel e
  // entra o registro das importações de backup, vazio.
  1: (tables) => {
    const drop = (key: string, fields: string[]) => {
      const rows = tables[key];
      return Array.isArray(rows)
        ? rows.map((row) =>
            row && typeof row === "object"
              ? Object.fromEntries(Object.entries(row as BackupRow).filter(([field]) => !fields.includes(field)))
              : row,
          )
        : rows;
    };
    const { importBatches: _batches, importSourceRows: _rows, importIssues: _issues, ...rest } = tables;
    void _batches;
    void _rows;
    void _issues;

    return {
      ...rest,
      dataImports: [],
      portfolioMonths: drop("portfolioMonths", ["sourceBatchId"]),
      targetPlans: drop("targetPlans", ["sourceBatchId"]),
      positions: drop("positions", ["sourceRowId"]),
      positionAllocations: drop("positionAllocations", ["sourceRowId"]),
      marketQuotes: drop("marketQuotes", ["sourceRowId"]),
      allocationTargets: drop("allocationTargets", ["sourceSheet", "sourceCell"]),
    };
  },
  // 2 → 3 (spec 049): saem as tabelas da atualização mensal manual, sem uso, e
  // o status IMPORTED, da importação do Excel, vira REVIEWED (mês fechado).
  2: (tables) => {
    const { monthlyUpdateRuns: _runs, quoteUpdateResults: _results, ...rest } = tables;
    void _runs;
    void _results;
    const months = tables.portfolioMonths;

    return {
      ...rest,
      portfolioMonths: Array.isArray(months)
        ? months.map((month) =>
            month && typeof month === "object" && (month as BackupRow).status === "IMPORTED"
              ? { ...(month as BackupRow), status: "REVIEWED" }
              : month,
          )
        : months,
    };
  },
};

export class BackupValidationError extends Error {}

function delegate(client: Transaction, key: BackupTableKey) {
  return (client as unknown as Record<string, Delegate>)[TABLE_SPECS[key].model];
}

function serializeValue(key: BackupTableKey, field: string, value: unknown) {
  if (typeof value === "bigint") {
    if (!TABLE_SPECS[key].bigints?.includes(field)) {
      // Campo BigInt novo no schema: precisa entrar em `bigints` para voltar.
      throw new Error(`O campo ${key}.${field} é BigInt e não está na lista do backup.`);
    }
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Prisma.Decimal.isDecimal(value)) {
    return (value as Prisma.Decimal).toString();
  }
  return value;
}

/** Todas as tabelas, numa leitura consistente. */
export async function exportBackup(now = new Date()): Promise<BackupFile | null> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return null;
  }

  const tables = await prisma.$transaction(
    async (transaction) => {
      const result = {} as Record<BackupTableKey, BackupRow[]>;
      for (const { key } of BACKUP_TABLES) {
        const rows = await delegate(transaction, key).findMany({ orderBy: { id: "asc" } });
        result[key] = rows.map((row) =>
          Object.fromEntries(Object.entries(row).map(([field, value]) => [field, serializeValue(key, field, value)])),
        );
      }
      return result;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 10_000, timeout: 60_000 },
  );

  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), tables };
}

/**
 * Confere o arquivo e devolve as linhas prontas para gravar. Converte versões
 * anteriores; recusa outro formato, versão mais nova e tabelas ou campos que
 * este app não conhece. Tabelas ausentes ficam vazias.
 */
export function parseBackup(input: unknown): {
  file: BackupFile;
  rows: Record<BackupTableKey, BackupRow[]>;
  sourceVersion: number;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new BackupValidationError("O arquivo não é um backup deste aplicativo.");
  }

  const candidate = input as Record<string, unknown>;

  if (candidate.format !== BACKUP_FORMAT) {
    throw new BackupValidationError("O arquivo não é um backup deste aplicativo.");
  }

  const sourceVersion = candidate.version;

  if (typeof sourceVersion !== "number" || !Number.isInteger(sourceVersion) || sourceVersion < 1) {
    throw new BackupValidationError("O backup não informa a versão do formato.");
  }

  if (sourceVersion > BACKUP_VERSION) {
    throw new BackupValidationError("O backup é de uma versão mais nova do aplicativo.");
  }

  if (typeof candidate.exportedAt !== "string" || Number.isNaN(Date.parse(candidate.exportedAt))) {
    throw new BackupValidationError("O backup não informa quando foi exportado.");
  }

  if (!candidate.tables || typeof candidate.tables !== "object" || Array.isArray(candidate.tables)) {
    throw new BackupValidationError("O backup não tem as tabelas de dados.");
  }

  let tables = candidate.tables as RawTables;

  for (let version = sourceVersion; version < BACKUP_VERSION; version += 1) {
    tables = UPGRADES[version](tables);
  }

  const known = new Set<string>(BACKUP_TABLES.map((table) => table.key));
  const unknownTable = Object.keys(tables).find((key) => !known.has(key));

  if (unknownTable) {
    throw new BackupValidationError(`O backup tem dados que esta versão do aplicativo não conhece (${unknownTable}).`);
  }

  const rows = {} as Record<BackupTableKey, BackupRow[]>;
  const file = {} as Record<BackupTableKey, BackupRow[]>;

  for (const { key } of BACKUP_TABLES) {
    const list = (tables as Record<string, unknown>)[key] ?? [];

    if (!Array.isArray(list)) {
      throw new BackupValidationError(`A tabela ${key} do backup não é uma lista.`);
    }

    const spec = TABLE_SPECS[key];
    const fields = new Set(Object.values(spec.fields));
    file[key] = list as BackupRow[];
    rows[key] = list.map((row, index) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        throw new BackupValidationError(`A linha ${index + 1} de ${key} não é um registro.`);
      }

      const record: BackupRow = {};

      for (const [field, value] of Object.entries(row as BackupRow)) {
        if (!fields.has(field)) {
          throw new BackupValidationError(`O campo ${key}.${field} não existe nesta versão do aplicativo.`);
        }

        if (spec.bigints?.includes(field) && value !== null) {
          if (typeof value !== "string" || !/^\d+$/.test(value)) {
            throw new BackupValidationError(`O campo ${key}.${field} da linha ${index + 1} não é um número inteiro.`);
          }
          record[field] = BigInt(value);
        } else if (spec.nullableJson?.includes(field) && value === null) {
          record[field] = Prisma.DbNull;
        } else {
          record[field] = value;
        }
      }

      return record;
    });
  }

  return {
    file: { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: candidate.exportedAt, tables: file },
    rows,
    sourceVersion,
  };
}

function countsOf(tables: Record<BackupTableKey, unknown[]>): BackupCounts {
  return Object.fromEntries(BACKUP_TABLES.map(({ key }) => [key, tables[key].length])) as BackupCounts;
}

async function currentCounts(client: Transaction): Promise<BackupCounts> {
  const counts = {} as BackupCounts;
  for (const { key } of BACKUP_TABLES) {
    counts[key] = await delegate(client, key).count();
  }
  return counts;
}

/** Resumo do arquivo ao lado dos dados atuais, sem gravar nada. */
export async function previewBackup(input: unknown): Promise<BackupPreview | null> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return null;
  }

  const { file, sourceVersion } = parseBackup(input);
  const months = file.tables.portfolioMonths
    .map((month) => (typeof month.referenceDate === "string" ? month.referenceDate.slice(0, 7) : null))
    .filter((month): month is string => month !== null)
    .sort();

  return {
    exportedAt: file.exportedAt,
    version: sourceVersion,
    firstMonth: months[0] ?? null,
    lastMonth: months.at(-1) ?? null,
    file: countsOf(file.tables),
    current: await currentCounts(prisma as unknown as Transaction),
  };
}

/**
 * Substitui todos os dados pelos do backup, numa transação, e registra a
 * importação, que a configuração mostra ao lado das versões das metas.
 */
export async function restoreBackup(input: unknown): Promise<BackupCounts | null> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return null;
  }

  const { file, rows, sourceVersion } = parseBackup(input);

  const counts = await prisma.$transaction(
    async (transaction) => {
      // Nenhuma virada de mês, atualização de cotações ou criação das metas
      // padrão no meio da troca.
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${MONTH_ROLLOVER_LOCK_KEY})`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${QUOTE_REFRESH_LOCK_KEY})`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${DEFAULT_TARGETS_LOCK_KEY})`;

      for (const { key } of [...BACKUP_TABLES].reverse()) {
        await delegate(transaction, key).deleteMany();
      }

      for (const { key } of BACKUP_TABLES) {
        for (let start = 0; start < rows[key].length; start += INSERT_CHUNK) {
          await delegate(transaction, key).createMany({ data: rows[key].slice(start, start + INSERT_CHUNK) });
        }
      }

      // Os ids gravados à mão não avançam a sequência; sem isto, a próxima
      // linha nova colidiria com uma restaurada.
      for (const { key } of BACKUP_TABLES) {
        const table = TABLE_SPECS[key].serial;
        if (table) {
          await transaction.$executeRawUnsafe(
            `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 0) + 1, false)`,
          );
        }
      }

      const counts = await currentCounts(transaction);
      const expected = countsOf(rows);
      const mismatch = BACKUP_TABLES.find(({ key }) => counts[key] !== expected[key]);

      if (mismatch) {
        throw new Error(`A restauração gravou ${counts[mismatch.key]} linhas em ${mismatch.key}, e o backup tem ${expected[mismatch.key]}.`);
      }

      await transaction.dataImport.create({
        data: { exportedAt: new Date(file.exportedAt), formatVersion: sourceVersion },
      });

      return { ...counts, dataImports: counts.dataImports + 1 };
    },
    { maxWait: 15_000, timeout: 120_000 },
  );

  // Um backup sem metas ganha as metas padrão (spec 048), como um banco novo.
  // Uma falha aqui não desfaz a restauração: a checagem de abertura tenta de
  // novo.
  if (counts.targetPlans === 0 && (await ensureDefaultTargetPlan().catch(() => null)) === "created") {
    return currentCounts(prisma as unknown as Transaction);
  }

  return counts;
}
