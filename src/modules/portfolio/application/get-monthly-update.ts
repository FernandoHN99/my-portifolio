import type {
  MonthlyUpdateStatus,
  QuoteUpdateStatus,
} from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";

export type MonthlyQuoteResult = {
  id: string;
  symbol: string;
  provider: string;
  status: QuoteUpdateStatus;
  valueBrl: number | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type MonthlyUpdateOverview = {
  id: string;
  status: MonthlyUpdateStatus;
  sourceMonth: Date;
  targetMonth: Date;
  startedAt: Date;
  completedAt: Date | null;
  errorMessage: string | null;
  positionCount: number;
  quoteResults: MonthlyQuoteResult[];
};

export async function getMonthlyUpdate(
  runId?: string,
): Promise<MonthlyUpdateOverview | null> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return null;
  }

  try {
    const run = await prisma.monthlyUpdateRun.findFirst({
      where: runId ? { id: runId } : undefined,
      orderBy: runId ? undefined : { startedAt: "desc" },
      select: {
        id: true,
        status: true,
        startedAt: true,
        completedAt: true,
        errorMessage: true,
        sourceMonth: { select: { referenceDate: true } },
        targetMonth: {
          select: {
            referenceDate: true,
            _count: { select: { positions: true } },
          },
        },
        quoteResults: {
          orderBy: { symbol: "asc" },
          select: {
            id: true,
            symbol: true,
            provider: true,
            status: true,
            valueBrl: true,
            errorCode: true,
            errorMessage: true,
          },
        },
      },
    });

    if (!run) {
      return null;
    }

    return {
      id: run.id,
      status: run.status,
      sourceMonth: run.sourceMonth.referenceDate,
      targetMonth: run.targetMonth.referenceDate,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      errorMessage: run.errorMessage,
      positionCount: run.targetMonth._count.positions,
      quoteResults: run.quoteResults.map((result) => ({
        ...result,
        id: result.id.toString(),
        valueBrl: result.valueBrl?.toNumber() ?? null,
      })),
    };
  } catch {
    return null;
  }
}
