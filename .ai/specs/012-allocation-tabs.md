# 012 — Aba de alocação com sub-abas

Estado: planejada
Definida em: 2026-10-01

## Problema

A aba de alocação apresenta as seis famílias de metas em blocos iguais, sem a
organização que o usuário usa na planilha, onde cada recorte tem seus
gráficos e sua tabela de ação.

## Objetivo

Reorganizar a aba nas quatro sub-abas da planilha, cada uma com gráficos de
atual contra ideal e uma tabela de rebalanceamento legível.

## Sub-abas

| Sub-aba | Itens da tabela | Gráficos |
|---|---|---|
| 1- Geral | 5 classes, 3 moedas e 4 estratégias, agrupadas por subtítulo | rosca de classe, de moeda e de estratégia; colunas de classe por moeda |
| 2- Caixa | caixa em reais e caixa em dólar | moeda do caixa, atual contra ideal |
| 2- Renda Fixa | seis combinações de subclasse e duração | colunas agrupadas por duração, atual contra ideal |
| 3- Renda Variável | ações EUA, ações ex-EUA, ações BR, commodities e imobiliário BR | rosca das subclasses; colunas por moeda |

## Tabela de rebalanceamento

Colunas de item, percentual atual, percentual ideal, valor atual, valor
ideal, diferença e ação.

- a diferença é o valor atual menos o valor ideal;
- a ação é vender quando a diferença é positiva e comprar nos demais casos;
- a diferença aparece como barra divergente, para a esquerda ao comprar e
  para a direita ao vender;
- a ordenação padrão é pela maior diferença absoluta;
- uma faixa de tolerância configurável marca o item como equilibrado em vez
  de comprar ou vender.

Os denominadores seguem a definição registrada na
[reestruturação da UX](../context/ux-restructure.md).

## Fora do escopo

- edição das metas, que pertence à spec 014;
- escolha de qual ativo negociar dentro de uma categoria;
- Previdência.

## Critérios de aceite

- as quatro sub-abas existem e respondem ao seletor global de mês;
- cada sub-aba usa o denominador correto da sua categoria;
- o valor ideal de uma subcategoria é o percentual ideal aplicado ao valor
  ideal da classe-mãe;
- a mesma categoria tem a mesma cor em todos os gráficos da aba;
- a sub-aba selecionada fica na URL;
- lint, tipos, build e testes de interface passam.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Tela de alocação](008-allocation-view.md)
- [Rótulo e valor de rebalanceamento](009-rebalance-labels.md)
