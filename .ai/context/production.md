# Produção: Vercel e Neon

Registrado em: 2026-10-03
Origem: pedido do usuário de publicar o app, na conversa de 2026-10-03.
Estado: no ar, com login ([spec 050](../specs/050-login-and-user-data.md)).

## Onde está

| Peça | Identificação |
|---|---|
| Banco | Neon, projeto `my-portifolio` (`square-fire-07443748`), região `aws-sa-east-1`, Postgres 18, branch `main` (`br-divine-rain-b6m9y9b1`), banco `my_portifolio` |
| App | Vercel, projeto `my-portifolio` (`prj_scITNB2skZfK9mh06bIgny38melT`), time pessoal `personal-team-6d7a`, plano Hobby, funções em `gru1` (São Paulo) |
| Código | GitHub `FernandoHN99/my-portifolio`; cada push no `main` publica a produção |
| Endereço principal | `my-portifolio-three-zeta.vercel.app`, sem a proteção da Vercel: o acesso depende do login do app |

## Configuração da Vercel

- Node 24.x e pnpm do `packageManager`;
- comando de build: aplica as migrações só na produção, pela conexão direta,
  e depois roda o build:
  `if [ "$VERCEL_ENV" = production ]; then DATABASE_URL="$DATABASE_URL_UNPOOLED" pnpm exec prisma migrate deploy; fi && pnpm run build`;
- variáveis, todas do tipo sensitive:
  - `DATABASE_URL`: conexão pooled do Neon, com `sslmode=verify-full`
    (Production e Preview);
  - `DATABASE_URL_UNPOOLED`: conexão direta, só para as migrações (Production);
  - `BETTER_AUTH_SECRET`: segredo das sessões, próprio da produção
    (Production e Preview);
  - `COINGECKO_API_KEY`, `FINNHUB_API_KEY` e `ALPHA_VANTAGE_API_KEY`, copiadas
    do `.env` local a pedido do usuário (Production e Preview);
  - `AUTH_ALLOWED_EMAILS` não está definida: ninguém cria conta pela tela.

O Preview usa o mesmo banco da produção, sem migrar. Um deploy de outra branch
com migração nova quebraria nele; criar uma branch de preview no Neon fica
como questão em aberto.

## Primeiro acesso

A produção começa sem usuários. Para entrar:

1. criar a conta: pelo terminal, com a conexão direta do Neon em
   `DATABASE_URL`, `pnpm auth:user create <e-mail> "<nome>"`; ou definir
   `AUTH_ALLOWED_EMAILS` na Vercel e usar "Criar conta" na tela;
2. entrar e restaurar o backup na Configuração (o mais recente fica em
   `backups/`, fora do Git).

## Histórico

- 2026-10-03: projeto da Vercel criado pelo usuário; o primeiro deploy falhou
  porque o `postinstall` (`prisma generate`) pede `DATABASE_URL`. Depois das
  variáveis, o deploy aplicou as 13 migrações de então no Neon;
- 2026-10-03: antes do login, o endereço principal respondia sem proteção, e
  os logs mostraram 5 visitantes, com o banco ainda vazio;
- 2026-10-03: specs 049 a 052 publicadas, com as migrações aplicadas pelo
  build.

## Questões em aberto

- quem cria a conta do usuário em produção e com qual e-mail;
- branch de preview no Neon ou desativar os deploys de preview;
- o MCP da Vercel desta conversa só alcançou os logs depois de reautenticado
  com o time pessoal.
