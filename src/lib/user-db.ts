import { AsyncLocalStorage } from "node:async_hooks";

import type { PrismaClient } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { requireSessionUser } from "@/modules/auth/session";

// Dados por usuário (spec 050). As tabelas da carteira têm `user_id`; este
// cliente acrescenta o usuário a toda leitura e gravação delas, para o código
// de cada tela não precisar lembrar do filtro. As cotações são compartilhadas
// (spec 051) e passam sem filtro. As chaves estrangeiras compostas com o
// usuário garantem no banco que nenhuma linha aponte para dados de outro.

const OWNED_MODELS = new Set([
  "DataImport",
  "Institution",
  "Account",
  "Asset",
  "PortfolioMonth",
  "Position",
  "PositionAllocation",
  "TargetPlan",
  "AllocationTarget",
  "ManualQuote",
]);

const WHERE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

type Args = { where?: object; data?: object | object[]; create?: object };

/**
 * Valor de `userId` nas gravações pelo cliente com escopo: os tipos do Prisma
 * pedem o campo, e a extensão sempre o troca pelo usuário da operação. No
 * cliente comum, o texto vazio não é um UUID e a gravação falha, em vez de
 * criar uma linha sem dono.
 */
export const SCOPED_USER = "";

export function isOwnedModel(model: string) {
  return OWNED_MODELS.has(model);
}

function scope(operation: string, args: Args, userId: string): Args {
  const scoped: Args = { ...args };

  if (WHERE_OPERATIONS.has(operation)) {
    scoped.where = { ...args.where, userId };
  } else if (operation === "create") {
    scoped.data = { ...args.data, userId };
  } else if (operation === "createMany" || operation === "createManyAndReturn") {
    const rows = Array.isArray(args.data) ? args.data : [args.data ?? {}];
    scoped.data = rows.map((row) => ({ ...row, userId }));
  } else if (operation === "upsert") {
    scoped.where = { ...args.where, userId };
    scoped.create = { ...args.create, userId };
  } else {
    throw new Error(`Operação ${operation} sem escopo de usuário.`);
  }

  return scoped;
}

const globalForScoped = globalThis as unknown as { scopedClients?: Map<string, PrismaClient> };
const scopedClients = (globalForScoped.scopedClients ??= new Map());

/**
 * Cliente do Prisma restrito a um usuário. As gravações nas tabelas da carteira
 * recebem o usuário, e as leituras, atualizações e exclusões só alcançam as
 * linhas dele. O tipo continua o do cliente comum: a extensão só muda os
 * argumentos das consultas, não os resultados.
 */
export function scopedPrisma(base: PrismaClient, userId: string): PrismaClient {
  const cached = scopedClients.get(userId);

  if (cached) {
    return cached;
  }

  const client = base.$extends({
    name: "user-scope",
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return OWNED_MODELS.has(model) ? query(scope(operation, args as Args, userId)) : query(args);
        },
      },
    },
  }) as unknown as PrismaClient;

  scopedClients.set(userId, client);
  return client;
}

const userContext = new AsyncLocalStorage<{ userId: string }>();

/**
 * Roda uma operação como um usuário, fora de um pedido do navegador: os roteiros
 * de terminal, como o backup (`pnpm backup:export --user`).
 */
export function runAsUser<T>(userId: string, operation: () => Promise<T>) {
  return userContext.run({ userId }, operation);
}

/** Usuário da operação: o do roteiro, se houver, ou o da sessão do pedido. */
export async function currentUserId() {
  return userContext.getStore()?.userId ?? (await requireSessionUser()).id;
}

/**
 * Cliente do usuário da sessão. Sem banco configurado, nulo, como
 * `getPrismaClient`. Sem sessão, leva à página de entrada; as rotas de API
 * conferem a sessão antes e respondem 401.
 */
export async function getUserDb(): Promise<PrismaClient | null> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return null;
  }

  return scopedPrisma(prisma, await currentUserId());
}
