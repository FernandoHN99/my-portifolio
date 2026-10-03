import path from "node:path";

// Sessão do usuário local dos testes (spec 050), gravada pelo projeto "setup".
export const AUTH_STATE = path.join(process.cwd(), "playwright", ".auth", "user.json");

export function testUser() {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;

  if (!email || !password) {
    throw new Error("Defina E2E_USER_EMAIL e E2E_USER_PASSWORD no .env (pnpm auth:user create cria a conta).");
  }

  return { email, password };
}

/** Sem sessão, para os cenários de quem ainda não entrou. */
export const SIGNED_OUT = { cookies: [], origins: [] };
