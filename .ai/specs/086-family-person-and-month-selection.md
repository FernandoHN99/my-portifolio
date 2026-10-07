# 086 — Pessoa única e seleção de meses em Gastos familiares

Estado: concluída e publicada em 2026-10-07 (deploy
`dpl_3sRsmdbo1ms9wEamMbKkUiEy1pRy`).
Origem: continuação do pedido da spec 085 e resposta do usuário sobre a pessoa
padrão: ordenar alfabeticamente e selecionar a primeira.

## Decisões e critérios de aceite

1. O quadro “Saldo por pessoa” deixa de existir. Os cards e a lista representam
   uma única pessoa; não há seleção múltipla de pessoas nem opção “Todas”.
2. As pessoas disponíveis aparecem em badges, em ordem alfabética, além do
   filtro Pessoa. Ao entrar sem pessoa válida, seleciona a primeira do período.
   Ao mudar as competências, preserva a pessoa atual se ela continuar disponível;
   caso contrário, seleciona a primeira da nova lista. Uma URL antiga com
   várias pessoas fica com a primeira delas que for válida no período.
3. Sem competência selecionada, usa o mês atual e registra essa seleção na URL.
   O mês atual está nas opções mesmo sem lançamentos: nesse caso, não há pessoa
   para selecionar, a lista fica vazia e os cards zeram, sem buscar mês antigo.
4. A seleção de mês começa única. O ícone “Selecionar vários meses” alterna o
   modo, como nas segmentações do Excel. No modo único, clicar troca o mês;
   no múltiplo, adiciona ou remove. Tirar o último mês volta ao atual. Ao sair
   do modo múltiplo, mantém o último mês selecionado. URLs já com vários meses
   são abertas em modo múltiplo. A preferência de modo fica em `multimes` na URL.
5. Badge selecionado usa fundo verde a 8% e borda discreta; meses e pessoas
   compartilham esse tratamento. Os mesmos modos valem para os dropdowns no
   computador e os chips na folha de filtros do celular.
6. Pessoas são limitadas pelas competências. Status e tipo dependem da pessoa
   escolhida e dos filtros anteriores. A busca não troca a pessoa: uma descrição
   sem correspondência zera os resultados, mantendo a pessoa e suas alternativas.
7. “Limpar filtros” volta ao mês atual, primeira pessoa, modo único, sem busca,
   status ou tipo. Seleções inválidas não ficam ocultas na URL. Os meses
   escolhidos pelo filtro completo também aparecem entre os badges.
8. Edição, acerto dos pendentes filtrados, Desfazer, séries e os dois backups
   independentes continuam funcionando. Nenhum modelo ou formato muda.

## Implementação

- `resolveFamilyWorkspaceFilters` coordena os valores padrão e a pessoa única
  em `domain/filters.ts`, reaproveitando as regras de dependência da spec 085.
- `family-ledger.tsx` remove o quadro de pessoas e mantém URL, badges,
  dropdowns, folha do celular, cards e lançamentos sincronizados.
- Os componentes compartilhados de filtros aceitam seleção única e tom
  discreto, mantendo a multisseleção e o estilo padrão de Investimentos.

## Verificação

- 22 testes unitários aprovados, incluindo mês atual vazio, pessoa padrão,
  preservação/troca de pessoa, busca sem resultado, múltiplos meses e retorno ao
  atual ao retirar o último mês.
- E2E sem gravações: 16 aprovados em Chrome, Android/Chrome e iPhone/WebKit;
  6 pulados (sem concessão e gravações, pois o servidor de teste tem a área).
  Conferem cards pela exportação, badges alfabéticos, pessoa única, seleção de
  meses, filtros em cascata, menus e ausência de overflow em 320–430 px.
- Troca de pessoa pelos dropdowns/folha passou nos três navegadores; acerto
  em lote, Desfazer e exclusão de séries passaram com gravações apenas no
  schema isolado: 5 aprovados, 2 pulados (gravações nos navegadores móveis).
- Regressão dos filtros compartilhados de Investimentos: 4 aprovados,
  3 pulados conforme o dispositivo; busca, seleção, limpeza e folha móveis
  mantiveram o comportamento anterior.
- `pnpm check` (ESLint e TypeScript) e `git diff --check` aprovados.
- Conferência visual em desktop e 375 px: badges discretos, pessoa selecionada,
  ícone de multisseleção e cards sem quadro intermediário de saldo por pessoa.
- Captura local: `artifacts/spec-086/gastos-familiares.png` (ignorada pelo Git).
- Nenhuma alteração nos dados reais, commit ou deploy.
