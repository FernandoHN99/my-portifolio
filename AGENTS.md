# Contexto do projeto

Sistema pessoal de finanças atualmente mantido em
`raw_file/01-Investimentos.xlsm`. O objetivo é substituir suas funcionalidades
por uma aplicação web em Next.js, com maior flexibilidade, controle
e capacidade de evolução.

O projeto entrou em implementação incremental, orientada por specs
pequenas em `.ai/specs/`. O desenvolvimento será AI-first, com Codex
e Claude Code consultando a mesma base de conhecimento.

## Trabalho em andamento

Estado em 2026-10-02, ao fim da sessão que implementou as specs 018 a 027:

- concluídas, verificadas e no `main`: reestruturação da UX (specs 010 a
  017), tolerância ajustável (018), edição com lápis (019), cotações
  diárias com atualização ao abrir (020), virada de mês automática (021),
  página única de cotações em Posições, sem "Revisão de dados" e
  "Atualização" (022), linha do tempo compacta (023), ajustes da Visão Geral
  (024), listas de seleção estilizadas (025), inclusão de posição com
  instituição, conta, ativo e vencimento novos (026) e ajustes da
  configuração de metas (027);
- **não concluída: [spec 016](.ai/specs/016-position-history.md), página da
  posição.** Foi interrompida a pedido do usuário. O trabalho parcial, sem
  lint, build, testes nem revisão, está no branch
  `wip/016-pagina-da-posicao`; retomar de lá, concluir a spec e verificar
  antes de integrar ao `main`;
- várias specs têm uma seção "Questões em aberto" com escolhas feitas pelos
  agentes que aguardam o usuário; as perguntas mais relevantes estão nas
  specs 020, 021, 022, 024 e 026;
- Previdência continua fora até o usuário decidir o próximo passo; ele
  indicou que é o assunto seguinte a esses ajustes.

O propósito, as restrições, as regras de cálculo e as decisões da
iniciativa estão em `.ai/context/ux-restructure.md`, e o estado de cada
fatia fica em `.ai/specs/README.md`.

Ao atualizar um ambiente local: `pnpm install`, `pnpm db:migrate`,
`pnpm db:generate` (o `migrate dev` do Prisma 7 não regenera o cliente) e
reiniciar o `pnpm dev`. Ao abrir, o app cria as competências que faltam e
atualiza as cotações se a última atualização tiver mais de uma hora.

Testes de interface rodam sobre os dados reais e não podem gravar: todo
arquivo em `tests/e2e/` substitui a checagem de abertura com
`stubQuoteChecks` (`tests/e2e/support/quote-checks.ts`) e entra em edição
com `enterEditMode` (`tests/e2e/support/edit-mode.ts`). Os provedores de
cotação não são alcançáveis em ambientes de nuvem; nesses casos, verifique
com respostas simuladas e registre na spec.

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
