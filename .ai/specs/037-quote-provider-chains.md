# 037 — Provedores de cotação em cadeia, com Yahoo, Binance e PTAX

Estado: concluída em 2026-10-02.
Definida em: 2026-10-02

## Problema

Pedido do usuário em 2026-10-02 (terceira rodada): pesquisar APIs públicas, ou
privadas com chave gratuita, com limites maiores, que cubram os ETFs
nacionais e o histórico de meses anteriores, e usá-las com prioridade. A
atualização falhava no GPCA11.SAO porque o Alpha Vantage gratuito permite 25
consultas por dia.

## Pesquisa

Conferida em 2026-10-02, com chamadas reais feitas desta máquina:

| Fonte | Chave | Cobertura | Histórico | Limite |
|---|---|---|---|---|
| Yahoo Finance (endpoint de gráfico) | não | B3 (.SA), EUA, câmbio | diário de anos numa chamada | não publicado; pode responder 429 |
| Binance (API pública) | não | cripto, pares em BRL e USDT | mensal completo numa chamada | largo (peso por minuto) |
| PTAX do Banco Central (Olinda) | não | dólar e outras moedas | período inteiro numa chamada | oficial, sem limite publicado |
| brapi.dev | gratuita | B3 | 3 meses no plano gratuito | 15 mil por mês, 1 ticker por chamada |
| Finnhub | gratuita | EUA (preço atual) | não no gratuito (HTTP 403) | 60 por minuto |
| Alpha Vantage | gratuita | EUA e B3 | mensal completo | 25 por dia |
| CoinGecko demo | gratuita | cripto | 365 dias | ~30 por minuto |
| Twelve Data | gratuita | EUA, câmbio e cripto; B3 só nos planos pagos | — | 800 por dia |

Fontes: [limites da brapi](https://brapi.dev/faq/quais-as-limitacoes),
[PTAX na API Olinda](https://dadosabertos.bcb.gov.br/dataset/dolar-americano-usd-todos-os-boletins-diarios),
[planos da Twelve Data](https://twelvedata.com/pricing.md) e
[situação do Yahoo Finance em 2026](https://usahousinginformation.com/yahoo-finance-too-many-requests/).

## Comportamento

Cotações de hoje (`fetchCurrentQuotes`): cada grupo tenta o primeiro provedor
e passa ao seguinte só os símbolos que falharam. A falha final lista o motivo
de cada provedor tentado, e o provedor gravado é o que respondeu.

| Grupo | Cadeia |
|---|---|
| Dólar | AwesomeAPI → PTAX → Yahoo (BRL=X) |
| Cripto | CoinGecko → Binance (par em BRL; senão USDT × dólar) |
| EUA | Finnhub (com chave) → Yahoo → Alpha Vantage |
| B3 | Yahoo → brapi (com `BRAPI_TOKEN`) → Alpha Vantage |

Histórico de 3 anos ao incluir um ativo ([spec 029](029-asset-price-history.md)):

| Grupo | Cadeia |
|---|---|
| EUA e B3 | Yahoo, fechamento diário de 3 anos → Alpha Vantage mensal |
| Cripto | Binance, velas mensais → CoinGecko, 365 dias |
| Dólar dos meses sem competência | PTAX do período → AwesomeAPI |

Conferência do ticker na inclusão: na B3, Yahoo e depois Alpha Vantage; nos
EUA, Finnhub e depois Yahoo. O tipo "ETF da B3" e "Ação da B3" mostram
"Yahoo Finance · BRL". O símbolo guardado continua com `.SAO` e vira `.SA` no
Yahoo.

`BRAPI_TOKEN` entrou no `.env.example` como opcional.

## Decisões tomadas

- o Yahoo não é oficial: fica como principal só na B3, onde não há
  alternativa gratuita equivalente, e sempre com reservas atrás;
- o Alpha Vantage fica por último em todas as cadeias, para a cota de 25 por
  dia sobrar para quando os outros falharem;
- euro e outras moedas: a PTAX e a AwesomeAPI cobrem o EUR, mas cadastrar
  ativos em euro depende de um tipo de ativo ainda inexistente
  ([spec 036](036-altcoins-currency.md)).

## Verificação

- chamada real das cadeias, só leitura: USD na AwesomeAPI, BTC e SOL na
  CoinGecko, VOO no Finnhub e GPCA11.SAO no Yahoo (R$ 26,41). Com CoinGecko e
  AwesomeAPI bloqueadas e sem as chaves do Finnhub e do Alpha Vantage: BTC e SOL
  na Binance, USD na PTAX (5,2238) e VOO no Yahoo;
- histórico real, só leitura: VOO com 36 fechamentos mensais pelo Yahoo, SOL
  em reais com 36 meses pela Binance, PTAX com 754 dias em 36 meses;
- roteiro descartável da spec 026 com o Yahoo simulado fora do ar: 62 de 62
  conferências;
- `pnpm check`, `pnpm build` e a suíte do Playwright.

## Referências

- [Regras de cotação](028-quote-rules.md)
- [Histórico de 3 anos ao incluir um ativo](029-asset-price-history.md)
