import type { PrismaClient } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { scopedPrisma } from "@/lib/user-db";
import { assertModuleAccess } from "@/modules/access/application/module-access";

/**
 * Cliente da Previdência (spec 089): só depois de conferir a concessão da área,
 * e restrito ao usuário da operação. A área só lê: as posições da carteira e os
 * holerites de Recebimentos do próprio usuário.
 */
export async function getPensionDb(): Promise<PrismaClient> {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("O banco de dados não está disponível.");
  }

  return scopedPrisma(prisma, await assertModuleAccess("PENSION"));
}
