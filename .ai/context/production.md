# Produção: Vercel e Neon

Registrado em: 2026-10-03
Origem: pedido do usuário de publicar o app, na conversa de 2026-10-03.
Estado em 2026-10-03, 21:40 UTC: no ar com login, specs 049 a 052
(deploy `dpl_3JmfYpdwKKPNkkwHmErh1LkA9cEC`). A produção não tem usuários nem
dados da carteira; o usuário cria a conta e restaura o backup (veja
"Pendente").

## Onde está

| Peça | Identificação |
|---|---|
| Banco | Neon, projeto `my-portifolio` (`square-fire-07443748`), região `aws-sa-east-1`, Postgres 18, branch `main` (`br-divine-rain-b6m9y9b1`), banco `my_portifolio` |
| App | Vercel, projeto `my-portifolio` (`prj_scITNB2skZfK9mh06bIgny38melT`), time pessoal `personal-team-6d7a`, plano Hobby, funções em `gru1` (São Paulo) |
| Código | GitHub `FernandoHN99/my-portifolio`; cada push no `main` publica a produção |
| Endereço principal | `my-portifolio-three-zeta.vercel.app`, sem a proteção da Vercel (`ssoProtection: all_except_custom_domains`): o acesso depende do login do app |

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

## Pendente

O usuário cria a conta em "Criar conta", com o e-mail de
`AUTH_ALLOWED_EMAILS`, e restaura na Configuração o arquivo
`backups/producao-antes-da-050-2026-10-03.json`. A branch
`snapshot-antes-da-050` pode ser apagada depois de conferidos os dados.

## Decisões do usuário

Em 2026-10-03:

- autorizou apagar os dados da carteira na produção e publicar o login;
- a conta dele é criada por ele mesmo, pela tela, com o e-mail que ele
  informou, o único em `AUTH_ALLOWED_EMAILS`;
- o Preview continua usando o banco da produção, sem migrar.

## Observações

- o MCP da Vercel desta conversa só alcançou os logs depois de reautenticado
  com o time pessoal.
