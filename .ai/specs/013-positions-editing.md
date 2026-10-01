# 013 — Posições com filtros e edição

Estado: planejada
Definida em: 2026-10-01

O usuário reforçou em 2026-10-01 que os filtros de seleção múltipla por
instituição, moeda e classe são o ponto mais importante desta fatia, porque
servem tanto para consultar quanto para editar um recorte específico, como a
planilha já permitia.

## Problema

A listagem de posições é somente leitura e a edição vive em uma rota
separada, restrita ao rascunho. O usuário quer editar qualquer competência
com a facilidade da planilha, e editar deve ser o comportamento natural da
aba, não um botão escondido.

## Objetivo

Transformar a aba de posições em uma tabela de trabalho, com filtros,
totais, edição direta e as operações que a planilha oferecia.

## Tabela

- colunas de nome, ticker, instituição, estratégia, classes, moeda,
  quantidade, cotação, total em reais, total em dólar e participação;
- filtros no cabeçalho com seleção múltipla por classe, subclasse,
  instituição, estratégia e moeda, além de busca textual;
- atalhos de filtro por classe no topo;
- ordenação por qualquer coluna;
- rodapé com os totais do conjunto filtrado;
- agrupamento opcional por instituição ou por classe;
- colunas calculadas permanecem somente leitura e visualmente distintas.

## Edição

- edição direta na célula, com navegação por teclado;
- a competência mais recente é editada sem cerimônia;
- competências passadas ficam travadas e exigem confirmação explícita, com
  aviso de que o histórico será alterado; as alterações ficam pendentes e
  destacadas até salvar ou descartar;
- inclusão e remoção de posição;
- ao salvar, um aviso permite desfazer;
- o rateio de uma posição é editado em painel lateral, com validação de soma
  igual a 100%;
- existe a operação de criar a competência a partir da anterior, clonando
  posições e rateios.

## Cotações do mês

Painel recolhível com as cotações da competência selecionada, editáveis, com
recálculo dos totais ao alterar.

## Fora do escopo

- metas e simulação, que pertencem à spec 014;
- Previdência.

## Critérios de aceite

- os filtros, a ordenação e os totais do rodapé consideram o conjunto
  filtrado;
- editar uma quantidade recalcula o total pela cotação persistida;
- editar um saldo manual atualiza quantidade e total na mesma transação;
- competências passadas só aceitam alteração após confirmação;
- nenhum conjunto inválido é salvo parcialmente;
- o rateio recusa soma diferente de 100%;
- clonar a competência anterior traz posições e rateios;
- lint, tipos, build e testes de interface passam.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Edição das posições do rascunho](006-draft-position-editing.md)
- [Classificações e metas de alocação](007-allocation-data.md)
