# 029 — Histórico de 3 anos ao incluir um ativo

Estado: concluída em 2026-10-02.
Definida em: 2026-10-02

## Problema

Pedido do usuário em 2026-10-02, registrado em
[Reestruturação da UX](../context/ux-restructure.md): ao incluir um ativo no
mês corrente, buscar a cotação de fechamento mensal dos últimos 3 anos, ou o
que existir se o ativo for mais novo, "se gastarmos uma única chamada à API,
ou se a API tem limites grandes que permitam tal atualização". O agente
avalia e informa.

## Avaliação dos provedores

Conferida em 2026-10-02 com as chaves do `.env`, uma chamada por provedor:

| Provedor | Histórico | Chamadas por ativo | Limite |
|---|---|---|---|
| Finnhub (`/stock/candle`) | indisponível no plano gratuito: HTTP 403 | — | — |
| Alpha Vantage (`TIME_SERIES_MONTHLY`) | todo o histórico mensal, fechamento no último pregão do mês, EUA e B3 | 1 | 25 consultas por dia no plano gratuito |
| CoinGecko (`market_chart`) | só os últimos 365 dias no plano gratuito; 1095 dias responde HTTP 401 | 1 | ~30 por minuto |
| AwesomeAPI (`json/daily/USD-BRL`) | 360 dias úteis por consulta | até 3 para 36 meses, só uma vez | sem chave, generoso |

Conclusão:

- ações e ETFs, dos EUA ou da B3: 36 meses numa única chamada ao Alpha
  Vantage, mesmo os cotados no dia a dia pelo Finnhub;
- cripto: 12 meses numa única chamada; 3 anos exigiriam o plano pago;
- o fechamento em dólar vira reais pelo dólar do mesmo mês. O dólar já existe
  nas competências; os meses que faltam (lacunas do histórico) são buscados na
  AwesomeAPI uma única vez e guardados, e os ativos seguintes os reaproveitam.

## Comportamento

- ao salvar uma inclusão de posição com ativo novo com ticker, o servidor
  agenda, com `after()` do Next, a busca do histórico, sem atrasar a resposta;
- `backfillNewAssetHistories`
  (`src/modules/quotes/application/backfill-asset-history.ts`) procura os
  símbolos da competência do mês corrente sem nenhuma cotação anterior ao mês,
  mensal ou diária, e busca o fechamento dos 36 meses anteriores ao mês
  corrente;
- cada fechamento vira uma linha do histórico diário (`daily_quotes`) no dia
  do último pregão do mês, com o provedor e sem execução. Nada é apagado nem
  sobrescrito, e as competências passadas não mudam;
- o gráfico de cotação da página da posição
  ([spec 016](016-position-history.md)) usa esses fechamentos nos meses sem
  competência própria;
- falhas, como o limite diário do Alpha Vantage, ficam no log do servidor. O
  ativo continua incluído, e a busca é tentada de novo na próxima inclusão de
  ativo novo, porque o símbolo continua sem histórico.

## Decisões tomadas

- a busca só considera o mês corrente, como pedido, e só ativos sem nenhum
  histórico: é idempotente e não consulta de novo um ativo já coberto;
- os fechamentos ficam no histórico diário, e não em `market_quotes`, porque
  `market_quotes` é a cotação da competência usada pelas posições; um mês sem
  a posição não ganha cotação de competência;
- saldos em dólar (ticker USD) e em reais não são buscados: o dólar já tem
  histórico nas competências.

## Verificação

- ensaio só de leitura dos três provedores: AAPL com 36 fechamentos, dólar de
  fevereiro a junho de 2025 com o último dia útil de cada mês, Solana com 12
  meses;
- a AwesomeAPI só traz `create_date` no primeiro registro; o dia vem do
  `timestamp`, no fuso de São Paulo;
- execução real em 2026-10-02 sobre a AAPL, incluída pelo usuário no mesmo dia
  e ainda sem histórico: 36 fechamentos de Out/23 a Set/26 e 7 meses de dólar
  guardados (Nov/23, Jul/24 e Fev a Jun/25, as lacunas da janela). A página da
  posição mostra 37 pontos; Set/26 confere: US$ 333,02 × R$ 5,1084 =
  R$ 1.701,20;
- `pnpm check` e `pnpm build`.

## Referências

- [Regras de cotação](028-quote-rules.md)
- [Inclusão de posição](026-new-position-entities.md)
- [Passo pré-produção](../context/pre-deploy.md)
