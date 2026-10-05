# 046 — Histórico de execuções do mês e ilha do topo

Estado: concluída em 2026-10-03.
A ilha escura do topo foi substituída pela trilha abaixo das abas e pela aba
Configuração na [spec 073](073-position-page-applied-value-and-nav-trail.md).
Definida em: 2026-10-03

## Problema

Pedidos do usuário em 2026-10-03:

- "Ao exibir o Histórico de execuções, exiba o histórico daquele mês
  somente";
- "Ao clicar em uma cotação poderíamos ter uma indicação no swipe de cima que
  estamos dentro de uma posição… dynamic island… me surpreenda! o mesmo vale
  para as configs!"

## Comportamento

### Histórico de execuções

A página de cotações mostra só as execuções da competência selecionada
(`getRunHistory(referenceDate)`, em
`src/modules/quotes/application/get-run-history.ts`), com o título "N
execuções em <mês>". A action `quote-history.ts` e o componente
`refresh-run-history.tsx` recebem o mês; `RUN_HISTORY_MONTHS` saiu.

### Ilha do topo (`src/components/product/main-tabs.tsx`)

Uma cápsula escura que nasce ao lado das abas com uma mola, como a ilha
dinâmica do iPhone, e troca o rótulo deslizando quando o lugar muda:

- numa posição: ícone de gráfico e o nome do ativo, depois de uma seta, com
  a aba Posições ativa;
- nas cotações: ícone de moedas e "Cotações · <mês>";
- na configuração: ícone de engrenagem e "Configuração", sem aba ativa;
- um ponto pulsa na cor primária (`.island-pulse`, em `globals.css`), parado
  com movimento reduzido.

O `AppShell` recebe `context` (`NavContext`) de cada página. Para leitores de
tela, a ilha diz "Você está em <lugar>".

Em telas estreitas, abaixo de 420 px ficam só o ponto e o ícone, e a marca do
topo sai para a ilha caber; abaixo de 360 px a ilha também sai, e o título da
página diz onde se está, sem cortar as abas.

## Testes

- `tests/e2e/nav-island.spec.ts`: ilha na posição, nas cotações e na
  configuração; sem cortar as abas em 320, 360 e 390 px;
- `tests/e2e/quotes-page.spec.ts`: "execuções em Set/26".

## Referências

- [Página de cotações](022-quotes-page.md)
- [Regras de cotação](028-quote-rules.md)
