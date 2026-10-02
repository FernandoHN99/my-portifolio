import path from "node:path";

import "dotenv/config";
import ExcelJS from "exceljs";

import {
  AllocationTargetScope,
  ImportIssueSeverity,
  Prisma,
} from "../src/generated/prisma/client";
import { getPrismaClient } from "../src/lib/prisma";

type SourceContent = Record<string, Prisma.JsonValue>;

type PendingTarget = {
  key: string;
  scope: AllocationTargetScope;
  primaryLabel: string;
  secondaryLabel: string | null;
  percentage: Prisma.Decimal;
  sourceSheet: string;
  sourceCell: string;
};

type PendingIssue = {
  severity: ImportIssueSeverity;
  code: string;
  message: string;
  sourceSheet?: string;
  sourceTable?: string;
  sourceRow?: number;
  sourceField?: string;
  rawValue?: Prisma.InputJsonValue;
};

const GENERATED_ISSUE_CODES = [
  "ALLOCATION_AMBIGUOUS_POSITION",
  "ALLOCATION_POSITION_NOT_FOUND",
  "DUPLICATE_SOURCE_ALLOCATION",
  "ALLOCATION_WEIGHT_MISMATCH",
  "TARGET_CURRENCY_MISMATCH",
  "TARGET_TOTAL_MISMATCH",
];

async function main() {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("DATABASE_URL não está configurada.");
  }

  const sourcePath = path.resolve(
    process.argv[2] ?? "raw_file/01-Investimentos.xlsm",
  );
  const batch = await prisma.importBatch.findFirst({
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      sourceRows: {
        where: { sourceTable: "Table_Investimentos_Porcent" },
        orderBy: { sourceRow: "asc" },
        select: { id: true, sourceSheet: true, sourceTable: true, sourceRow: true, content: true },
      },
    },
  });

  if (!batch) {
    throw new Error("Importe e normalize o Excel antes das alocações.");
  }

  const positions = await prisma.position.findMany({
    where: { portfolioMonth: { sourceBatchId: batch.id } },
    select: {
      id: true,
      portfolioMonth: { select: { referenceDate: true } },
      asset: { select: { name: true } },
    },
  });
  const positionIndex = new Map<string, string[]>();

  for (const position of positions) {
    const key = positionKey(position.portfolioMonth.referenceDate, position.asset.name);
    positionIndex.set(key, [...(positionIndex.get(key) ?? []), position.id]);
  }

  const pendingIssues: PendingIssue[] = [];
  let normalizedAllocations = 0;
  let skippedAllocations = 0;
  const allocationKeys = new Set<string>();

  await prisma.$transaction(async (transaction) => {
    await transaction.importIssue.deleteMany({
      where: { batchId: batch.id, code: { in: GENERATED_ISSUE_CODES } },
    });
    await transaction.positionAllocation.deleteMany({
      where: { sourceRow: { batchId: batch.id } },
    });

    for (const sourceRow of batch.sourceRows) {
      const content = asContent(sourceRow.content);
      const referenceDate = content ? readDate(content, "Data") : null;
      const assetName = content ? readText(content, "Nome") : null;
      const assetClass = content ? readText(content, "Classe") : null;
      const subclass = content ? readText(content, "Subclasse") : null;
      const duration = content ? readText(content, "Duração") : null;
      const weight = content ? readNumber(content, "Porcentagem") : null;

      if (
        !referenceDate ||
        !assetName ||
        !assetClass ||
        !subclass ||
        !duration ||
        weight === null
      ) {
        skippedAllocations += 1;
        continue;
      }

      const matches = positionIndex.get(positionKey(referenceDate, assetName)) ?? [];
      if (matches.length !== 1) {
        pendingIssues.push({
          severity: ImportIssueSeverity.WARNING,
          code:
            matches.length > 1
              ? "ALLOCATION_AMBIGUOUS_POSITION"
              : "ALLOCATION_POSITION_NOT_FOUND",
          message:
            matches.length > 1
              ? "A classificação corresponde a mais de uma posição; nenhuma instituição foi escolhida automaticamente."
              : "A classificação não possui uma posição normalizada correspondente.",
          sourceSheet: sourceRow.sourceSheet,
          sourceTable: sourceRow.sourceTable,
          sourceRow: sourceRow.sourceRow,
          sourceField: "Nome",
          rawValue: assetName,
        });
        skippedAllocations += 1;
        continue;
      }

      const allocationKey = [matches[0], assetClass, subclass, duration]
        .map(normalizeKey)
        .join(":");
      if (allocationKeys.has(allocationKey)) {
        pendingIssues.push({
          severity: ImportIssueSeverity.WARNING,
          code: "DUPLICATE_SOURCE_ALLOCATION",
          message:
            "A classificação repete a mesma posição, classe, subclasse e duração; a duplicata foi preservada na origem e excluída da alocação normalizada.",
          sourceSheet: sourceRow.sourceSheet,
          sourceTable: sourceRow.sourceTable,
          sourceRow: sourceRow.sourceRow,
        });
        skippedAllocations += 1;
        continue;
      }
      allocationKeys.add(allocationKey);

      await transaction.positionAllocation.create({
        data: {
          positionId: matches[0],
          sourceRowId: sourceRow.id,
          assetClass,
          subclass,
          duration,
          weight: new Prisma.Decimal(weight),
        },
      });
      normalizedAllocations += 1;
    }
  });

  const allocationWeightIssues = await findAllocationWeightIssues(batch.id);
  pendingIssues.push(...allocationWeightIssues);

  const targets = await readTargets(sourcePath);
  pendingIssues.push(...validateTargets(targets));

  const otherActivePlans = await prisma.targetPlan.count({
    where: {
      isActive: true,
      OR: [{ sourceBatchId: null }, { sourceBatchId: { not: batch.id } }],
    },
  });
  const targetPlan = await prisma.targetPlan.upsert({
    where: { sourceBatchId: batch.id },
    create: {
      sourceBatchId: batch.id,
      name: "Plano principal do Excel",
      isActive: otherActivePlans === 0,
    },
    update: { name: "Plano principal do Excel" },
    select: { id: true },
  });

  await prisma.$transaction(async (transaction) => {
    await transaction.allocationTarget.deleteMany({ where: { planId: targetPlan.id } });
    await transaction.allocationTarget.createMany({
      data: targets.map((target) => ({ ...target, planId: targetPlan.id })),
    });
    if (pendingIssues.length > 0) {
      await transaction.importIssue.createMany({
        data: pendingIssues.map((issue) => ({ ...issue, batchId: batch.id })),
      });
    }
  });

  const copiedDraftAllocations = await copyAllocationsToDrafts();

  console.info(
    [
      "Alocações normalizadas.",
      `${normalizedAllocations} classificações vinculadas`,
      `${skippedAllocations} classificações pendentes`,
      `${copiedDraftAllocations} classificações copiadas para rascunhos`,
      `${targets.length} metas importadas`,
      `${pendingIssues.length} achados de alocação`,
    ].join(" · "),
  );

  await prisma.$disconnect();
}

