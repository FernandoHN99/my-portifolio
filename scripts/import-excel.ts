import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import "dotenv/config";
import ExcelJS from "exceljs";

import {
  ImportIssueSeverity,
  ImportStatus,
  Prisma,
} from "../src/generated/prisma/client";
import { getPrismaClient } from "../src/lib/prisma";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type TableSpec = {
  sheet: string;
  table: string;
  headerRow: number;
  firstDataRow: number;
  lastDataRow: number;
  firstColumn: number;
  lastColumn: number;
  numericFields: string[];
};

type SourceRow = {
  sourceSheet: string;
  sourceTable: string;
  sourceRow: number;
  content: Record<string, JsonValue>;
};

type PendingIssue = {
  severity: ImportIssueSeverity;
  code: string;
  message: string;
  sourceSheet?: string;
  sourceTable?: string;
  sourceRow?: number;
  sourceField?: string;
  rawValue?: JsonValue;
};

const TABLES: TableSpec[] = [
  {
    sheet: "Investimentos_Main",
    table: "Table_Investimentos_Main",
    headerRow: 4,
    firstDataRow: 5,
    lastDataRow: 369,
    firstColumn: 2,
    lastColumn: 11,
    numericFields: ["Quantidade", "Cotação Ativo", "Cotação Dolar", "Total (R$)"],
  },
  {
    sheet: "Investimentos_Porcent",
    table: "Table_Investimentos_Porcent",
    headerRow: 4,
    firstDataRow: 5,
    lastDataRow: 387,
    firstColumn: 2,
    lastColumn: 11,
    numericFields: ["Porcentagem", "Total (R$)", "Total ($)"],
  },
  {
    sheet: "Cotacoes",
    table: "Table_Cotacoes",
    headerRow: 3,
    firstDataRow: 4,
    lastDataRow: 159,
    firstColumn: 3,
    lastColumn: 7,
    numericFields: ["Valor"],
  },
];

function normalizeCellValue(value: ExcelJS.CellValue): JsonValue {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "object") {
    const normalized: Record<string, JsonValue> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      if (nestedValue === undefined) {
        continue;
      }

      if (Array.isArray(nestedValue)) {
        normalized[key] = nestedValue.map((item) =>
          normalizeCellValue(item as ExcelJS.CellValue),
        );
      } else {
        normalized[key] = normalizeCellValue(nestedValue as ExcelJS.CellValue);
      }
    }

    return normalized;
  }

  return String(value);
}

function isFormulaValue(value: ExcelJS.CellValue) {
  return Boolean(
    value &&
      typeof value === "object" &&
      "formula" in value &&
      typeof value.formula === "string",
  );
}

function validateNumericCells(
  spec: TableSpec,
  row: ExcelJS.Row,
  headers: string[],
): PendingIssue[] {
  const issues: PendingIssue[] = [];

  for (const field of spec.numericFields) {
    const headerOffset = headers.indexOf(field);

    if (headerOffset === -1) {
      issues.push({
        severity: ImportIssueSeverity.ERROR,
        code: "MISSING_EXPECTED_COLUMN",
        message: `A coluna obrigatória ${field} não foi encontrada.`,
        sourceSheet: spec.sheet,
        sourceTable: spec.table,
        sourceField: field,
      });
      continue;
    }

    const cell = row.getCell(spec.firstColumn + headerOffset);
    const value = cell.value;
    const valid =
      value === null || typeof value === "number" || isFormulaValue(value);

    if (!valid) {
      issues.push({
        severity: ImportIssueSeverity.ERROR,
        code: "INVALID_NUMERIC_VALUE",
        message: `O campo ${field} deveria conter número ou fórmula.`,
        sourceSheet: spec.sheet,
        sourceTable: spec.table,
        sourceRow: row.number,
        sourceField: field,
        rawValue: normalizeCellValue(value),
      });
    }
  }

  return issues;
}

function findAmbiguousPositions(rows: SourceRow[]): PendingIssue[] {
  const groups = new Map<
    string,
    { date: JsonValue; name: JsonValue; institutions: Set<string>; rows: number[] }
  >();

  for (const row of rows.filter(
    (candidate) => candidate.sourceTable === "Table_Investimentos_Main",
  )) {
    const date = row.content.Data;
    const name = row.content.Nome;
    const institution = row.content["Instituição"];

    if (typeof date !== "string" || typeof name !== "string") {
      continue;
    }

    const key = `${date}\u0000${name}`;
    const group = groups.get(key) ?? {
      date,
      name,
      institutions: new Set<string>(),
      rows: [],
    };

    if (typeof institution === "string") {
      group.institutions.add(institution);
    }
    group.rows.push(row.sourceRow);
    groups.set(key, group);
  }

  return [...groups.values()]
    .filter((group) => group.institutions.size > 1)
    .map((group) => ({
      severity: ImportIssueSeverity.WARNING,
      code: "AMBIGUOUS_POSITION_IDENTITY",
      message:
        "A mesma data e o mesmo nome aparecem em instituições diferentes; " +
        "a identidade precisa incluir instituição ou conta.",
      sourceSheet: "Investimentos_Main",
      sourceTable: "Table_Investimentos_Main",
      sourceRow: group.rows[0],
      sourceField: "Nome",
      rawValue: {
        date: group.date,
        name: group.name,
        institutions: [...group.institutions],
        rows: group.rows,
      },
    }));
}

