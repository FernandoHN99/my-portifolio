# 011 — Visão Geral

Estado: concluída em 2026-10-01
Definida em: 2026-10-01

## Problema

A visão geral atual mostra um patrimônio, uma evolução e duas quebras, mas
não responde às perguntas que o usuário faz ao abrir a planilha: quanto tenho
hoje, quanto mudou, quanto disso está fora da meta e como a composição se
compara ao cenário ideal.

## Objetivo

Reconstruir a aba de forma que o mês selecionado seja compreendido de
relance, com indicadores, evolução navegável e composição comparada à meta.

## Escopo

### Indicadores do mês selecionado

- patrimônio total em reais e o equivalente em dólar;
- variação contra o mês anterior, em reais e em percentual;
- variação em doze meses;
- cotação do dólar e do bitcoin no mês;
- quantidade de itens fora da meta, com acesso à aba de alocação.

Os números animam ao trocar de mês.

### Evolução do patrimônio

- série do patrimônio total por competência;
- seleção de intervalo por arrasto e atalhos de seis meses, doze meses, ano
  corrente e tudo;
- alternância entre empilhar por classe e por moeda;
- clicar em uma coluna seleciona aquela competência no seletor global;
- a competência selecionada aparece destacada.

### Composição

Comparação lado a lado de atual e ideal, em classe de ativos, moeda e
estratégia.

## Fora do escopo

- edição de qualquer dado;
- sub-abas de alocação e tabela de rebalanceamento, que pertencem à spec 012;
- Previdência.

## Critérios de aceite

- todos os blocos respondem ao seletor global de mês;
- a seleção de intervalo e os atalhos de período alteram apenas a evolução,
  sem trocar a competência selecionada;
- clicar em uma coluna da evolução troca a competência;
- a contagem de itens fora da meta coincide com as linhas de comprar ou
  vender da aba de alocação para o mesmo mês;
- a cor de cada categoria é a mesma em todos os gráficos;
- lint, tipos, build e testes de interface passam.

## Decisões tomadas

A contagem de itens fora da meta precisa de uma faixa de tolerância, caso
contrário quase toda linha aparece como fora. Foi adotada a faixa de dois
pontos percentuais, exibida na própria tela como "itens além de ±2%". A
tolerância configurável prevista na spec 012 deve passar a alimentar esse
indicador.

Os blocos de maiores posições e de distribuição por instituição saíram desta
aba, porque a aba de posições passa a cobrir esse recorte com filtros e
agrupamento. A consulta e os componentes que só os serviam foram removidos
em vez de mantidos sem uso.

## Verificação

Os indicadores conferiram com o gráfico de evolução da planilha em várias
competências: agosto de 2026 com R$ 223.307, maio de 2026 com R$ 219.506 e
fevereiro de 2026 com R$ 187.954,69. O equivalente em dólar, a variação
mensal, a variação em doze meses e as cotações do mês acompanham a
competência selecionada.

Dois defeitos foram corrigidos durante a verificação. As células de cor do
gráfico eram indexadas contra a série completa, enquanto a seleção de
intervalo renderiza apenas uma fatia, o que deslocava o destaque para a
coluna errada. E o clique na coluna não chegava a trocar a competência
porque dependia do índice ativo do gráfico; passou a usar o rótulo ativo.

Foram conferidos os três modos de empilhamento, os atalhos de período, a
seleção de intervalo, o clique na coluna e a consistência de cor entre o
gráfico de evolução e os seis donuts. Quatro cenários no Playwright, em
desktop e mobile. `pnpm check`, `pnpm build` e `pnpm test:e2e` passaram.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Navegação no topo e seletor global de mês](010-global-shell-month-selector.md)
