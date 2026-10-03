import { getUserDb } from "@/lib/user-db";
import { getAllocationOverview } from "@/modules/portfolio/application/get-allocation-overview";
import type { AllocationAggregates, AllocationGroupKey } from "@/modules/portfolio/domain/rebalance";

export type TargetEditorItem = {
  key: string;
  scope: AllocationGroupKey;
  primaryLabel: string;
  secondaryLabel: string | null;
  percent: number;
};

/**
 * Linha do histórico da configuração: uma versão das metas, criada a cada
 * salvamento, ou uma importação de backup, que troca todos os dados (spec 047).
 */
export type TargetPlanVersion = {
  id: string;
  kind: "plan" | "import";
  name: string;
  createdAt: Date;
  isActive: boolean;
  /** Na importação, quando o arquivo foi exportado. */
  exportedAt: Date | null;
};

const VERSION_LIMIT = 12;

export type TargetEditorData = {
  planName: string;
  tolerance: number;
  items: TargetEditorItem[];
  versions: TargetPlanVersion[];
  preview: { referenceDate: Date; aggregates: AllocationAggregates } | null;
};

/**
 * Sem plano ativo, `missing`; uma falha ao ler, como uma migração ainda não
 * aplicada, vira `error` com o motivo, em vez de parecer que não há metas.
 */
export type TargetEditorResult =
  | { state: "ready"; editor: TargetEditorData }
  | { state: "missing" }
  | { state: "error"; message: string };

export async function getTargetEditor(referenceDate?: Date): Promise<TargetEditorResult> {
  const prisma = await getUserDb();

  if (!prisma) {
    return { state: "error", message: "O banco de dados não está configurado." };
  }

  try {
    const [active, versions, imports, overview] = await Promise.all([
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
            },
          },
        },
      }),
      prisma.targetPlan.findMany({
        orderBy: { createdAt: "desc" },
        take: VERSION_LIMIT,
        select: { id: true, name: true, createdAt: true, isActive: true },
      }),
      prisma.dataImport.findMany({
        orderBy: { importedAt: "desc" },
        take: VERSION_LIMIT,
        select: { id: true, importedAt: true, exportedAt: true },
      }),
      getAllocationOverview(referenceDate),
    ]);

    if (!active) {
      return { state: "missing" };
    }

    const editor: TargetEditorData = {
      planName: active.name,
      tolerance: active.tolerancePercent.toNumber(),
      items: active.targets.map((target) => ({
        key: target.key,
        scope: target.scope as AllocationGroupKey,
        primaryLabel: target.primaryLabel,
        secondaryLabel: target.secondaryLabel,
        percent: target.percentage.mul(100).toNumber(),
      })),
      versions: [
        ...versions.map(
          (version): TargetPlanVersion => ({ ...version, kind: "plan", exportedAt: null }),
        ),
        ...imports.map(
          (entry): TargetPlanVersion => ({
            id: entry.id,
            kind: "import",
            name: "Backup importado",
            createdAt: entry.importedAt,
            isActive: false,
            exportedAt: entry.exportedAt,
          }),
        ),
      ]
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .slice(0, VERSION_LIMIT),
      preview: overview ? { referenceDate: overview.referenceDate, aggregates: overview.aggregates } : null,
    };

    return { state: "ready", editor };
  } catch (error) {
    // O Prisma começa a mensagem pela chamada que falhou; a última linha diz o
    // motivo, como uma tabela que ainda não existe.
    const reason = error instanceof Error ? error.message.trim().split("\n").filter(Boolean).at(-1) : undefined;
    return { state: "error", message: reason ? reason.slice(0, 240) : "Erro desconhecido." };
  }
}
