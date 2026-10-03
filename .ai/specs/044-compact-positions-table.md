# 044 — Tabela de Posições enxuta, classes, expansão e filtros da esquerda para a direita

Estado: concluída em 2026-10-03.
Definida em: 2026-10-03

## Problema

Pedidos do usuário em 2026-10-03:

- "na coluna CLASSES deixe sempre aparecendo a classe e subclasse e concatene
  com o resgate"; "deixe uma seta de expansão em cada posição"; "coloque ...
  p deixar claro que existe infos ocultas";
- "não precisa exibir a coluna cotação na tabela e nem a moeda, mas pode
  deixar o filtro de moeda";
- "Pode tirar a liquidez na exibição do layout, mas deixe o filtro";
- "Deixe a prioridade dos filtros da esquerda p direita", no lugar da ordem
  em que foram aplicados ([spec 031](031-positions-cascading-filters.md)).

## Comportamento

### Colunas (`src/modules/portfolio/ui/positions-workspace.tsx`)

- saem Cotação, Moeda e Liquidez; os filtros de Moeda e Liquidez continuam;
- a coluna Classes mostra a primeira classificação como "Classe · Subclasse ·
  Resgate" (`allocationLabel`, em `position-filters.ts`) e, quando há outras,
  "…+N", que expande a linha;
- uma seta no começo de cada linha expande e recolhe ("Expandir <ativo>",
  "Recolher <ativo>"). A linha expandida mostra cotação, moeda base, liquidez,
  vencimento e o rateio completo, com os pesos;
- os botões da linha (seta, lápis, lixeira) não abrem a posição; o resto da
  linha continua abrindo ([spec 016](016-position-history.md)).

### Filtros (`src/modules/portfolio/presentation/position-filters.ts`)

`filterOptions` limita cada filtro só pelos que estão à esquerda dele, na
ordem da tela (`FILTER_DIMENSIONS`): Classe, Subclasse, Instituição,
Estratégia, Moeda, Vencimento e Liquidez. A classe nunca encolhe; escolher
uma instituição não muda as classes oferecidas, e escolher uma classe limita
as instituições. A ordem de aplicação deixou de importar.

## Testes

- `tests/e2e/home.spec.ts`: classe, subclasse e resgate na coluna, seta que
  expande a linha;
- `tests/e2e/positions-cascading-filters.spec.ts`: esquerda para a direita,
  com a subclasse aplicada antes da classe na URL; liquidez só no filtro;
- `tests/e2e/position-history.spec.ts`: os botões da linha não abrem a
  posição.

## Referências

- [Filtros em cascata](031-positions-cascading-filters.md)
- [Formulário único da posição](043-position-form.md)
