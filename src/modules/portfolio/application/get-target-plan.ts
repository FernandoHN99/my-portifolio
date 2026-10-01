import { AllocationTargetScope } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";

export type TargetItem = {
  id: string;
  primaryLabel: string;
  secondaryLabel: string | null;
  percentage: number;
  sourceSheet: string;
  sourceCell: string;
};

export type TargetGroup = {
  scope: AllocationTargetScope;
  title: string;
  description: string;
  items: TargetItem[];
  totalPercentage: number;
};

export type TargetPlanOverview = {
  name: string;
  groups: TargetGroup[];
};

const GROUP_LABELS: Record<AllocationTargetScope, { title: string; description: string }> = {
  ASSET_CLASS: {
    title: "Classe de ativos",
    description: "Percentual sobre o patrimônio total.",
  },
  CURRENCY: {
    title: "Moeda",
    description: "Percentual sobre o patrimônio total.",
  },
  STRATEGY: {
    title: "Estratégia",
    description: "Percentual sobre o patrimônio total.",
  },
  CLASS_CURRENCY: {
    title: "Moeda dentro de cada classe",
    description: "Percentual sobre o total de cada classe.",
  },
  FIXED_INCOME: {
    title: "Renda fixa por subclasse e prazo",
    description: "Percentual sobre o total de renda fixa.",
  },
  VARIABLE_INCOME: {
    title: "Renda variável por subclasse",
    description: "Percentual sobre o total de renda variável.",
  },
};

const GROUP_ORDER: AllocationTargetScope[] = [
  AllocationTargetScope.ASSET_CLASS,
  AllocationTargetScope.CURRENCY,
  AllocationTargetScope.STRATEGY,
  AllocationTargetScope.CLASS_CURRENCY,
  AllocationTargetScope.FIXED_INCOME,
  AllocationTargetScope.VARIABLE_INCOME,
];

export async function getTargetPlan(): Promise<TargetPlanOverview | null> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return null;
  }

  try {
    const plan = await prisma.targetPlan.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      select: {
        name: true,
        targets: {
          select: {
            id: true,
            scope: true,
            primaryLabel: true,
            secondaryLabel: true,
            percentage: true,
            sourceSheet: true,
            sourceCell: true,
          },
        },
      },
    });

    if (!plan) {
      return null;
    }

    return {
      name: plan.name,
      groups: GROUP_ORDER.map((scope) => {
        const items = plan.targets
          .filter((target) => target.scope === scope)
          .map((target) => ({
            id: target.id,
            primaryLabel: target.primaryLabel,
            secondaryLabel: target.secondaryLabel,
            percentage: target.percentage.toNumber() * 100,
            sourceSheet: target.sourceSheet,
            sourceCell: target.sourceCell,
          }));

        return {
          scope,
          title: GROUP_LABELS[scope].title,
          description: GROUP_LABELS[scope].description,
          items,
          totalPercentage: items.reduce((total, item) => total + item.percentage, 0),
        };
      }).filter((group) => group.items.length > 0),
    };
  } catch {
    return null;
  }
}
