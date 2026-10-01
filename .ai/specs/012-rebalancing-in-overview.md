# 012 — Rebalanceamento na Visão Geral

Estado: concluída em 2026-10-01
Definida em: 2026-10-01

Substitui a spec anterior que previa uma aba de alocação com sub-abas. O
usuário decidiu que a aba de alocação deve deixar de existir e que toda a
análise fica concentrada na Visão Geral.

## Problema

A análise de alocação vive em uma aba separada, com seis blocos de leitura
uniforme. O usuário quer o que a tabela dinâmica da planilha entrega: um
recorte escolhido por segmentação, gráficos fáceis de ler e uma tabela que
diz o que comprar e o que vender, tudo no mesmo lugar em que ele já olha o
patrimônio.

Além disso, o valor da diferença calculado até aqui não corresponde ao da
planilha. A spec 009 aplicava a diferença percentual sobre o total atual da
categoria, enquanto a planilha compara o valor atual com um valor ideal que
encadeia pelo ideal da classe-mãe.

## Objetivo

Levar o rebalanceamento para a Visão Geral, com os mesmos recortes da tabela
dinâmica, corrigir o cálculo do valor ideal e da diferença, acrescentar o
gráfico de renda fixa por duração e remover a aba de alocação.

## Escopo

- segmentação em dois níveis na Visão Geral, reproduzindo a planilha:
  classificação entre geral, caixa, renda fixa e renda variável, e
  subclassificação dependente da escolha anterior;
- tabela com percentual atual, percentual ideal, valor atual, valor ideal e
  diferença, agrupada sob COMPRAR e VENDER;
- diferença apresentada também como barra divergente, para a esquerda ao
  comprar e para a direita ao vender;
- ordenação padrão pela maior diferença absoluta;
- faixa de tolerância que marca o item como equilibrado; o mesmo valor
  alimenta o indicador de itens fora da meta da spec 011;
- gráfico de renda fixa por duração, atual contra ideal;
- o recorte selecionado fica na URL, junto da competência;
- a rota de alocação e seus componentes deixam de existir, e a navegação
  passa a ter Visão Geral e Posições.

## Cálculo corrigido

Conforme registrado em [Reestruturação da UX](../context/ux-restructure.md):

- valor ideal de uma categoria geral é o percentual ideal aplicado ao
  patrimônio total;
- valor ideal de uma subcategoria é o percentual ideal aplicado ao valor
  ideal da classe-mãe;
- diferença é o valor atual menos o valor ideal;
- positiva significa vender, negativa significa comprar, e dentro da faixa de
  tolerância significa equilibrado.

## Fora do escopo

- edição das metas, que pertence à spec 014;
- escolha de qual ativo negociar dentro de uma categoria;
- Previdência.

## Critérios de aceite

- os seis recortes da planilha estão disponíveis e respondem ao seletor
  global de mês;
- o valor ideal e a diferença reproduzem os números das capturas enviadas
  pelo usuário para setembro de 2026;
- itens dentro da faixa de tolerância não aparecem como comprar nem vender;
- a mesma categoria mantém a mesma cor em todos os gráficos;
- não existe mais rota nem navegação de alocação;
- lint, tipos, build e testes de interface passam.

## Verificação

O cálculo foi conferido contra as capturas da tabela dinâmica, em setembro de
2026. Os valores atuais coincidem linha a linha: cripto R$ 124.234,00, renda
fixa R$ 48.529,10, renda variável R$ 28.911,25 e reserva R$ 11.129,51. Os
valores ideais seguem a cadeia confirmada: renda fixa com 25% do patrimônio
resulta em R$ 63.049,23 e a diferença fica em menos R$ 14.520,13.

Há uma divergência esperada em caixa, de R$ 1.045,81: o aplicativo soma
R$ 39.393,06 e a captura mostra R$ 38.347,25. A diferença é exatamente
Flexible Account e Porquinho, que o cache da tabela dinâmica da planilha não
continha, achado já registrado no
[diagnóstico do Excel](../context/excel-analysis.md). O número do aplicativo
é o correto.

A faixa de tolerância de dois pontos percentuais coloca caixa e reserva como
equilibrados, enquanto a planilha, que não tem tolerância, os classificava
como vender e comprar.

A aba de alocação, sua rota e seu componente foram removidos, assim como a
consulta e o gráfico que só serviam a ela. Cinco cenários no Playwright, em
desktop e mobile. `pnpm check`, `pnpm build` e `pnpm test:e2e` passaram.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Visão Geral](011-overview-tab.md)
- [Rótulo e valor de rebalanceamento](009-rebalance-labels.md)
