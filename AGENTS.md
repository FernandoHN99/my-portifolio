# Contexto do projeto

Sistema pessoal de finanças atualmente mantido em
`raw_file/01-Investimentos.xlsm`. O objetivo é substituir suas funcionalidades
por uma aplicação web em Next.js, com maior flexibilidade, controle
e capacidade de evolução.

O projeto entrou em implementação incremental, orientada por specs
pequenas em `.ai/specs/`. O desenvolvimento será AI-first, com Codex
e Claude Code consultando a mesma base de conhecimento.

## Trabalho em andamento

Estado em 2026-10-04: specs 016 e 028 a 062 no `main` e na produção
(detalhes em `.ai/specs/README.md`). O app está publicado na Vercel com o banco
no Neon, e o job das cotações roda como função do Neon
([Produção](.ai/context/production.md)).

- as cotações são atualizadas só pelo job agendado (`pnpm quotes:sync`,
  [spec 053](.ai/specs/053-scheduled-quote-sync.md)); a abertura do app não
  consulta provedores. Na produção, ele roda de hora em hora como a função
  `quotesync` do projeto de jobs do Neon, em `aws-us-east-1`
  ([operação](docs/quote-sync-job.md));
- as posições têm movimentações sobre a base de cada mês
  ([spec 056](.ai/specs/056-position-transactions.md)): o lápis edita só
  atributos e os valores mudam por aporte, retirada e rendimento, corrigidos no
  próprio registro e só no mês aberto, sem cascata
  ([spec 057](.ai/specs/057-movement-form-and-attribute-pencil.md)). Regras em
  [Prompt de continuidade](.ai/context/position-transactions-prompt.md);
- a renda fixa a percentual do CDI é calculada pelo job com o CDI diário do
  Banco Central, pela API JSON ou, fora do ar, pelo webservice SOAP do SGS
  ([spec 060](.ai/specs/060-cdi-fixed-income.md)); o Tesouro
  Direto é cotado pelo PU Base oficial ([spec 061](.ai/specs/061-treasury-direct-quotes.md));
- o Playwright tem o perfil `mobile-safari` (iPhone 16 Plus, WebKit)
  ([spec 062](.ai/specs/062-iphone-mobile-review.md)); testes que preenchem
  campos esperam a hidratação (`waitForHydration`), porque o WebKit é mais lento;
- o app tem login e mais de um usuário ([spec 050](.ai/specs/050-login-and-user-data.md)):
  as tabelas da carteira têm `user_id`, e o código lê e grava pelo cliente com
  escopo (`getUserDb`, em `src/lib/user-db.ts`); as cotações automáticas são de
  todos, e a digitada à mão é do usuário ([spec 051](.ai/specs/051-shared-automatic-quotes.md)).
  Não há atualização manual de cotações;
- o banco local foi recriado em 2026-10-03, com a autorização do usuário, e
  tem o histórico preparado no passo pré-produção ([spec 041](.ai/specs/041-history-preparation.md))
  restaurado no usuário local de `E2E_USER_EMAIL`, cuja senha está no `.env`.
  Os testes de interface entram com ele e usam os valores dele;
- o backup ([spec 052](.ai/specs/052-per-user-backup.md)) exporta e restaura a
  carteira do usuário pela Configuração ou por `pnpm backup:export --user` e
  `pnpm backup:restore --user`; os arquivos ficam em `backups/`, fora do Git.
  É a única forma de carregar dados e o caminho para outro banco, como o de
  produção. A importação do Excel saiu ([spec 047](.ai/specs/047-json-only-data.md));
- sem plano de metas, o app cria as "Metas padrão" a partir das categorias da
  carteira ([spec 048](.ai/specs/048-default-targets-and-quotes-button.md));
- toda mudança no modelo de dados (como as transações) segue o roteiro de
  [docs/backup-format.md](docs/backup-format.md), que mantém o formato do
  backup e as conversões de versões antigas;
- o backup mais recente dos dados reais é
  `backups/meu-portfolio-backup-2026-10-03-2016.json` (versão 2, convertido na
  restauração); a produção começa sem usuários e recebe os dados por ele;
- transações dentro das posições e a previdência, que o usuário indicou como
  próximo assunto, estão no backlog, em `.ai/context/backlog.md`;
- as respostas do usuário, o backlog e o que ainda aguarda resposta estão em
  `.ai/context/ux-restructure.md`, nas seções de respostas de 2026-10-02
  (segunda, terceira e quarta rodadas) e nos ajustes de 2026-10-03;
