# Produção: Vercel e Neon

Registrado em: 2026-10-03
Origem: pedido do usuário de publicar o app, na conversa de 2026-10-03.
Estado em 2026-10-05: no ar com as specs 053 a 073 (deploy
`dpl_2QjZJVRfxEEgZ49BkLzYcP1V3uca`, commit `37c7e43`), com a conta do usuário
e os dados dele. As cotações e a meta Selic vêm da função `quotesync` do projeto
de jobs, de hora em hora. A `main` recebe a branch `dev`, que a Vercel não
publica ([fluxo de Git](../../docs/git-workflow.md)).

## Onde está

| Peça | Identificação |
|---|---|
| Banco | Neon, projeto `my-portifolio` (`square-fire-07443748`), região `aws-sa-east-1`, Postgres 18, branch `main` (`br-divine-rain-b6m9y9b1`), banco `my_portifolio` |
| App | Vercel, projeto `my-portifolio` (`prj_scITNB2skZfK9mh06bIgny38melT`), time pessoal `personal-team-6d7a`, plano Hobby, funções em `gru1` (São Paulo) |
| Código | GitHub `FernandoHN99/my-portifolio`; cada push no `main` publica a produção |
| Endereço principal | `my-portifolio-three-zeta.vercel.app`, sem a proteção da Vercel (`ssoProtection: all_except_custom_domains`): o acesso depende do login do app |
| Jobs | Neon, projeto `my-portifolio-jobs` (`square-cell-51336542`), região `aws-us-east-1`, branch `main` (`br-old-dream-b8ysin0q`): função `quotesync` e gatilho `quotes-hourly` (cron `0 * * * *`, UTC), que conectam ao banco de São Paulo ([operação](../../docs/quote-sync-job.md)) |

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
  - `AUTH_ALLOWED_EMAILS`: o e-mail informado pelo usuário, o único que cria
    conta pela tela (Production e Preview, tipo encrypted).

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
- 2026-10-03, 21:31 UTC: com a autorização do usuário, a migração falha foi
  marcada como desfeita (`prisma migrate resolve --rolled-back`) e as linhas da
  carteira foram apagadas numa transação; as cotações ficaram (216 mensais e
  312 diárias);
- 2026-10-03, 21:33 UTC: o deploy `dpl_3JmfYpdwKKPNkkwHmErh1LkA9cEC` aplicou as
  migrações 050 e 051 e entrou no ar; a proteção da Vercel voltou ao padrão.
  Conferido: sem sessão, as páginas levam a `/entrar` e as rotas respondem
  401; um cookie falso é recusado; um e-mail fora da lista não cria conta
  (403); o deploy novo não tem erros nos logs.
- 2026-10-03: o deploy do commit `5449521` (só documentação) falhou: o cache
  do build deixou o `pnpm install` em "Already up to date", que pula o
  `postinstall`, e o build não achou o cliente do Prisma
  (`@/generated/prisma/client`). O deploy anterior seguiu no ar. Desde
  2026-10-04, o `build` do `package.json` roda `prisma generate` antes do
  `next build`;
- 2026-10-04, 18:40 UTC: antes de publicar as specs 053 a 062, o agente criou
  a branch `snapshot-antes-da-053` (`br-blue-base-b61rhe56`), cópia da
  produção com 1 usuário, 41 competências, 457 posições e 4 planos de metas
  (3 inativos);
- 2026-10-04, 18:42 UTC: o push dos commits `154b81b` a `4ef7e18` no `main`
  publicou o deploy `dpl_kdNuafnZUHLzV1Pk4Uwm8ZbHQD64`, que aplicou as quatro
  migrações de 2026-10-04 (20 no total). Conferido: as 457 posições com a base
  do mês igual ao saldo, só o plano de metas vigente, 13 símbolos no cadastro
  do job, `/entrar` respondendo e as rotas de dados em 401 sem sessão, sem
  erros nos logs;
- 2026-10-04, 18:43 UTC: a função `quotesync` (deployment 1) e o gatilho
  `quotes-hourly` foram publicados no projeto de jobs pela CLI do Neon
  (`neon deploy`), com o login do usuário no navegador;
- 2026-10-04, 19:00 UTC: primeira execução pelo gatilho, em 5 segundos:
  execução COMPLETED, 10 cotações atualizadas (BTC, GLDM, GPCA11.SAO, IAUM,
  SIVR, SOL, USD, VOO, VXUS e XLE) e outubro reprecificado. ARGT, ETH e VTI,
  fora da carteira de outubro, não foram buscados. Sem posição pelo CDI na
  produção, o passo do CDI não buscou taxas;
