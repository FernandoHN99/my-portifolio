import { AsyncLocalStorage } from "node:async_hooks";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

import { getPrismaClient } from "@/lib/prisma";
import { allowedHosts, isSignUpAllowed, originOf } from "@/modules/auth/access";

// Login com e-mail e senha (spec 050), com Better Auth e sessões no Postgres.
// O cadastro pela tela só aceita os e-mails de AUTH_ALLOWED_EMAILS; o roteiro
// `pnpm auth:user create` cria contas pelo terminal.

export const MIN_PASSWORD_LENGTH = 10;

const signUpOverride = new AsyncLocalStorage<true>();

/** Cria a conta mesmo fora da lista de e-mails: só para o roteiro de terminal. */
export function withSignUpOverride<T>(operation: () => Promise<T>) {
  return signUpOverride.run(true, operation);
}

function createAuth() {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("DATABASE_URL não está configurada.");
  }

  const hosts = allowedHosts();
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;

  return betterAuth({
    appName: "Meu portfólio",
    database: prismaAdapter(prisma, { provider: "postgresql", transaction: true }),
    baseURL: process.env.BETTER_AUTH_URL ?? {
      allowedHosts: hosts,
      fallback: productionHost ? `https://${productionHost}` : "http://localhost:3000",
      protocol: process.env.VERCEL ? "https" : "http",
    },
    trustedOrigins: hosts.map(originOf),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      autoSignIn: true,
    },
    user: { modelName: "user" },
    session: {
      modelName: "session",
      // A sessão confirmada fica 5 minutos num cookie assinado, para cada
      // página não consultar o banco só para saber quem é o usuário.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    account: { modelName: "authAccount" },
    verification: { modelName: "verification" },
    // Na Vercel cada instância tem a própria memória: as contagens do limite de
    // tentativas ficam no banco.
    rateLimit: { storage: "database", modelName: "rateLimit" },
    advanced: { database: { generateId: "uuid" } },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!signUpOverride.getStore() && !isSignUpAllowed(user.email)) {
              throw new APIError("FORBIDDEN", {
                message: "Este e-mail não tem permissão para criar conta. Peça acesso a quem administra o aplicativo.",
              });
            }
            return { data: user };
          },
        },
      },
    },
    telemetry: { enabled: false },
    // Deve ser o último: grava os cookies quando a API roda numa Server Action.
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { auth?: Auth };

/** A instância é criada no primeiro uso: o build não tem banco configurado. */
export function getAuth(): Auth {
  return (globalForAuth.auth ??= createAuth());
}