- só um mês aberto (rascunho) aceita edição; os testes que editam procuram a
  competência aberta mais recente, e abrir um mês grava no banco;
- depois de `pnpm db:generate`, o `pnpm dev` precisa reiniciar para usar o
  cliente Prisma novo; tocar o `next.config.ts` reinicia o servidor sem
  fechar o processo.

O propósito, as restrições, as regras de cálculo e as decisões da
iniciativa estão em `.ai/context/ux-restructure.md`, e o estado de cada
fatia fica em `.ai/specs/README.md`.

Ao atualizar um ambiente local: `pnpm install`, `pnpm db:migrate`,
`pnpm db:generate` (o `migrate dev` do Prisma 7 não regenera o cliente) e
reiniciar o `pnpm dev`. Ao abrir, o app cria as competências que faltam (e a
primeira, para um usuário novo); as cotações e o CDI vêm de `pnpm quotes:sync`.

Para testar gravações sem tocar nos dados reais, use um schema de teste no
mesmo Postgres (ideia do usuário, spec 042): `pnpm db:test-schema create
<nome>` aplica as migrações, `DATABASE_URL="$(pnpm --silent db:test-schema url
<nome>)"` aponta qualquer roteiro para ele, e `E2E_BASE_URL` leva o Playwright
a um servidor já rodando nesse schema.

Testes de interface entram com o usuário de `E2E_USER_EMAIL` e
`E2E_USER_PASSWORD` (projeto `setup` do Playwright, spec 050) e rodam sobre os
dados reais dele, sem gravar dados da carteira: todo
arquivo em `tests/e2e/` substitui a checagem de abertura com
`stubQuoteChecks` (`tests/e2e/support/quote-checks.ts`); os que editam
procuram um mês aberto com `openEditableMonth`
(`tests/e2e/support/position-form.ts`) e conferem o formulário sem salvar
([spec 043](.ai/specs/043-position-form.md)). Os provedores de
cotação não são alcançáveis em ambientes de nuvem; nesses casos, verifique
com respostas simuladas e registre na spec. Os cenários de edição de cotação
só rodam quando a competência aberta tem uma cotação editável (spec 028).

As cotações seguem cadeias de provedores (spec 037): o Yahoo Finance cota a
B3 sem chave, e o Alpha Vantage, de 25 consultas por dia, fica por último.
`BRAPI_TOKEN` é opcional.

## Como trabalhar neste projeto

1. Leia `.ai/README.md` para entender a organização do contexto.
2. Consulte `.ai/context/initial-context.md` para conhecer o estágio
   atual, as orientações do usuário e as questões em aberto.
3. Leia a spec ativa e somente os demais documentos relevantes à tarefa.
4. Antes de analisar ou modificar uma área, procure e leia os
   `AGENTS.md` existentes no caminho da raiz até essa área.
5. Consulte o código e as fontes referenciadas para verificar
   o comportamento real.

Existirão outros `AGENTS.md` em partes específicas do projeto quando
essas áreas justificarem contexto próprio. Cada arquivo deve trazer
orientações locais e referências, sem repetir o conhecimento global.
Instruções locais aplicam-se à respectiva subárvore.

## Regras gerais

- Respeite o estágio e o escopo autorizado para a tarefa.
- Divida a implementação em specs pequenas, com estado e critérios de
  aceite explícitos, atualizando-as conforme o trabalho avança.
- Diferencie fatos observados, propostas, decisões e questões abertas.
- Atualize a fonte responsável por cada assunto; nos demais lugares,
  use referências.
- Registre descobertas relevantes para permitir continuidade entre
  agentes, seguindo `.ai/README.md`.
- A interface do aplicativo deve servir às tarefas financeiras do usuário.
  Não criar telas ou componentes para narrar andamento do projeto, roadmap,
  pendências de desenvolvimento ou estado de specs; registre isso em `.ai/`
  e informe o usuário pela conversa.
- Não trate sugestões anteriores como decisões aprovadas.
- Antes de preparar ou executar commits, consulte
  [o fluxo de Git](docs/git-workflow.md), fonte das regras de
  aprovação explícita e do padrão de mensagens.
- Preserve a planilha de referência e não copie suas credenciais
  para documentação ou código.
- O projeto possui apenas um `CLAUDE.md`, localizado na raiz.
  Não criar novos `CLAUDE.md`. Contextos adicionais devem ser
  representados por `AGENTS.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
