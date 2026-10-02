import { getPrismaClient } from "@/lib/prisma";
import { getAllocationOverview } from "@/modules/portfolio/application/get-allocation-overview";
import type { AllocationAggregates, AllocationGroupKey } from "@/modules/portfolio/domain/rebalance";

export type TargetEditorItem = {
  key: string;
  scope: AllocationGroupKey;
  primaryLabel: string;
  secondaryLabel: string | null;
  percent: number;
  defaultPercent: number | null;
  sourceCell: string | null;
};

export type TargetPlanVersion = {
  id: string;
  name: string;
  createdAt: Date;
  isActive: boolean;
  isImported: boolean;
};

export type TargetEditorData = {
  planName: string;
  tolerance: number;
  items: TargetEditorItem[];
  versions: TargetPlanVersion[];
  preview: { referenceDate: Date; aggregates: AllocationAggregates } | null;
};

export async function getTargetEditor(referenceDate?: Date): Promise<TargetEditorData | null> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return null;
  }

  try {
    const [active, imported, versions, overview] = await Promise.all([
      prisma.targetPlan.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        select: {
          name: true,
          tolerancePercent: true,
          targets: {
            orderBy: { key: "asc" },
            select: {
              key: true,
              scope: true,
              primaryLabel: true,
              secondaryLabel: true,
              percentage: true,
              sourceSheet: true,
              sourceCell: true,
            },
          },
        },
      }),
      prisma.targetPlan.findFirst({
        where: { sourceBatchId: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { targets: { select: { key: true, percentage: true } } },
      }),
      prisma.targetPlan.findMany({
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { id: true, name: true, createdAt: true, isActive: true, sourceBatchId: true },
      }),
      getAllocationOverview(referenceDate),
    ]);

    if (!active) {
      return null;
    }

    const defaults = new Map(
      (imported?.targets ?? []).map((target) => [target.key, target.percentage.mul(100).toNumber()]),
    );

    return {
      planName: active.name,
      tolerance: active.tolerancePercent.toNumber(),
      items: active.targets.map((target) => ({
        key: target.key,
        scope: target.scope as AllocationGroupKey,
        primaryLabel: target.primaryLabel,
        secondaryLabel: target.secondaryLabel,
        percent: target.percentage.mul(100).toNumber(),
        defaultPercent: defaults.get(target.key) ?? null,
        sourceCell: target.sourceSheet && target.sourceCell ? `${target.sourceSheet}!${target.sourceCell}` : null,
      })),
      versions: versions.map((version) => ({
        id: version.id,
        name: version.name,
        createdAt: version.createdAt,
        isActive: version.isActive,
        isImported: version.sourceBatchId !== null,
      })),
      preview: overview ? { referenceDate: overview.referenceDate, aggregates: overview.aggregates } : null,
    };
  } catch {
    return null;
  }
}
