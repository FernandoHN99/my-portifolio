import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { DEFAULT_TARGETS_LOCK_KEY, MONTH_ROLLOVER_LOCK_KEY, QUOTE_REFRESH_LOCK_KEY } from "@/lib/advisory-locks";
import { getUserDb, SCOPED_USER } from "@/lib/user-db";
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

// Backup da carteira de um usuário (specs 042 e 052). A exportação lê, numa
// transação de leitura consistente, os dados do usuário e, das cotações
// compartilhadas (spec 051), as dos símbolos dele. A restauração apaga os dados
// do usuário e grava os do arquivo numa única transação; as cotações
// compartilhadas só ganham as linhas que faltam, porque servem a todos. Se
// qualquer linha falhar, nada muda.
//
// Os ids vão como estão e voltam iguais, mantendo os endereços das posições;
// um id que outro usuário já usa, como ao restaurar o mesmo arquivo em duas
// contas, ganha um id novo, e as referências a ele acompanham.
//
// Datas e decimais vão como texto, que o Prisma aceita de volta. Arquivos de
// versões anteriores passam por `UPGRADES` antes da conferência. Mudanças no
// schema seguem o roteiro de docs/backup-format.md.

type Transaction = Prisma.TransactionClient;

type Delegate = {
  findMany(args: { where?: object; orderBy: { id: "asc" } }): Promise<BackupRow[]>;
  createMany(args: { data: BackupRow[]; skipDuplicates?: boolean }): Promise<{ count: number }>;
  deleteMany(): Promise<{ count: number }>;
  count(args?: { where?: object }): Promise<number>;
};

type TableSpec = {
  model: string;
  /** Tabela no banco, para conferir ids que outro usuário já usa. */
  table: string;
  fields: Record<string, string>;
  /** Campos do modelo que não vão para o arquivo. */
  omit?: string[];
  /** Campos BigInt, guardados como texto no arquivo. */
  bigints?: string[];
  /** Campos Json opcionais: nulo no arquivo vira nulo do banco. */
  nullableJson?: string[];
  /** Chaves estrangeiras para tabelas do arquivo, que acompanham ids trocados. */
  references?: Record<string, BackupTableKey>;
};

// O usuário vem da sessão na restauração; o arquivo não o carrega.
const OWNED = ["userId"];

const TABLE_SPECS: Record<BackupTableKey, TableSpec> = {
  dataImports: { model: "dataImport", table: "data_imports", fields: Prisma.DataImportScalarFieldEnum, omit: OWNED },
  institutions: {
    model: "institution",
    table: "institutions",
    fields: Prisma.InstitutionScalarFieldEnum,
    omit: OWNED,
  },
  accounts: {
    model: "account",
    table: "accounts",
    fields: Prisma.AccountScalarFieldEnum,
    omit: OWNED,
    references: { institutionId: "institutions" },
  },
  assets: { model: "asset", table: "assets", fields: Prisma.AssetScalarFieldEnum, omit: OWNED },
  portfolioMonths: {
    model: "portfolioMonth",
    table: "portfolio_months",
    fields: Prisma.PortfolioMonthScalarFieldEnum,
    omit: OWNED,
  },
  positions: {
    model: "position",
    table: "positions",
    fields: Prisma.PositionScalarFieldEnum,
    omit: OWNED,
    references: { portfolioMonthId: "portfolioMonths", accountId: "accounts", assetId: "assets" },
  },
  positionAllocations: {
    model: "positionAllocation",
    table: "position_allocations",
    fields: Prisma.PositionAllocationScalarFieldEnum,
    omit: OWNED,
    references: { positionId: "positions" },
  },
  targetPlans: { model: "targetPlan", table: "target_plans", fields: Prisma.TargetPlanScalarFieldEnum, omit: OWNED },
  allocationTargets: {
    model: "allocationTarget",
    table: "allocation_targets",
    fields: Prisma.AllocationTargetScalarFieldEnum,
    omit: OWNED,
    references: { planId: "targetPlans" },
  },
  manualQuotes: { model: "manualQuote", table: "manual_quotes", fields: Prisma.ManualQuoteScalarFieldEnum, omit: OWNED },
  marketQuotes: { model: "marketQuote", table: "market_quotes", fields: Prisma.MarketQuoteScalarFieldEnum },
  // A execução que gravou a cotação é de todos e não vai para o arquivo.
  dailyQuotes: { model: "dailyQuote", table: "daily_quotes", fields: Prisma.DailyQuoteScalarFieldEnum, omit: ["runId"] },
};

