# 016 — Histórico de uma posição e de um ativo

Estado: em andamento, interrompida em 2026-10-02 a pedido do usuário. O
trabalho parcial (domínio, consulta, rota e componentes da página), sem lint,
build, testes nem revisão, está no branch `wip/016-pagina-da-posicao`.
Definida em: 2026-10-01

Ideia registrada pelo usuário durante a reestruturação da UX. Em 2026-10-02
o usuário pediu a página: clicar numa posição abre a evolução do patrimônio
dela, o gráfico do ativo e indicadores de valorização e valor ganho ("me
surpreenda nessa página"). O histórico do ativo deve vir das cotações
diárias da [spec 020](020-daily-quotes.md), e das mensais antes delas. O
pedido completo está em [Reestruturação da UX](../context/ux-restructure.md),
em "Ajustes pedidos em 2026-10-02, antes da previdência".

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
  que a planilha não registra compras e vendas separadamente;
- mostrar o vencimento do ativo, quando houver, com o mesmo aviso de vencido
  ou vencendo da tabela, conforme decisão do usuário registrada na
  [spec 026](026-new-position-entities.md), que guarda o vencimento em
  `assets.maturity_date` e deixou para cá a edição dele.

## Questões em aberto

- a ausência de um livro de movimentações limita a atribuição entre aporte e
  variação de preço; é preciso decidir o que é possível afirmar com os dados
  existentes antes de desenhar a tela;
- se a tela é uma rota própria ou um painel lateral.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Posições: filtros e consulta](013-positions-filters.md)
- [Diagnóstico do Excel](../context/excel-analysis.md)
