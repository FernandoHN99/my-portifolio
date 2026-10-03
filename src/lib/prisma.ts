import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Schema do Postgres indicado em `?schema=` na DATABASE_URL. O Prisma CLI já o
 * usa nas migrações; o adaptador não lê a URL, então o schema é repassado a ele
 * e ao `search_path` da conexão, para as consultas cruas irem ao mesmo lugar.
 * Permite rodar o app e os roteiros num schema de teste do banco local.
 */
export function databaseSchema(connectionString: string) {
  try {
    const schema = new URL(connectionString).searchParams.get("schema");
    return schema && schema !== "public" ? schema : null;
  } catch {
    return null;
  }
}

export function getPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    return null;
  }

  if (!globalForPrisma.prisma) {
    const schema = databaseSchema(connectionString);
    const adapter = schema
      ? new PrismaPg({ connectionString, options: `-c search_path="${schema}"` }, { schema })
      : new PrismaPg({ connectionString });
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }

  return globalForPrisma.prisma;
}