async function findAllocationWeightIssues(batchId: string): Promise<PendingIssue[]> {
  const prisma = getPrismaClient();
  if (!prisma) return [];

  const positions = await prisma.position.findMany({
    where: { portfolioMonth: { sourceBatchId: batchId }, allocations: { some: {} } },
    select: {
      asset: { select: { name: true } },
      portfolioMonth: { select: { referenceDate: true } },
      allocations: {
        select: {
          weight: true,
          sourceRow: { select: { sourceSheet: true, sourceTable: true, sourceRow: true } },
        },
      },
    },
  });
  const issues: PendingIssue[] = [];

  for (const position of positions) {
    const total = position.allocations.reduce(
      (sum, allocation) => sum.plus(allocation.weight),
      new Prisma.Decimal(0),
    );
    if (total.minus(1).abs().greaterThan("0.00000001")) {
      const source = position.allocations[0]?.sourceRow;
      issues.push({
        severity: ImportIssueSeverity.WARNING,
        code: "ALLOCATION_WEIGHT_MISMATCH",
        message: `Os pesos de ${position.asset.name} em ${position.portfolioMonth.referenceDate.toISOString().slice(0, 7)} somam ${total.mul(100).toFixed(4)}%.`,
        sourceSheet: source?.sourceSheet,
        sourceTable: source?.sourceTable,
        sourceRow: source?.sourceRow,
        sourceField: "Porcentagem",
        rawValue: total.toNumber(),
      });
    }
  }

  return issues;
}

