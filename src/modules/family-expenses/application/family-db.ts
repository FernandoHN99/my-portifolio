import type { PrismaClient } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { scopedPrisma } from "@/lib/user-db";
import { assertModuleAccess } from "@/modules/access/application/module-access";

export class FamilyEditError extends Error {}

/**
 * Cliente dos dados de Gastos familiares (spec 082): só depois de conferir a
 * concessão da área, e restrito ao usuário da operação. Leituras, gravações,
 * backup e carga passam por aqui, inclusive pelos roteiros (`runAsUser`).
 */
export async function getFamilyDb(): Promise<PrismaClient> {
  return (await getFamilyContext()).prisma;
}

/** O cliente da área e o usuário dele, para quem precisa guardar o dono. */
export async function getFamilyContext(): Promise<{ prisma: PrismaClient; userId: string }> {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new FamilyEditError("O banco de dados não está disponível.");
  }

  const userId = await assertModuleAccess("FAMILY_EXPENSES");
  return { prisma: scopedPrisma(prisma, userId), userId };
}