async function readSourceTables(filePath: string) {
  const sourceRows: SourceRow[] = [];
  const issues: PendingIssue[] = [];
  const specsBySheet = new Map(TABLES.map((spec) => [spec.sheet, spec]));
  const seenTables = new Set<string>();

  const workbook = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    worksheets: "emit",
    sharedStrings: "cache",
    styles: "cache",
    hyperlinks: "ignore",
  });

  for await (const worksheet of workbook) {
    const worksheetName = (worksheet as unknown as { name: string }).name;
    const spec = specsBySheet.get(worksheetName);

    if (!spec) {
      continue;
    }

    let headers: string[] = [];

    for await (const row of worksheet) {
      if (row.number === spec.headerRow) {
        headers = Array.from(
          { length: spec.lastColumn - spec.firstColumn + 1 },
          (_, offset) => String(row.getCell(spec.firstColumn + offset).value ?? ""),
        );
        seenTables.add(spec.table);
        continue;
      }

      if (row.number < spec.firstDataRow || row.number > spec.lastDataRow) {
        continue;
      }

      if (headers.length === 0) {
        throw new Error(`Cabeçalho não encontrado para ${spec.table}.`);
      }

      const content: Record<string, JsonValue> = {};

      headers.forEach((header, offset) => {
        content[header] = normalizeCellValue(
          row.getCell(spec.firstColumn + offset).value,
        );
      });

      sourceRows.push({
        sourceSheet: spec.sheet,
        sourceTable: spec.table,
        sourceRow: row.number,
        content,
      });
      issues.push(...validateNumericCells(spec, row, headers));
    }
  }

  for (const spec of TABLES) {
    if (!seenTables.has(spec.table)) {
      issues.push({
        severity: ImportIssueSeverity.ERROR,
        code: "MISSING_SOURCE_TABLE",
        message: `A tabela ${spec.table} não foi encontrada no arquivo.`,
        sourceSheet: spec.sheet,
        sourceTable: spec.table,
      });
    }
  }

  issues.push(...findAmbiguousPositions(sourceRows));
  issues.push({
    severity: ImportIssueSeverity.WARNING,
    code: "LOOKUP_IGNORES_INSTITUTION",
    message:
      "As fórmulas de classificação relacionam posição por data e nome, " +
      "sem incluir a instituição.",
    sourceSheet: "Investimentos_Porcent",
    sourceTable: "Table_Investimentos_Porcent",
  });

  return { sourceRows, issues };
}

async function main() {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("DATABASE_URL não está configurada.");
  }

  const sourcePath = path.resolve(
    process.argv[2] ?? "raw_file/01-Investimentos.xlsm",
  );
  const sourceHash = createHash("sha256")
    .update(await readFile(sourcePath))
    .digest("hex");

  const existing = await prisma.importBatch.findUnique({
    where: { sourceHash },
    select: { id: true, status: true, rowsRead: true, _count: { select: { issues: true } } },
  });

  if (existing) {
    console.info(
      `Arquivo já importado: lote ${existing.id}, ${existing.rowsRead} linhas, ` +
        `${existing._count.issues} achados, estado ${existing.status}.`,
    );
    await prisma.$disconnect();
    return;
  }

  const batch = await prisma.importBatch.create({
    data: {
      sourcePath: path.relative(process.cwd(), sourcePath),
      sourceHash,
      status: ImportStatus.RUNNING,
    },
    select: { id: true },
  });

  try {
    const { sourceRows, issues } = await readSourceTables(sourcePath);
    const finalStatus = issues.some(
      (issue) => issue.severity !== ImportIssueSeverity.INFO,
    )
      ? ImportStatus.COMPLETED_WITH_ISSUES
      : ImportStatus.COMPLETED;

    await prisma.$transaction([
      prisma.importSourceRow.createMany({
        data: sourceRows.map((row) => ({
          ...row,
          batchId: batch.id,
          content: row.content as Prisma.InputJsonValue,
        })),
      }),
      prisma.importIssue.createMany({
        data: issues.map(({ rawValue, ...issue }) => ({
          ...issue,
          batchId: batch.id,
          ...(rawValue === undefined
            ? {}
            : { rawValue: rawValue as Prisma.InputJsonValue }),
        })),
      }),
      prisma.importBatch.update({
        where: { id: batch.id },
        data: {
          status: finalStatus,
          rowsRead: sourceRows.length,
          completedAt: new Date(),
        },
      }),
    ]);

    console.info(
      `Importação concluída: lote ${batch.id}, ${sourceRows.length} linhas ` +
        `preservadas e ${issues.length} achados registrados.`,
    );
  } catch (error) {
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: ImportStatus.FAILED, completedAt: new Date() },
    });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Falha desconhecida.");
  process.exitCode = 1;
});
