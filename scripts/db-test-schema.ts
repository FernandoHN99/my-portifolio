import "dotenv/config";

import { execFileSync } from "node:child_process";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

// Schemas de teste dentro do Postgres local (ideia do usuário em 2026-10-03):
// um schema novo recebe as migrações e serve para testar importações e
// restaurações sem tocar nos dados reais, que ficam no schema `public`.
//
//   pnpm db:test-schema create teste      cria e aplica as migrações
//   pnpm db:test-schema url teste         mostra a DATABASE_URL do schema
//   pnpm db:test-schema drop teste        apaga o schema e tudo nele
//
// Para usar: DATABASE_URL="$(pnpm --silent db:test-schema url teste)" <comando>.

const [command, name] = process.argv.slice(2);

function usage(): never {
  console.error("Uso: db:test-schema <create|url|drop> <nome>");
  process.exit(1);
}

function schemaUrl(schema: string) {
  const base = process.env.DATABASE_URL;

  if (!base) {
    throw new Error("DATABASE_URL não está configurada.");
  }

  const url = new URL(base);
  url.searchParams.set("schema", schema);
  return url.toString();
}

async function main() {
  if (!command || !name) {
    usage();
  }

  if (!/^[a-z_][a-z0-9_]{0,40}$/.test(name) || name === "public") {
    throw new Error("Nome inválido: use letras minúsculas, números e _, e nunca public.");
  }

  const url = schemaUrl(name);

  if (command === "url") {
    console.info(url);
    return;
  }

  if (command === "create") {
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: url },
    });
    console.info(`Schema ${name} pronto. DATABASE_URL=${url}`);
    return;
  }

  if (command === "drop") {
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);
    await prisma.$disconnect();
    console.info(`Schema ${name} apagado.`);
    return;
  }

  usage();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
