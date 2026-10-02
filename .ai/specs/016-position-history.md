# 016 — Histórico de uma posição e de um ativo

Estado: concluída em 2026-10-02.
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

## Decisões

Respostas do usuário em 2026-10-02, registradas em
[Reestruturação da UX](../context/ux-restructure.md):

- a página é uma rota própria, `/posicoes/[conta]/[ativo]`, e o seletor
  global de mês continua valendo nela;
- não haverá livro de movimentações por enquanto; ele fica no backlog, junto
  da previdência. A separação entre preço e aportes é uma **estimativa** pelas
  competências e a página diz isso: o efeito de preço é a quantidade do mês
  anterior vezes a variação da cotação, e aportes e resgates são o restante;
- o vencimento é editável na página, pelo lápis, e só nos ativos sem cotação
  de mercado. Nada é inferido dos nomes dos ativos importados;
- o gráfico de cotação do ativo mostra um ponto por mês, a cotação de
  fechamento: a da competência e, nos meses sem ela, a diária mais recente do
  mês. No mês corrente, o ponto é a última cotação (decisão de fechamento
  mensal da [spec 028](028-quote-rules.md)).

## O que foi entregue

- clicar no nome do ativo, ou em qualquer ponto da linha fora do modo de
  edição, abre a página; a volta mantém mês, filtros, ordem e agrupamento;
- cabeçalho com ativo, ticker ou "SALDO", conta, classes, estratégia e
  vencimento;
- recorte "Nesta conta" ou "Todas as contas" quando o ativo esteve em outras
  contas, com links para elas;
- indicadores: valor, variação no mês, valorização desde a entrada (pela
  cotação nos ativos cotados, pelo saldo nos demais) e participação na
  carteira;
- gráfico da evolução da posição com valor aplicado estimado, lacunas de
  meses sem competência e clique para trocar de mês;
- "De onde veio a variação": entrada, ganho de preço, aportes e resgates e
  valor final, desde a entrada ou no mês;
- destaques: preço médio estimado, melhor e pior mês, presença e vencimento
  editável;
- gráfico da cotação de fechamento mensal, em reais ou dólares, com o preço
  médio estimado; nos saldos sem cotação, a variação mensal do saldo;
- rateio da posição no mês e tabela mês a mês com as lacunas e as saídas e
  voltas entre contas.

## Verificação

- `pnpm check`, `pnpm build` e `tests/e2e/position-history.spec.ts` no
  desktop e no celular;
- edição do vencimento conferida no navegador numa LCI: salvar mostrou
  "vencido" e remover devolveu o ativo ao estado original, chave incluída.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Posições: filtros e consulta](013-positions-filters.md)
- [Diagnóstico do Excel](../context/excel-analysis.md)
