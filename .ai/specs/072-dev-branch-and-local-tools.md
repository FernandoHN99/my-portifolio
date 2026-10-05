# 072 — Branch dev e ferramentas só do desenvolvimento

Estado: implementada localmente em 2026-10-05. A branch `dev` existe só na
máquina até o usuário aprovar o push.
Origem: pedido do usuário em 2026-10-04 para criar uma branch `dev` e uma `main`,
com o botão "Atualizar cotações (dev)" só na `dev`, em vez de deixá-lo no código
com uma condição.

## Decisão do usuário

O agente explicou o custo de manter código só numa branch:

- cada subida `dev → main` exigiria desfazer o botão com revert ou cherry-pick;
- as branches divergiriam e os conflitos voltariam;
- um descuido levaria o botão à produção;
- um push da `dev` geraria Preview na Vercel com o banco da produção.

O usuário escolheu "dev + main, botão com trava no código".

## Comportamento

- `dev` é a branch do dia a dia. A `main` continua sendo a produção, publicada a
  cada push ([fluxo de Git](../../docs/git-workflow.md)).
- O botão e a rota `/api/quotes/dev-sync` ficam nas duas branches. A trava está
  num lugar só, `devToolsEnabled()` em `src/lib/dev-tools.ts`, que vale só no
  `pnpm dev`. No build, o Next fixa `NODE_ENV` em produção: o botão não aparece,
  e a rota responde 404 antes de sessão, banco ou provedores (spec 064).
- `vercel.json` desliga os deploys da branch `dev`
  (`git.deploymentEnabled.dev = false`): o Preview usaria o banco da produção
  sem migrar ([Produção](../context/production.md)).

## Achado do mesmo dia: CSS corrompido no `pnpm dev`

A causa do "Parsing CSS source code failed" de 2026-10-04, que voltou nesta
rodada:

- servidores de teste com outra pasta de build (`PORTFOLIO_TEST_DIST_DIR`, como
  `.next-backupmov`) ficavam fora do `.gitignore`;
- o Tailwind procura classes em todo arquivo não ignorado, então lia o cache
  binário do Turbopack nessas pastas e gerava CSS para classes misturadas com
  bytes binários;
- todos os servidores de desenvolvimento quebravam juntos.

O `.gitignore` agora ignora `/.next-*/`. Reproduzido e corrigido: com a pasta
ignorada, o servidor de teste e o do usuário compilam a mesma classe
(`bottom-[calc(env(safe-area-inset-bottom,0px)+88px)]`) sem erro.

Mais dois cuidados com essas pastas, observados em 2026-10-05:

- o `next dev` acrescenta os tipos da pasta (`.next-e2e/types/**/*.ts`) ao
  `include` do `tsconfig.json` e reformata o arquivo. Desfaça com
  `git checkout tsconfig.json` ao parar o servidor;
- uma pasta de trabalho do Git que sobra em `.claude/worktrees/` com o próprio
  `.next` faz o `pnpm lint` acusar milhares de erros nesse build. Traga o que
  ela tiver de novo e remova-a com `git worktree remove`.

## Verificação

- `tests/unit/selic-reference.test.ts`: o endpoint de produção recusa antes de
  qualquer consulta, agora pela trava única.
- `tests/e2e/selic-reference.spec.ts`: o botão aparece no `pnpm dev` e só
  executa ao clicar.
