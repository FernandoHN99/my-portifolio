# 050 — Login e dados por usuário

Estado: concluída em 2026-10-03.
Definida em: 2026-10-03

## Problema

O aplicativo foi publicado na Vercel em 2026-10-03, e o endereço de produção
`my-portifolio-three-zeta.vercel.app` responde sem login, inclusive a
Configuração, que restaura backups e substitui todos os dados. O usuário pediu
em 2026-10-03: "Colocar login no próprio app (exige uma spec própria)" e,
junto, que as cotações automáticas passem a ser compartilhadas entre os
usuários ([spec 051](051-shared-automatic-quotes.md)). O app passa a ter mais
de um usuário, cada um com a própria carteira.

A decisão anterior "A primeira versão funciona somente no computador local e
não possui autenticação" ([Arquitetura](../../docs/architecture.md)) deixa de
valer.

## Objetivo

Só quem entrou com e-mail e senha usa o aplicativo, e cada usuário vê e altera
apenas os próprios dados.

## Decisões tomadas pelo agente

Respostas do usuário em 2026-10-03, depois da entrega: autorizou apagar os
dados da produção e publicar o login, informou o e-mail da conta dele, que
passou a ser o único em `AUTH_ALLOWED_EMAILS` na Vercel, e confirmou a
interpretação de "manual" da [spec 051](051-shared-automatic-quotes.md). As
demais escolhas abaixo seguem sem objeção dele.

O usuário estava ausente e autorizou seguir até o fim. Escolhas feitas:

- **Biblioteca**: Better Auth 1.7.7, com e-mail e senha, sessões no próprio
  Postgres pelo adaptador do Prisma. Funciona igual no Docker local e no Neon,
  sem serviço externo. A telemetria da biblioteca fica desligada;
- **Cadastro fechado por lista**: só cria conta quem tiver o e-mail em
  `AUTH_ALLOWED_EMAILS` (separados por vírgula). Vazia, ninguém cria conta. O
  endereço de produção é público, e uma conta aberta deixaria qualquer pessoa
  usar o app e as cotas dos provedores. Contas também podem ser criadas pelo
  terminal (`pnpm auth:user create`);
- **Isolamento**: as tabelas da carteira ganham `user_id`, e as chaves
  estrangeiras entre elas passam a ser compostas com o usuário, para o banco
  recusar uma posição que aponte para o mês, a conta ou o ativo de outro
  usuário. O código lê e grava por um cliente do Prisma com escopo
  (`getUserDb`), que acrescenta o usuário a toda consulta dessas tabelas;
- **Compartilhadas**: `market_quotes`, `daily_quotes`, `quote_refresh_runs` e
  `quote_refresh_results` continuam sem usuário (spec 051);
- **Entrada e saída**: página `/entrar`, com "Entrar" e "Criar conta". O
  `proxy.ts` manda para ela quem não tem o cookie da sessão; a checagem que
  vale é a do servidor, em cada página, ação e rota. "Sair" fica na
  Configuração, num bloco "Conta", para não apertar o topo nas telas estreitas;
- **Proteção contra tentativas**: o limite de pedidos da biblioteca guarda as
  contagens no banco (`rate_limits`), porque na Vercel cada instância tem a
  própria memória;
- **Endereços aceitos**: o domínio da Vercel muda por deploy. Os hosts aceitos
  vêm de `VERCEL_URL`, `VERCEL_BRANCH_URL` e `VERCEL_PROJECT_PRODUCTION_URL`,
  mais `AUTH_ALLOWED_HOSTS` e o localhost no desenvolvimento.

## Comportamento

- sem sessão, qualquer página leva a `/entrar?para=<endereço>`; as rotas de
  API respondem 401 em JSON;
- depois de entrar, o usuário volta ao endereço pedido;
- um usuário novo começa sem dados: restaura um backup pela Configuração ou
  inclui posições, como num banco novo;
- a Configuração mostra nome e e-mail do usuário e o botão "Sair";
- o backup exporta e restaura só os dados do usuário (formato na
  [spec 052](052-per-user-backup.md)).

## Tabelas

Novas, da biblioteca: `users`, `sessions`, `auth_accounts` (o nome `accounts`
já é das contas da carteira), `verifications` e `rate_limits`.

Com `user_id`: `institutions`, `accounts`, `assets`, `portfolio_months`,
`positions`, `position_allocations`, `target_plans`, `allocation_targets` e
`data_imports`. As chaves únicas por nome passam a valer por usuário: o nome
normalizado da instituição, a chave do ativo e a competência.

A migração exige tabelas vazias. Em 2026-10-03 o banco de produção estava vazio
e o local podia ser recriado, a pedido do usuário; os dados voltam pelo backup.

## Critérios de aceite

- sem sessão, `/`, `/posicoes`, `/configuracao` e `/api/backup` não mostram
  dados: as páginas levam a `/entrar`, e as rotas respondem 401;
- um usuário não vê nem altera dados de outro, mesmo pedindo pelos ids;
- criar conta com e-mail fora da lista é recusado com mensagem clara;
- `pnpm check`, `pnpm build` e a suíte do Playwright passam, entrando com o
  usuário de teste.

## Verificação

Em 2026-10-03, no banco local recriado (o schema `public` foi apagado com a
autorização do usuário e os dados voltaram pelo backup
`meu-portfolio-backup-2026-10-03-2016.json`, restaurado no usuário local de
teste):

- `pnpm typecheck`, `pnpm lint` e a suíte do Playwright: 175 cenários passaram
  e 10 ficaram pulados, os mesmos de antes, nos dois projetos (desktop e
  celular), entrando pelo projeto `setup`;
- sem sessão, `/`, `/posicoes` e `/configuracao` responderam 307 para
  `/entrar` (com `para=` quando há caminho), e `/api/backup` e
  `/api/quotes/open-check`, 401; um cookie de sessão falso passa pelo
  `proxy.ts`, mas a checagem do servidor o recusa nas páginas e nas rotas;
- no navegador: senha errada mostra "E-mail ou senha incorretos."; a certa
  volta ao endereço pedido; a Configuração mostra a conta e "Sair";
- isolamento, num schema de teste com dois usuários e o backup restaurado no
  primeiro, chamando as funções do app como o segundo: lista de meses vazia,
  leitura das posições do primeiro devolve nada, remover, editar e fechar o
  mês do primeiro são recusados ("Esta competência não existe."), o backup sai
  vazio, `updateMany` sem filtro altera 0 linhas e criar uma posição apontando
  para o mês do primeiro é recusado pela chave estrangeira composta; os dados
  do primeiro ficaram intactos.

Até a [spec 052](052-per-user-backup.md), a restauração do backup ainda
apagava as tabelas compartilhadas de cotação de todos.

## Referências

- [Arquitetura](../../docs/architecture.md)
- [Cotações compartilhadas](051-shared-automatic-quotes.md)
- [Backup por usuário](052-per-user-backup.md)
