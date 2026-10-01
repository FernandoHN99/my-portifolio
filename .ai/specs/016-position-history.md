# 016 — Histórico de uma posição e de um ativo

Estado: planejada, sem prazo
Definida em: 2026-10-01

Ideia registrada pelo usuário durante a reestruturação da UX, para ser
executada depois das fatias já acordadas.

## Problema

A aba de posições mostra uma competência de cada vez. Para entender se uma
posição cresceu por aporte ou por preço, o usuário precisa comparar meses
manualmente.

## Objetivo

Permitir abrir, a partir de uma linha da aba de posições, a evolução daquela
posição ao longo do tempo e também a evolução do ativo correspondente.

## Escopo previsto

- clicar em uma linha da aba de posições abre uma tela dedicada;
- a tela mostra a evolução da posição, que é a combinação de conta e ativo,
  mês a mês;
- a tela mostra também a evolução do ativo em si, consolidando as posições do
  mesmo ativo em contas diferentes;
- distinguir visualmente a variação de quantidade da variação de preço, já
  que a planilha não registra compras e vendas separadamente.

## Questões em aberto

- a ausência de um livro de movimentações limita a atribuição entre aporte e
  variação de preço; é preciso decidir o que é possível afirmar com os dados
  existentes antes de desenhar a tela;
- se a tela é uma rota própria ou um painel lateral.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Posições com filtros e edição](013-positions-editing.md)
- [Diagnóstico do Excel](../context/excel-analysis.md)