async function copyAllocationsToDrafts() {
  const prisma = getPrismaClient();
  if (!prisma) return 0;

  const drafts = await prisma.portfolioMonth.findMany({
    where: { status: "DRAFT", targetUpdate: { isNot: null } },
    select: {
      positions: { select: { id: true, accountId: true, assetId: true } },
      targetUpdate: {
        select: {
          sourceMonth: {
            select: {
              positions: {
                select: {
                  accountId: true,
                  assetId: true,
                  allocations: {
                    select: {
                      assetClass: true,
                      subclass: true,
                      duration: true,
                      weight: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  let copied = 0;

  for (const draft of drafts) {
    const sourceByIdentity = new Map(
      (draft.targetUpdate?.sourceMonth.positions ?? []).map((position) => [
        `${position.accountId}:${position.assetId}`,
        position,
      ]),
    );
    const allocations = draft.positions.flatMap((position) => {
      const source = sourceByIdentity.get(`${position.accountId}:${position.assetId}`);
      return (source?.allocations ?? []).map((allocation) => ({
        positionId: position.id,
        ...allocation,
      }));
    });

    if (allocations.length > 0) {
      const result = await prisma.positionAllocation.createMany({
        data: allocations,
        skipDuplicates: true,
      });
      copied += result.count;
    }
  }

  return copied;
}

async function readTargets(sourcePath: string): Promise<PendingTarget[]> {
  const values = new Map<string, ExcelJS.CellValue>();
  const workbook = new ExcelJS.stream.xlsx.WorkbookReader(sourcePath, {
    worksheets: "emit",
    sharedStrings: "cache",
    styles: "cache",
    hyperlinks: "ignore",
  });
  let worksheetFound = false;

  for await (const worksheet of workbook) {
    const worksheetName = (worksheet as unknown as { name: string }).name;
    if (worksheetName !== "Tables_Atual_Ideal") continue;
    worksheetFound = true;

    for await (const row of worksheet) {
      if (row.number < 5 || row.number > 60) continue;
      for (let column = 10; column <= 15; column += 1) {
        values.set(`${columnLetter(column)}${row.number}`, row.getCell(column).value);
      }
    }
  }

  if (!worksheetFound) {
    throw new Error("A aba Tables_Atual_Ideal não foi encontrada.");
  }

  const targets: PendingTarget[] = [];
  const addTarget = (
    scope: AllocationTargetScope,
    primaryCell: string,
    percentageCell: string,
    secondaryCell?: string,
  ) => {
    const primaryLabel = readCellText(values.get(primaryCell));
    const secondaryLabel = secondaryCell
      ? readCellText(values.get(secondaryCell))
      : null;
    const percentage = readCellNumber(values.get(percentageCell));

    if (!primaryLabel || percentage === null || (secondaryCell && !secondaryLabel)) {
      throw new Error(`Meta inválida em Tables_Atual_Ideal!${percentageCell}.`);
    }

    targets.push({
      key: targetKey(scope, primaryLabel, secondaryLabel),
      scope,
      primaryLabel,
      secondaryLabel,
      percentage: new Prisma.Decimal(percentage),
      sourceSheet: "Tables_Atual_Ideal",
      sourceCell: percentageCell,
    });
  };

  for (let row = 6; row <= 10; row += 1) {
    addTarget(AllocationTargetScope.ASSET_CLASS, `J${row}`, `L${row}`);
  }
  for (let row = 30; row <= 32; row += 1) {
    addTarget(AllocationTargetScope.CURRENCY, `J${row}`, `L${row}`);
  }
  for (let row = 37; row <= 40; row += 1) {
    addTarget(AllocationTargetScope.STRATEGY, `J${row}`, `L${row}`);
  }
  for (let column = 11; column <= 15; column += 1) {
    for (let row = 16; row <= 18; row += 1) {
      addTarget(
        AllocationTargetScope.CLASS_CURRENCY,
        `${columnLetter(column)}15`,
        `${columnLetter(column)}${row}`,
        `J${row}`,
      );
    }
  }
  for (let row = 48; row <= 49; row += 1) {
    for (let column = 11; column <= 13; column += 1) {
      addTarget(
        AllocationTargetScope.FIXED_INCOME,
        `J${row}`,
        `${columnLetter(column)}${row}`,
        `${columnLetter(column)}47`,
      );
    }
  }
  for (let row = 56; row <= 60; row += 1) {
    addTarget(AllocationTargetScope.VARIABLE_INCOME, `J${row}`, `K${row}`);
  }

  return targets;
}

function validateTargets(targets: PendingTarget[]): PendingIssue[] {
  const issues: PendingIssue[] = [];
  const exactScopes = [
    AllocationTargetScope.ASSET_CLASS,
    AllocationTargetScope.CURRENCY,
    AllocationTargetScope.STRATEGY,
    AllocationTargetScope.FIXED_INCOME,
    AllocationTargetScope.VARIABLE_INCOME,
  ];

  for (const scope of exactScopes) {
    const total = targets
      .filter((target) => target.scope === scope)
      .reduce((sum, target) => sum.plus(target.percentage), new Prisma.Decimal(0));
    if (total.minus(1).abs().greaterThan("0.00000001")) {
      issues.push({
        severity: ImportIssueSeverity.WARNING,
        code: "TARGET_TOTAL_MISMATCH",
        message: `As metas de ${scope} somam ${total.mul(100).toFixed(4)}%.`,
        sourceSheet: "Tables_Atual_Ideal",
        rawValue: total.toNumber(),
      });
    }
  }

  const classCurrency = targets.filter(
    (target) => target.scope === AllocationTargetScope.CLASS_CURRENCY,
  );
  const classNames = [...new Set(classCurrency.map((target) => target.primaryLabel))];
  for (const className of classNames) {
    const total = classCurrency
      .filter((target) => target.primaryLabel === className)
      .reduce((sum, target) => sum.plus(target.percentage), new Prisma.Decimal(0));
    if (total.minus(1).abs().greaterThan("0.00000001")) {
      issues.push({
        severity: ImportIssueSeverity.WARNING,
        code: "TARGET_TOTAL_MISMATCH",
        message: `As metas de moeda para ${className} somam ${total.mul(100).toFixed(4)}%.`,
        sourceSheet: "Tables_Atual_Ideal",
        rawValue: total.toNumber(),
      });
    }
  }

  const classTargets = new Map(
    targets
      .filter((target) => target.scope === AllocationTargetScope.ASSET_CLASS)
      .map((target) => [target.primaryLabel, target.percentage]),
  );
  const currencyTargets = new Map(
    targets
      .filter((target) => target.scope === AllocationTargetScope.CURRENCY)
      .map((target) => [target.primaryLabel, target.percentage]),
  );
  const derivedCurrencies = new Map<string, Prisma.Decimal>();

  for (const target of classCurrency) {
    const classPercentage = classTargets.get(target.primaryLabel);
    if (!classPercentage || !target.secondaryLabel) continue;
    derivedCurrencies.set(
      target.secondaryLabel,
      (derivedCurrencies.get(target.secondaryLabel) ?? new Prisma.Decimal(0)).plus(
        classPercentage.mul(target.percentage),
      ),
    );
  }

  const differences = [...currencyTargets.entries()]
    .map(([currency, percentage]) => ({
      currency,
      general: percentage,
      derived: derivedCurrencies.get(currency) ?? new Prisma.Decimal(0),
    }))
    .filter(({ general, derived }) => general.minus(derived).abs().greaterThan("0.00000001"));

  if (differences.length > 0) {
    issues.push({
      severity: ImportIssueSeverity.WARNING,
      code: "TARGET_CURRENCY_MISMATCH",
      message:
        "As metas gerais de moeda diferem da composição implícita das metas de classe por moeda; os dois conjuntos foram preservados separadamente.",
      sourceSheet: "Tables_Atual_Ideal",
      sourceTable: "Table_Moeda",
      sourceField: "Porcentagem",
      rawValue: differences.map(({ currency, general, derived }) => ({
        currency,
        general: general.toNumber(),
        derived: derived.toNumber(),
      })) as Prisma.InputJsonValue,
    });
  }

  return issues;
}

function asContent(value: Prisma.JsonValue): SourceContent | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as SourceContent)
    : null;
}

function formulaResult(value: Prisma.JsonValue | undefined): Prisma.JsonValue | undefined {
  return value && typeof value === "object" && !Array.isArray(value) && "result" in value
    ? (value as SourceContent).result
    : value;
}

function readText(content: SourceContent, field: string) {
  const value = formulaResult(content[field]);
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g, " ").trim() : null;
}

function readNumber(content: SourceContent, field: string) {
  const value = formulaResult(content[field]);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readDate(content: SourceContent, field: string) {
  const value = readText(content, field);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function positionKey(date: Date, assetName: string) {
  return `${date.toISOString().slice(0, 10)}:${normalizeKey(assetName)}`;
}

function targetKey(
  scope: AllocationTargetScope,
  primaryLabel: string,
  secondaryLabel: string | null,
) {
  return [scope, normalizeKey(primaryLabel), secondaryLabel ? normalizeKey(secondaryLabel) : null]
    .filter(Boolean)
    .join(":");
}

function normalizeKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function readCellText(value: ExcelJS.CellValue | undefined) {
  return typeof value === "string" ? value.trim() : null;
}

function readCellNumber(value: ExcelJS.CellValue | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "result" in value) {
    const result = value.result;
    return typeof result === "number" && Number.isFinite(result) ? result : null;
  }
  return null;
}

function columnLetter(column: number) {
  let current = column;
  let result = "";
  while (current > 0) {
    current -= 1;
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return result;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Falha desconhecida.");
  process.exitCode = 1;
});
