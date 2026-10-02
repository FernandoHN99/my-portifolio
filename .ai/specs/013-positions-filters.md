# 013 — Posições: filtros e consulta

Estado: concluída em 2026-10-01
Definida em: 2026-10-01

O usuário reforçou em 2026-10-01 que os filtros de seleção múltipla por
instituição, moeda e classe são o ponto mais importante da aba de posições,
porque servem tanto para consultar quanto para editar um recorte específico,
como a planilha já permitia.

A versão anterior desta spec juntava consulta e edição. Por ser grande demais
para uma fatia, a edição foi separada na
[spec 017](017-positions-editing.md), que parte dos filtros entregues aqui.

## Problema

A aba de posições mostra uma tabela estática. Para olhar só uma instituição,
uma moeda ou uma classe, o usuário precisa ler a tabela inteira, enquanto na
planilha ele usava o AutoFiltro.

## Objetivo

Transformar a aba em uma tabela de consulta com os recursos do AutoFiltro:
filtros de seleção múltipla, busca, ordenação, totais do conjunto filtrado e
agrupamento.

## Escopo

- colunas de nome, ticker, instituição, estratégia, classes, moeda,
  quantidade, cotação, total em reais, total em dólar e participação;
- filtros de seleção múltipla por classe, subclasse, instituição, estratégia
  e moeda, além de busca textual por nome, ticker e instituição;
- atalhos de filtro por classe no topo;
- ordenação por qualquer coluna;
- rodapé com os totais do conjunto filtrado;
- agrupamento opcional por instituição ou por classe, com subtotal por grupo;
- filtros, ordenação e agrupamento ficam na URL, junto da competência;
- colunas calculadas ficam visualmente distintas das digitadas, preparando a
  edição da spec 017.

## Regra de classe em posições rateadas

Uma posição pode ter várias classificações, como a previdência dividida entre
ações dos EUA, ações do Brasil e imobiliário. Filtrar por classe ou subclasse
mostra a posição sempre que alguma de suas classificações corresponder.

O total da linha continua sendo o total da posição. Quando houver filtro de
classe ou subclasse, o rodapé mostra também a parcela rateada que pertence às
classes selecionadas, para não atribuir a uma classe o valor inteiro de uma
posição dividida.

## Fora do escopo

- qualquer edição, que pertence à spec 017;
- virtualização da tabela, desnecessária para as cerca de vinte posições por
  competência;
- Previdência.

## Critérios de aceite

- os filtros combinam entre si e o rodapé soma apenas o conjunto filtrado;
- com filtro de classe, o rodapé mostra a parcela rateada nas classes
  selecionadas;
- recarregar a página preserva filtros, ordenação e agrupamento;
- trocar de competência preserva os filtros;
- lint, tipos, build e testes de interface passam.

## Decisões tomadas

- no agrupamento por classe, uma posição rateada aparece em cada classe a que
  pertence, com o valor da parcela daquela classe e a indicação do total da
  posição; assim o subtotal de cada grupo coincide com o total da classe na
  Visão Geral;
- com filtro de classe ativo, o agrupamento por classe mostra apenas os grupos
  selecionados, para não exibir as demais classes de uma posição rateada;
- nas posições com mais de um rateio, a etiqueta mostra subclasse, duração e
  peso, e a cor indica a classe; nas demais, mostra a classe;
- a ordenação usa o TanStack Table v9, que instala-se como `useTable` com
  recursos registrados explicitamente; filtros e agrupamento são funções
  puras em `position-filters.ts`, porque a classe é multivalorada e o
  agrupamento por classe precisa do valor rateado;
- os filtros usam o item de seleção do menu do Base UI, que não fecha ao
  marcar e oferece navegação por teclado.

## Verificação

Em setembro de 2026, filtrar renda variável e agrupar por classe produziu um
grupo de cinco posições com subtotal de R$ 28.911,25, o mesmo valor atual da
classe na Visão Geral e na captura da tabela dinâmica. A previdência entrou
com R$ 14.287,19, os 55% rateados em renda variável de R$ 25.976,71. O rodapé
mostrou o total filtrado de R$ 40.600,77 e a parcela de R$ 28.911,25.

A seleção múltipla de instituições, os atalhos por classe, a busca, a
ordenação e o agrupamento por instituição foram conferidos em desktop e
mobile, assim como a preservação dos filtros ao recarregar. Seis cenários no
Playwright, em desktop e mobile. `pnpm check`, `pnpm build` e
`pnpm test:e2e` passaram.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Posições: edição](017-positions-editing.md)
- [Classificações e metas de alocação](007-allocation-data.md)
