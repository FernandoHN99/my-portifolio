# 031 — Posições: vencimento, filtros em cascata e campos de 16 px

Estado: concluída em 2026-10-02.
Definida em: 2026-10-02

## Problema

Respostas do usuário em 2026-10-02, registradas em
[Reestruturação da UX](../context/ux-restructure.md):

- a duração da planilha (D+0, D+1, Curto, Médio, Longo) é o prazo de resgate
  para liquidez; o tempo até o vencimento é o campo opcional novo da
  [spec 026](026-new-position-entities.md). Pedido: "adicione isso na coluna
  de posições e coloque um filtro";
- "algo muito legal que podemos fazer é que a ordem de prioridade dos filtros
  já filtra as opções seguintes, assim se eu seleciono classe Caixa, na
  subclasse ele somente traz as subclasses que já existem para aquela classe
  [...] a ordem de prioridade é sempre do filtro que foi filtrado primeiro";
- campos com 16 px no celular, para o Safari do iPhone não ampliar a página
  ([spec 025](025-styled-pickers.md)).

## Comportamento

- **Coluna Vencimento**: na tela larga (a partir de 1.280 px), com a data e o
  selo de vencido, vencendo ou o mês; ordenável, com os ativos sem vencimento
  sempre no fim. Abaixo dessa largura, o selo continua embaixo do nome do
  ativo;
- **Filtro Vencimento**: por ano do vencimento ("2027") ou "Sem vencimento",
  no parâmetro `venc`;
- **Filtros em cascata**: as opções de cada filtro vêm só das posições que
  passam pelos filtros aplicados antes dele. A ordem é a dos parâmetros na URL:
  um filtro aplicado entra no fim, um filtro limpo sai, e reaplicado volta para
  o fim. Um filtro ainda vazio considera todos os aplicados. Os valores já
  escolhidos continuam na lista para poderem ser desmarcados, e a busca vale
  para todos. Classe e subclasse olham o rateio: com Caixa escolhida, a
  subclasse oferece Curto, Pós-fixado e Stablecoin; com Pós-fixado escolhida
  primeiro, a classe oferece Caixa e Renda Fixa;
- **16 px em telas de toque**: uma regra fora das camadas do Tailwind em
  `globals.css`, sob `(pointer: coarse)`, vale para todos os campos de texto,
  listas e áreas de texto do aplicativo.

## Decisões tomadas

- a ordem de aplicação fica na própria URL, sem um parâmetro extra, e
  sobrevive ao recarregar e ao voltar da página da posição;
- os atalhos de classe acima dos filtros seguem as opções da cascata;
- o filtro de vencimento agrupa por ano, porque as datas exatas seriam uma
  lista longa e pouco útil.

## Verificação

- `tests/e2e/positions-cascading-filters.spec.ts`: Caixa limita as
  subclasses, a ordem inversa limita as classes, a interface grava a ordem na
  URL (`inst=Inter&classe=Caixa`) e limita as classes ao Inter, a coluna e o
  filtro de vencimento existem e o campo de busca tem 16 px no celular e 12 px
  no computador;
- `pnpm check`, `pnpm build` e a suíte do Playwright.

## Referências

- [Posições: filtros e consulta](013-positions-filters.md)
- [Listas de seleção estilizadas](025-styled-pickers.md)
