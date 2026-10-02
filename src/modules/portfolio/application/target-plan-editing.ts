import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { MAX_REBALANCE_TOLERANCE } from "@/modules/portfolio/domain/rebalance";
import { targetGroupKey } from "@/modules/portfolio/presentation/target-groups";

export class TargetPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TargetPlanError";
  }
}

const SUM_TOLERANCE = new Prisma.Decimal("0.0001");

export async function saveTargetPlan(input: { targets: { key: string; percent: string }[]; tolerance: string }) {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new TargetPlanError("O banco de dados não está disponível.");
  }

  const [active, imported] = await Promise.all([
    prisma.targetPlan.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        tolerance: true,
        targets: {
          select: { key: true, scope: true, primaryLabel: true, secondaryLabel: true, percentage: true },
        },
      },
    }),
    prisma.targetPlan.findFirst({
      where: { sourceBatchId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { targets: { select: { key: true, percentage: true, sourceSheet: true, sourceCell: true } } },
    }),
  ]);

  if (!active) {
    throw new TargetPlanError("Não existe um plano de metas ativo para editar.");
  }

  const submitted = new Map(input.targets.map((entry) => [entry.key, entry.percent]));

  if (submitted.size !== input.targets.length || submitted.size !== active.targets.length) {
    throw new TargetPlanError("As metas enviadas não correspondem às categorias do plano.");
  }

  const parsed = active.targets.map((target) => {
    const raw = submitted.get(target.key);

    if (raw === undefined) {
      throw new TargetPlanError("As metas enviadas não correspondem às categorias do plano.");
    }

    const percent = parsePercent(raw);
    return { ...target, fraction: percent.div(100) };
  });

  const sums = new Map<string, Prisma.Decimal>();
  for (const target of parsed) {
    const group = targetGroupKey(target.scope, target.primaryLabel);
    sums.set(group, (sums.get(group) ?? new Prisma.Decimal(0)).plus(target.fraction));
  }

  const invalid = [...sums.entries()].filter(([, total]) => total.minus(1).abs().greaterThan(SUM_TOLERANCE));
  if (invalid.length > 0) {
    throw new TargetPlanError(
      `${invalid.length === 1 ? "Um grupo não soma" : `${invalid.length} grupos não somam`} 100%. Ajuste antes de salvar.`,
    );
  }

  const tolerance = parseTolerance(input.tolerance);

  if (parsed.every((target) => target.fraction.equals(target.percentage)) && tolerance.equals(active.tolerance)) {
    throw new TargetPlanError("Nada mudou em relação à versão vigente.");
  }

  const origin = new Map((imported?.targets ?? []).map((target) => [target.key, target]));
  const name = `Metas editadas em ${new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date())}`;

  return prisma.$transaction(async (transaction) => {
    await transaction.targetPlan.updateMany({ where: { isActive: true }, data: { isActive: false } });
    const plan = await transaction.targetPlan.create({
      data: { name, isActive: true, tolerance },
      select: { id: true, name: true },
    });

    await transaction.allocationTarget.createMany({
      data: parsed.map((target) => {
        const source = origin.get(target.key);
        const keepsOrigin = source !== undefined && source.percentage.equals(target.fraction);

        return {
          planId: plan.id,
          key: target.key,
          scope: target.scope,
          primaryLabel: target.primaryLabel,
          secondaryLabel: target.secondaryLabel,
          percentage: target.fraction,
          sourceSheet: keepsOrigin ? source.sourceSheet : null,
          sourceCell: keepsOrigin ? source.sourceCell : null,
        };
      }),
    });

    return plan;
  });
}

function parseTolerance(raw: string) {
  const value = parseDecimal(raw);

  if (value === null || value.greaterThan(MAX_REBALANCE_TOLERANCE) || value.decimalPlaces() > 2) {
    throw new TargetPlanError(
      `Use uma tolerância entre 0 e ${MAX_REBALANCE_TOLERANCE} pontos, com até duas casas decimais.`,
    );
  }

  return value;
}

function parsePercent(raw: string) {
  const value = parseDecimal(raw);

  if (value === null) {
    throw new TargetPlanError("Use apenas percentuais numéricos entre 0 e 100.");
  }

  if (value.greaterThan(100) || value.decimalPlaces() > 8) {
    throw new TargetPlanError("Use percentuais entre 0 e 100, com até oito casas decimais.");
  }

  return value;
}

function parseDecimal(raw: string) {
  const trimmed = raw.trim().replace(/\s/g, "");
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;

  return /^\d+(?:\.\d+)?$/.test(normalized) ? new Prisma.Decimal(normalized) : null;
}
