import type {
  ImportIssueSeverity,
  ImportStatus,
} from "@/generated/prisma/enums";
import { getPrismaClient } from "@/lib/prisma";

export type ImportSourceGroup = {
  table: string;
  rows: number;
};

export type ImportIssueGroup = {
  code: string;
  severity: ImportIssueSeverity;
  count: number;
};

export type ImportIssueItem = {
  id: string;
  code: string;
  severity: ImportIssueSeverity;
  message: string;
  sourceSheet: string | null;
  sourceTable: string | null;
  sourceRow: number | null;
  sourceField: string | null;
};

export type ImportOverview = {
  id: string;
  status: ImportStatus;
  sourcePath: string;
  sourceHash: string;
  rowsRead: number;
  completedAt: Date | null;
  sources: ImportSourceGroup[];
  issueGroups: ImportIssueGroup[];
  issues: ImportIssueItem[];
};

export async function getLatestImportOverview(): Promise<ImportOverview | null> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return null;
  }

  try {
    const batch = await prisma.importBatch.findFirst({
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        status: true,
        sourcePath: true,
        sourceHash: true,
        rowsRead: true,
        completedAt: true,
      },
    });

    if (!batch) {
      return null;
    }

    const [sourceGroups, issueGroups, issues] = await Promise.all([
      prisma.importSourceRow.groupBy({
        by: ["sourceTable"],
        where: { batchId: batch.id },
        _count: { id: true },
        orderBy: { sourceTable: "asc" },
      }),
      prisma.importIssue.groupBy({
        by: ["code", "severity"],
        where: { batchId: batch.id },
        _count: { id: true },
        orderBy: { code: "asc" },
      }),
      prisma.importIssue.findMany({
        where: { batchId: batch.id },
        orderBy: { id: "asc" },
        select: {
          id: true,
          code: true,
          severity: true,
          message: true,
          sourceSheet: true,
          sourceTable: true,
          sourceRow: true,
          sourceField: true,
        },
      }),
    ]);

    return {
      ...batch,
      sources: sourceGroups.map((group) => ({
        table: group.sourceTable,
        rows: group._count.id,
      })),
      issueGroups: issueGroups.map((group) => ({
        code: group.code,
        severity: group.severity,
        count: group._count.id,
      })),
      issues: issues.map((issue) => ({
        ...issue,
        id: issue.id.toString(),
      })),
    };
  } catch {
    return null;
  }
}

export function countImportIssues(overview: ImportOverview | null) {
  return overview?.issueGroups.reduce((total, group) => total + group.count, 0) ?? 0;
}