- 2026-10-04, 19:02 UTC: a função foi republicada (deployment 2) com a conexão
  em `sslmode=verify-full`, para tirar o aviso do `pg` sobre `require`.
- 2026-10-05, 00:12 UTC: antes de publicar as specs 063 a 072, o agente criou a
  branch `snapshot-antes-da-063` (`br-polished-glade-b6dbc94y`, sem compute),
  cópia da produção com 1 usuário, 41 competências, 459 posições,
  2 movimentações e 52 ativos;
- 2026-10-05, 00:13 UTC: com a aprovação do usuário ("sobe a dev na main e faz o
  deploy"), a `main` avançou para a `dev` (commit `28da6fc`). O deploy
  `dpl_A8ktJetPWa5fUfgWavotxouGh6u9` aplicou as migrações `selic_reference_rate`
  e `selic_history_and_asset_type` (22 no total) e ficou pronto em cerca de um
  minuto. Conferido: `/entrar` respondendo, a página inicial levando ao login,
  as rotas de dados em 401 sem sessão e nenhum erro de execução. Nenhum deploy
  da branch `dev` foi criado;
- 2026-10-05, 00:15 UTC: a função `quotesync` foi republicada pela CLI do Neon
  com o código novo do job (Selic com histórico, sem cálculo do CDI);
- 2026-10-05, 00:00 UTC, ainda com a função anterior: BTC e SOL falharam
  porque a CoinGecko excedeu o tempo, e a reserva, a Binance, responde HTTP 451
  na região `aws-us-east-1`, que ela bloqueia. As execuções das seis horas
  anteriores não tiveram falhas.
- 2026-10-05, 01:00 UTC: primeira execução da função nova, em 3 segundos,
  COMPLETED, sem falhas: a meta Selic entrou com o histórico de dez anos
  (53 mudanças, a última em 17/09/2026; 13,75% observado em 04/10/2026), e a
  Visão geral e as Cotações passam a mostrar a Selic de cada competência.
- 2026-10-05: o usuário autorizou apagar as cópias `snapshot-antes-da-050`,
  `snapshot-antes-da-053` e `snapshot-antes-da-063`; o projeto ficou só com a
  branch `main`;
- 2026-10-05: com a aprovação do usuário ("sobe a dev na main e faz o deploy"),
  a `main` avançou para `37c7e43` (spec 073, sem migração). O deploy
  `dpl_2QjZJVRfxEEgZ49BkLzYcP1V3uca` ficou pronto em cerca de 50 segundos.
  Conferido: `/entrar` respondendo, páginas sem sessão levando ao login, rotas
  de dados em 401 e nenhum erro de execução. A função do job não mudou.

## Pendente

- o backup com movimentações v3 ([spec 071](../specs/071-backup-with-movements.md)
  e [spec 076](../specs/076-position-liquidation.md)), que substituiu a v2, só
  entra na produção se o usuário importá-lo pela Configuração; sem ele, a página
  da posição na produção calcula o valor aplicado só a partir das movimentações
  já registradas lá;
- a Binance não serve de reserva para a função em `aws-us-east-1` (HTTP 451):
  sem a CoinGecko, BTC e SOL esperam a execução seguinte;
- o backup passou à versão 5; arquivos antigos continuam restaurando.

## Decisões do usuário

Em 2026-10-03:

- autorizou apagar os dados da carteira na produção e publicar o login;
- a conta dele é criada por ele mesmo, pela tela, com o e-mail que ele
  informou, o único em `AUTH_ALLOWED_EMAILS`;
- o Preview continua usando o banco da produção, sem migrar.

Em 2026-10-04:

- o agendamento das cotações é a função do Neon em `aws-us-east-1`;
- aprovou os quatro commits das specs 053 a 062 e, depois, a correção do CDI;
- pediu o deploy de tudo ("Faça o deploy quero ver tudo funcionando!"), o que
  encerrou o "somente local".

Em 2026-10-05:

- aprovou os commits na `dev`, o push dela e a restauração local do backup com
  movimentações;
- pediu para subir a `dev` na `main` e fazer o deploy.

## Observações

- o MCP da Vercel desta conversa só alcançou os logs depois de reautenticado
  com o time pessoal.
