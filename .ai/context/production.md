# Produção: Vercel e Neon

Registrado em: 2026-10-03
Origem: pedido do usuário de publicar o app, na conversa de 2026-10-03.
Estado em 2026-10-03, 21:25 UTC: no ar o deploy anterior ao login, atrás do
login da Vercel; o deploy das specs 049 a 052 aguarda a autorização do usuário
para esvaziar as tabelas da carteira (veja "Pendente").

## Onde está

| Peça | Identificação |
|---|---|
| Banco | Neon, projeto `my-portifolio` (`square-fire-07443748`), região `aws-sa-east-1`, Postgres 18, branch `main` (`br-divine-rain-b6m9y9b1`), banco `my_portifolio` |
| App | Vercel, projeto `my-portifolio` (`prj_scITNB2skZfK9mh06bIgny38melT`), time pessoal `personal-team-6d7a`, plano Hobby, funções em `gru1` (São Paulo) |
| Código | GitHub `FernandoHN99/my-portifolio`; cada push no `main` publica a produção |
| Endereço principal | `my-portifolio-three-zeta.vercel.app`; hoje com a proteção da Vercel em todos os deploys (`ssoProtection: all`), até o login do app estar no ar |

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
- 2026-10-03, 19:47 UTC: o usuário restaurou o backup dos dados reais na
  produção, ainda sem login;
- 2026-10-03, 21:17 UTC: o push das specs 049 a 052 disparou o deploy
  `dpl_3Z15WkGQip6RStVCrTQ2EYjqamAu`. A migração da 049 foi aplicada; a da
  050 parou na própria trava, que exige as tabelas da carteira vazias, sem
  alterar nada, e ficou registrada como falha em `_prisma_migrations`. O
  deploy anterior continuou no ar;
- 2026-10-03, 21:20 UTC: o agente criou a branch do Neon
  `snapshot-antes-da-050` (`br-green-bar-b6h54s91`), cópia exata da produção;
  ligou a proteção da Vercel em todos os deploys, porque o endereço público
  mostrava os dados reais sem login; exportou a produção, com o código do
  commit da 049, para `backups/producao-antes-da-050-2026-10-03.json`
  (versão 3, fora do Git) e conferiu que o arquivo restaura completo no código
  novo. Os dados da produção eram os do backup local, salvo preços e status
  mexidos pela atualização automática.

## Pendente

Com a autorização do usuário, para publicar o login:

1. `prisma migrate resolve --rolled-back 20261003220000_login_and_user_data`
   na produção, pela conexão direta;
2. apagar, numa transação, as linhas de `allocation_targets`, `target_plans`,
   `position_allocations`, `positions`, `portfolio_months`, `accounts`,
   `institutions`, `assets` e `data_imports` (as cotações ficam);
3. novo deploy do `main`, que aplica as migrações 050 e 051;
4. voltar a proteção da Vercel ao padrão (`all_except_custom_domains`), para o
   endereço principal depender só do login do app;
5. o usuário cria a conta e restaura `backups/producao-antes-da-050-2026-10-03.json`.

## Questões em aberto

- quem cria a conta do usuário em produção e com qual e-mail;
- branch de preview no Neon ou desativar os deploys de preview;
- o MCP da Vercel desta conversa só alcançou os logs depois de reautenticado
  com o time pessoal.
