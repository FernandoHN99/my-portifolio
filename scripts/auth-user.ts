import "dotenv/config";

import { randomBytes } from "node:crypto";

import { getPrismaClient } from "../src/lib/prisma";
import { getAuth, MIN_PASSWORD_LENGTH, withSignUpOverride } from "../src/modules/auth/auth";

// Contas pelo terminal (spec 050), sem depender de AUTH_ALLOWED_EMAILS:
//
//   pnpm auth:user list
//   pnpm auth:user create <e-mail> <nome>
//
// A senha vem de AUTH_USER_PASSWORD; sem ela, uma senha aleatória é gerada e
// mostrada uma vez. Com DATABASE_URL de um schema de teste, age só nele.

async function main() {
  const [command, email, ...nameParts] = process.argv.slice(2);
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("DATABASE_URL não está configurada.");
  }

  if (command === "list") {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { email: true, name: true, createdAt: true },
    });
    for (const user of users) {
      console.info(`${user.email}\t${user.name}\t${user.createdAt.toISOString()}`);
    }
    if (users.length === 0) {
      console.info("Nenhuma conta.");
    }
  } else if (command === "create" && email && nameParts.length > 0) {
    const provided = process.env.AUTH_USER_PASSWORD;
    const password = provided ?? randomBytes(15).toString("base64url");

    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`A senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    }

    await withSignUpOverride(() =>
      getAuth().api.signUpEmail({ body: { email, password, name: nameParts.join(" ") } }),
    );
    console.info(`Conta criada: ${email}.`);
    if (!provided) {
      console.info(`Senha gerada (mostrada só agora): ${password}`);
    }
  } else {
    console.error("Uso: auth:user list | auth:user create <e-mail> <nome>");
    process.exitCode = 1;
  }

  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
