import { ImportStatus } from "@/generated/prisma/enums";
import { getPrismaClient } from "@/lib/prisma";

export type ImportSummary = {
  status: ImportStatus;
  rowsRead: number;
  issues: number;
  completedAt: Date | null;
};

export async function getLatestImportSummary(): Promise<ImportSummary | null> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return null;
  }

  try {
    const batch = await prisma.importBatch.findFirst({
      orderBy: { startedAt: "desc" },
      select: {
        status: true,
        rowsRead: true,
        completedAt: true,
        _count: { select: { issues: true } },
      },
    });

    if (!batch) {
      return null;
    }

    return {
      status: batch.status,
      rowsRead: batch.rowsRead,
      issues: batch._count.issues,
      completedAt: batch.completedAt,
    };
  } catch {
    return null;
  }
}
