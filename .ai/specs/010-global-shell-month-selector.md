# 010 — Navegação no topo e seletor global de mês

Estado: concluída em 2026-10-01
Definida em: 2026-10-01

## Problema

A interface atual tem uma barra lateral, uma competência fixa (sempre a mais
recente) e telas que não conversam entre si. O usuário comparou com o Excel e
registrou que a UX ficou aquém: na planilha ele seleciona um mês por
segmentação e toda a análise responde na hora.

## Objetivo

Substituir a navegação lateral por abas no topo e introduzir um seletor
global de mês que governa todas as telas, com o mês escolhido preservado na
URL.

## Decisões do usuário registradas

- a barra lateral é removida; a navegação principal fica no topo;
- as abas principais são Visão Geral, Alocação e Posições, com um ícone de
  configuração separado;
- o mês selecionado vale para todas as telas e fica na URL como `?mes=AAAA-MM`;
- o app é a fonte da verdade após a importação; não haverá sincronização
  contínua com o Excel;
- Previdência não entra em nenhuma fatia desta reestruturação.

## Escopo

- novo shell com marca, abas no topo e acesso à configuração;
- seletor de mês em linha do tempo horizontal, agrupado por ano, cobrindo
  todas as competências com dados;
- mês selecionado na URL; ausência do parâmetro usa a competência mais
  recente;
- navegação por `◀`/`▶`, pelas setas do teclado e por um atalho para a
  competência mais recente;
- indicador por mês da variação do patrimônio em relação ao mês anterior;
- transição entre abas e ao trocar de mês, respeitando `prefers-reduced-motion`;
- gesto lateral no mobile para alternar entre as abas;
- as telas existentes passam a ler a competência do seletor em vez de assumir
  a mais recente.

## Fora do escopo

- conteúdo novo das abas Visão Geral, Alocação e Posições (fatias seguintes);
- página de configuração das metas (fatia posterior);
- Previdência.

## Rotas

As abas apontam para `/` (Visão Geral), `/alocacao` e `/posicoes`. A
configuração fica em `/configuracao`. As telas de revisão da importação e de
atualização mensal continuam existindo fora das abas principais, acessíveis
por link, porque seguem sendo necessárias e não foram descontinuadas pelo
usuário. Ambas foram removidas em 2026-10-02 pela
[spec 022](022-quotes-page.md).

## Critérios de aceite

- nenhuma tela apresenta barra lateral;
- trocar o mês atualiza a tela e o parâmetro `mes` da URL;
- recarregar uma URL com `?mes=AAAA-MM` reabre a mesma competência;
- um mês inexistente na base cai para a competência mais recente, sem erro;
- as setas do teclado percorrem os meses disponíveis;
- lint, tipos, build e testes de interface passam.

## Verificação

As 31 competências aparecem na linha do tempo agrupadas por ano, com a barra
de variação verde ou vermelha conforme o mês anterior. A competência
selecionada é rolada para o centro ao abrir a tela.

Trocar o mês atualiza o servidor: Fevereiro de 2026 apresentou
R$ 187.954,69 e Junho de 2026 apresentou R$ 197.861,67, iguais aos valores do
gráfico "Evolução de Patrimônio" da planilha. As setas do teclado percorrem
os meses e a troca de aba preserva o parâmetro `mes`. `?mes=1999-01` cai para
a competência mais recente.

As telas de revisão da importação e de atualização mensal perderam o acesso
pela barra lateral e passaram a ser alcançadas pela página de configuração,
que também lista as metas vigentes. As rotas `/posicoes` e `/configuracao`
nascem somente leitura nesta fatia e ganham edição nas fatias 4 e 5.

Três cenários cobertos no Playwright, em desktop e mobile: a carteira
normalizada, o seletor global governando as três abas e o mês inexistente.
`pnpm check`, `pnpm build` e `pnpm test:e2e` passaram.

## Dependências adicionadas

`nuqs` (estado do mês na URL), `motion` (indicador das abas e transições),
`date-fns`, `react-hotkeys-hook` (setas do teclado) e `@number-flow/react`,
conforme a lista sugerida pelo usuário.

## Referências

- [Tela de alocação](008-allocation-view.md)
- [Arquitetura](../../docs/architecture.md)
- [Diagnóstico do Excel](../context/excel-analysis.md)
