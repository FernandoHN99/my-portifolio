import { getPrismaClient } from "@/lib/prisma";

export type DatabaseStatus = {
  state: "online" | "offline" | "not-configured";
  label: string;
  detail: string;
  latencyMs?: number;
};

export async function getDatabaseStatus(): Promise<DatabaseStatus> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return {
      state: "not-configured",
      label: "Não configurado",
      detail: "Copie .env.example para .env e inicie o PostgreSQL.",
    };
  }

  const startedAt = performance.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return {
      state: "online",
      label: "Conectado",
      detail: "O banco local respondeu normalmente.",
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch {
    return {
      state: "offline",
      label: "Indisponível",
      detail: "Inicie o container com pnpm db:up e recarregue a página.",
    };
  }
}
