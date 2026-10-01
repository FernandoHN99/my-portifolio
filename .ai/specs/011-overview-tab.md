# 011 — Visão Geral

Estado: planejada
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

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Navegação no topo e seletor global de mês](010-global-shell-month-selector.md)
