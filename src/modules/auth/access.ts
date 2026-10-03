// Quem pode criar conta e de quais endereços o login é aceito (spec 050).
// Sem dependências de framework, para servir à configuração e aos roteiros.

function list(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * E-mails que podem criar conta, de `AUTH_ALLOWED_EMAILS`. Lista vazia: ninguém
 * cria conta pela tela. O endereço de produção é público, e uma conta aberta
 * deixaria qualquer pessoa usar o app e as cotas dos provedores.
 */
export function allowedSignUpEmails(env: Record<string, string | undefined> = process.env) {
  return new Set(list(env.AUTH_ALLOWED_EMAILS));
}

export function isSignUpAllowed(email: string, env: Record<string, string | undefined> = process.env) {
  return allowedSignUpEmails(env).has(email.trim().toLowerCase());
}

/**
 * Hosts de onde o login é aceito. Na Vercel o domínio muda a cada deploy: valem
 * o do deploy, o da branch e o de produção, que a Vercel informa, mais os de
 * `AUTH_ALLOWED_HOSTS`. Fora da Vercel, o localhost do desenvolvimento.
 */
export function allowedHosts(env: Record<string, string | undefined> = process.env) {
  const hosts = new Set(list(env.AUTH_ALLOWED_HOSTS));

  for (const key of ["VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) {
    const host = env[key]?.trim().toLowerCase();
    if (host) {
      hosts.add(host);
    }
  }

  if (env.NODE_ENV !== "production" || !env.VERCEL) {
    hosts.add("localhost:3000");
    hosts.add("127.0.0.1:3000");
  }

  return [...hosts];
}

export function originOf(host: string) {
  return host.startsWith("localhost") || host.startsWith("127.0.0.1") ? `http://${host}` : `https://${host}`;
}