const INSERT_CHUNK = 1_000;

type RawTables = Record<string, unknown>;

function dropFields(rows: unknown, fields: string[]) {
  return Array.isArray(rows)
    ? rows.map((row) =>
        row && typeof row === "object"
          ? Object.fromEntries(Object.entries(row as BackupRow).filter(([field]) => !fields.includes(field)))
          : row,
      )
    : rows;
}

/**
 * Conversões de arquivos antigos, da versão da chave para a seguinte. Cada
 * mudança de formato acrescenta um passo aqui (docs/backup-format.md).
 */
const UPGRADES: Record<number, (tables: RawTables) => RawTables> = {
  // 1 → 2 (spec 047): saem as tabelas e as colunas da importação do Excel e
  // entra o registro das importações de backup, vazio.
  1: (tables) => {
    const { importBatches: _batches, importSourceRows: _rows, importIssues: _issues, ...rest } = tables;
    void _batches;
    void _rows;
    void _issues;

    return {
      ...rest,
      dataImports: [],
      portfolioMonths: dropFields(tables.portfolioMonths, ["sourceBatchId"]),
      targetPlans: dropFields(tables.targetPlans, ["sourceBatchId"]),
      positions: dropFields(tables.positions, ["sourceRowId"]),
      positionAllocations: dropFields(tables.positionAllocations, ["sourceRowId"]),
      marketQuotes: dropFields(tables.marketQuotes, ["sourceRowId"]),
      allocationTargets: dropFields(tables.allocationTargets, ["sourceSheet", "sourceCell"]),
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
  // 3 → 4 (specs 050 a 052): o arquivo passa a ser de um usuário. Sai o
  // `userId`, que um arquivo exportado logo depois do login trazia; saem as
  // execuções da atualização, que são de todos, e o `runId` das cotações
  // diárias; entram as cotações digitadas, vazias: até a versão 3 a cotação
  // editada à mão ficava junto das automáticas.
  3: (tables) => {
    const { quoteRefreshRuns: _runs, quoteRefreshResults: _results, ...rest } = tables;
    void _runs;
    void _results;

    return {
      ...Object.fromEntries(Object.entries(rest).map(([key, rows]) => [key, dropFields(rows, ["userId"])])),
      dailyQuotes: dropFields(rest.dailyQuotes, ["userId", "runId"]),
      manualQuotes: [],
    };
  },
};

export class BackupValidationError extends Error {}

function delegate(client: Transaction, key: BackupTableKey) {
  return (client as unknown as Record<string, Delegate>)[TABLE_SPECS[key].model];
}

function fieldsOf(key: BackupTableKey) {
  const omitted = TABLE_SPECS[key].omit ?? [];
  return Object.values(TABLE_SPECS[key].fields).filter((field) => !omitted.includes(field));
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

/**
 * Símbolos de cotação do usuário: os dos ativos dele, os das cotações que ele
 * digitou e o dólar, que converte os ativos no exterior.
 */
async function quoteSymbolsOf(client: Transaction) {
  const [assets, manual] = await Promise.all([
    client.asset.findMany({ where: { quoteSymbol: { not: null } }, select: { quoteSymbol: true } }),
    client.manualQuote.findMany({ distinct: ["symbol"], select: { symbol: true } }),
  ]);
  return [
    ...new Set(["USD", ...assets.map((asset) => asset.quoteSymbol!), ...manual.map((quote) => quote.symbol)]),
  ].sort();
}

function scopeOf(key: BackupTableKey, symbols: string[]) {
  return BACKUP_TABLES.find((table) => table.key === key)!.shared ? { symbol: { in: symbols } } : undefined;
}

/** Os dados do usuário da sessão, numa leitura consistente. */
export async function exportBackup(now = new Date()): Promise<BackupFile | null> {
  const prisma = await getUserDb();

  if (!prisma) {
    return null;
  }

  const tables = await prisma.$transaction(
    async (transaction) => {
      const symbols = await quoteSymbolsOf(transaction);
      const result = {} as Record<BackupTableKey, BackupRow[]>;

      for (const { key } of BACKUP_TABLES) {
        const fields = new Set(fieldsOf(key));
        const rows = await delegate(transaction, key).findMany({
          where: scopeOf(key, symbols),
          orderBy: { id: "asc" },
        });
        result[key] = rows.map((row) =>
          Object.fromEntries(
            Object.entries(row)
              .filter(([field]) => fields.has(field))
              .map(([field, value]) => [field, serializeValue(key, field, value)]),
          ),
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
    const fields = new Set(fieldsOf(key));
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

/** Hoje: os dados do usuário e, das cotações compartilhadas, as dos símbolos dele. */
async function currentCounts(client: Transaction): Promise<BackupCounts> {
  const symbols = await quoteSymbolsOf(client);
  const counts = {} as BackupCounts;
  for (const { key } of BACKUP_TABLES) {
    counts[key] = await delegate(client, key).count({ where: scopeOf(key, symbols) });
  }
  return counts;
}

/** Resumo do arquivo ao lado dos dados atuais do usuário, sem gravar nada. */
export async function previewBackup(input: unknown): Promise<BackupPreview | null> {
  const prisma = await getUserDb();

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
 * Ids do arquivo que outro usuário já usa ganham ids novos, e as referências a
 * eles acompanham. Roda depois de apagar os dados do usuário: o que sobra com o
 * mesmo id é de outro. A consulta crua passa por cima do escopo do usuário.
 */
async function replaceTakenIds(transaction: Transaction, rows: Record<BackupTableKey, BackupRow[]>) {
  const replaced = new Map<BackupTableKey, Map<string, string>>();
  const result = {} as Record<BackupTableKey, BackupRow[]>;

  for (const { key, shared } of BACKUP_TABLES) {
    const spec = TABLE_SPECS[key];
    let tableRows = rows[key];

    if (shared) {
      result[key] = tableRows;
      continue;
    }

    for (const [field, target] of Object.entries(spec.references ?? {})) {
      const map = replaced.get(target);
      if (map && map.size > 0) {
        tableRows = tableRows.map((row) => {
          const value = row[field];
          return typeof value === "string" && map.has(value) ? { ...row, [field]: map.get(value) } : row;
        });
      }
    }

    const ids = tableRows.map((row) => row.id).filter((id): id is string => typeof id === "string");
    const taken =
      ids.length > 0
        ? await transaction.$queryRawUnsafe<{ id: string }[]>(
            `SELECT "id"::text AS "id" FROM "${spec.table}" WHERE "id" = ANY($1::uuid[])`,
            ids,
          )
        : [];
    const map = new Map(taken.map(({ id }) => [id, randomUUID()]));

    if (map.size > 0) {
      tableRows = tableRows.map((row) =>
        typeof row.id === "string" && map.has(row.id) ? { ...row, id: map.get(row.id) } : row,
      );
    }

    replaced.set(key, map);
    result[key] = tableRows;
  }

  return result;
}

/**
 * Substitui os dados do usuário pelos do backup, numa transação, completa as
 * cotações compartilhadas e registra a importação, que a configuração mostra
 * ao lado das versões das metas.
 */
export async function restoreBackup(input: unknown): Promise<BackupCounts | null> {
  const prisma = await getUserDb();

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

      // Só os dados do usuário saem; as cotações compartilhadas ficam.
      for (const { key, shared } of [...BACKUP_TABLES].reverse()) {
        if (!shared) {
          await delegate(transaction, key).deleteMany();
        }
      }

      const prepared = await replaceTakenIds(transaction, rows);

      for (const { key, shared } of BACKUP_TABLES) {
        // As compartilhadas entram sem o id do arquivo, e as que já existem no
        // mesmo mês ou dia ficam como estão: servem a outros usuários.
        const data = shared
          ? prepared[key].map((row) => Object.fromEntries(Object.entries(row).filter(([field]) => field !== "id")))
          : prepared[key].map((row) => ({ ...row, userId: SCOPED_USER }));

        for (let start = 0; start < data.length; start += INSERT_CHUNK) {
          await delegate(transaction, key).createMany({
            data: data.slice(start, start + INSERT_CHUNK),
            ...(shared ? { skipDuplicates: true } : {}),
          });
        }
      }

      const counts = await currentCounts(transaction);
      const expected = countsOf(rows);
      const mismatch = BACKUP_TABLES.find(({ key, shared }) => !shared && counts[key] !== expected[key]);

      if (mismatch) {
        throw new Error(
          `A restauração gravou ${counts[mismatch.key]} linhas em ${mismatch.key}, e o backup tem ${expected[mismatch.key]}.`,
        );
      }

      await transaction.dataImport.create({
        data: { userId: SCOPED_USER, exportedAt: new Date(file.exportedAt), formatVersion: sourceVersion },
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
