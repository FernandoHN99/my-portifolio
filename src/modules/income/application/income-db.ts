import type { PrismaClient } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { scopedPrisma } from "@/lib/user-db";
import { assertModuleAccess } from "@/modules/access/application/module-access";

export class IncomeEditError extends Error {}

/**
 * Cliente dos dados de Recebimentos (spec 088): só depois de conferir a
 * concessão da área, e restrito ao usuário da operação. Leituras, gravações,
 * backup e carga passam por aqui, inclusive pelos roteiros (`runAsUser`).
 */
export async function getIncomeDb(): Promise<PrismaClient> {
  return (await getIncomeContext()).prisma;
}

/** O cliente da área e o usuário dele, para quem precisa guardar o dono. */
export async function getIncomeContext(): Promise<{ prisma: PrismaClient; userId: string }> {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new IncomeEditError("O banco de dados não está disponível.");
  }

  const userId = await assertModuleAccess("INCOME");
  return { prisma: scopedPrisma(prisma, userId), userId };
}
