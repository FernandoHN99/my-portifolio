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

Revisões posteriores: specs 063 a 073 no `main` e na produção desde
2026-10-05; specs 074 a 078 desde 2026-10-06. O trabalho do dia a
dia vai para a `dev`; a `main` é a produção ([fluxo de Git](docs/git-workflow.md)).

- as cotações são atualizadas só pelo job agendado (`pnpm quotes:sync`,
  [spec 053](.ai/specs/053-scheduled-quote-sync.md)); a abertura do app não
  consulta provedores. Na produção, ele roda de hora em hora como a função
  `quotesync` do projeto de jobs do Neon, em `aws-us-east-1`
  ([operação](docs/quote-sync-job.md));
- a conferência de ticker usa comprovante assinado, válido entre processos;
  a inclusão grava o preço atual e deixa histórico pendente para o job
  ([spec 063](.ai/specs/063-ticker-verification-during-save.md)). Em desenvolvimento,
  Visão geral e Cotações têm um botão para executar o job localmente; em produção,
  o botão não aparece e sua rota responde 404. A meta Selic é informativa,
  consultada no máximo a cada 24 horas pelo job e mostrada nas duas telas
  ([spec 064](.ai/specs/064-selic-and-dev-quotes.md));
- as posições têm movimentações sobre a base de cada mês
  ([spec 056](.ai/specs/056-position-transactions.md)): o lápis edita só
  atributos e os valores mudam por aporte, retirada e rendimento, corrigidos no
  próprio registro e só no mês aberto, sem cascata
  ([spec 057](.ai/specs/057-movement-form-and-attribute-pencil.md)). Regras em
  [Prompt de continuidade](.ai/context/position-transactions-prompt.md);
- inclusão e movimentação passam por etapas obrigatórias e conferência; a
  posição nova recebe saldo inicial automaticamente, sem escolhas contábeis
  ([spec 066](.ai/specs/066-guided-position-and-movement-dialogs.md));
- o cálculo automático pelo CDI foi suspenso localmente a pedido do usuário
  ([spec 065](.ai/specs/065-manual-fixed-income.md)). Rendimentos novos são
  manuais; valores e metadados anteriores da spec 060 ficam preservados. O Tesouro
  Direto é cotado pelo PU Base oficial ([spec 061](.ai/specs/061-treasury-direct-quotes.md)),
  que é só sugestão: o usuário pode digitar o preço dele e informar a posição em
  reais ([spec 070](.ai/specs/070-treasury-own-value.md));
- classe, subclasse e resgate vêm da lista fixa da planilha, dependentes entre
  si; o tipo do ativo (Tesouro Direto, ETF dos EUA…) é outro campo, com coluna,
  filtro e painel na Visão geral ([spec 068](.ai/specs/068-fixed-classification-and-asset-type.md));
- a Selic de cada competência fica no card do dólar da Visão geral e no cabeçalho
  das Cotações ([spec 067](.ai/specs/067-selic-per-month.md)); datas usam o
  `DatePicker` do design system ([spec 069](.ai/specs/069-date-picker-and-dialog-pickers.md));
- servidores de teste com outra pasta de build (`PORTFOLIO_TEST_DIST_DIR`) usam
  um nome `.next-*`, ignorado pelo Git: fora dele, o Tailwind lia o cache binário
  e quebrava o CSS de todos os `pnpm dev` ([spec 072](.ai/specs/072-dev-branch-and-local-tools.md));
- o Playwright tem o perfil `mobile-safari` (iPhone 16 Plus, WebKit)
  ([spec 062](.ai/specs/062-iphone-mobile-review.md)); testes que preenchem
  campos esperam a hidratação (`waitForHydration`), porque o WebKit é mais lento;
- a Configuração não rola na horizontal entre 320 e 430 px: a grade do editor de
  metas tem coluna `minmax(0,1fr)` abaixo de `xl`, e a matriz de renda fixa vira
  blocos no celular ([spec 074](.ai/specs/074-settings-narrow-width-overflow.md));
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
  `backups/meu-portfolio-backup-2026-10-05-movimentacoes-v3.json` (versão 5, com
  movimentações convertidas pelas regras do usuário e pelo relatório do Inter,
  [spec 071](.ai/specs/071-backup-with-movements.md), e as liquidações das
  posições que saíram, [spec 076](.ai/specs/076-position-liquidation.md)),
  restaurado na carteira local em 2026-10-05; a produção já tem o código, mas
  ainda não recebeu o arquivo.
  Nele todas as competências estão fechadas: os testes que editam ficam pulados
  até o usuário abrir um mês;
- a página da posição mostra valor aplicado (saldo inicial e aportes, menos a
  parte proporcional das retiradas), rendimento e preço médio por um custo
  médio único; o topo tem a trilha da posição abaixo das abas e a aba
  Configuração ([spec 073](.ai/specs/073-position-page-applied-value-and-nav-trail.md));
- a interface não tem textos explicativos nos quadros; na página da posição, mês
  a mês e movimentações começam recolhidos, melhor e pior mês ficam no card da
  variação, e a faixa de competências mostra só os meses com a posição
  ([spec 075](.ai/specs/075-position-page-cleanup-and-month-strip.md));
- liquidar é uma retirada total que preserva o histórico: a posição aparece no
  mês da saída como liquidada e não passa ao seguinte; remover apaga o registro.
  O rendimento soma o lucro realizado nas retiradas, e a conta corrente saiu da
  interface ([spec 076](.ai/specs/076-position-liquidation.md));
- no celular, os filtros de Posições abrem numa folha, e as abas só trocam pelo
  toque, sem arraste ([spec 077](.ai/specs/077-header-trail-and-mobile-filters.md));
- na Visão geral, as abas da alocação (Geral, Caixa, Renda Fixa, Renda Variável)
  escolhem o gráfico de cima e o comprar e vender de baixo; a virada de mês pede
  confirmação; nos gráficos de toque, a indicação some ao tirar o dedo; os
  gráficos da posição não trocam de mês no clique
  ([spec 078](.ai/specs/078-overview-allocation-tabs-and-touch-charts.md));
- transações dentro das posições foram implementadas; a previdência, que o
  usuário indicou como próximo assunto, continua em `.ai/context/backlog.md`;
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
reiniciar o `pnpm dev`. Ao abrir, o app pergunta antes de criar as competências
que faltam (a primeira, para um usuário novo, é criada na hora); as cotações e a
meta Selic vêm de `pnpm quotes:sync`.

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
