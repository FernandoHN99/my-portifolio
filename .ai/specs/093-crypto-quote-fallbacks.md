# 093 — Reservas na cotação de cripto (CoinGecko, Coinbase, Yahoo e Binance)

Estado: implementada e testada localmente em 2026-10-08, **sem commit e sem
publicação**. O código só chega ao job quando a função `quotesync` for
republicada no Neon (`pnpm jobs:build` e `neon deploy`, como em
[docs/quote-sync-job.md](../../docs/quote-sync-job.md)), o que o usuário ainda
não autorizou.
Origem: o usuário perguntou, em 2026-10-08, o motivo do erro "Binance:
CoinGecko: O provedor excedeu o tempo limite. Binance: O provedor respondeu com
HTTP 451" na cotação de BTC e SOL.

## Diagnóstico (fatos observados)

- A função do Neon roda em `aws-us-east-1` (o Neon só tem Functions fora de
  `sa-east-1`). Dali:
  - a **Binance** recusa a região em todas as consultas (HTTP 451, bloqueio
    regional do endereço `api.binance.com`);
  - a **CoinGecko** às vezes não responde em 12 s, mesmo com a chave. Do
    computador do usuário ela responde em 40 a 200 ms.
- No banco de produção (`quote_refresh_results`), de 05/10 00:00 UTC a 08/10
  02:00 UTC: 17 execuções com BTC e SOL sem cotação (cerca de 1 em 4) e 34
  falhas da Binance, todas HTTP 451. Nas demais, a CoinGecko respondeu (120
  cotações). Na falha, a cotação do dia fica sem valor até a execução
  seguinte; nada é gravado errado.
- O histórico mensal de cripto já cai na CoinGecko quando a Binance falha
  (`symbol-history.ts`), então o 451 só atinge a cotação do dia.
- A chave da CoinGecko é a do plano demo (30 consultas por minuto) e não é o
  problema: o job usa uma consulta por execução.

## Decisões

1. **Duas tentativas na CoinGecko, de 6 s cada** (mesmo pior caso de uma de 12
   s). `fetchJson` ganhou `timeoutMs` e `attempts`; só falha passageira
   repete (tempo esgotado, rede e HTTP 5xx), nunca recusa do provedor (4xx,
   como 429 e 451).
2. **Cadeia de cripto: CoinGecko → Coinbase → Yahoo Finance → Binance.**
   - **Coinbase** (`api.coinbase.com/v2/prices/<SÍMBOLO>-BRL/spot`): sem chave,
     sem bloqueio regional, direto em reais; par inexistente é `NOT_FOUND`.
   - **Yahoo** (`<SÍMBOLO>-USD` × dólar do dia): já funciona nessa região, pois
     cota as ações do job.
   - **Binance** por último: ainda serve para as execuções locais. Com HTTP 451
     no endereço principal, tenta o espelho oficial de dados de mercado
     (`data-api.binance.vision`), que não tem a restrição.
3. **Mensagem do 451 explicada:** "O provedor bloqueia a região do servidor
   (HTTP 451)", com o código `REGION_BLOCKED`.
4. As reservas pesquisam pelo símbolo, como a Binance já fazia: um ticker raro
   com o mesmo símbolo de outra moeda poderia ser cotado pela moeda errada. Só
   entram quando a CoinGecko falha; BTC, SOL e ETH não sofrem disso.

## Verificação

- `tests/unit/crypto-quotes.test.ts` (rede simulada): recuperação na segunda
  tentativa sem usar reserva; queda para a Coinbase, para o Yahoo e para a
  Binance (com o 451 indo ao espelho), nessa ordem; mensagem final com o
  motivo de cada provedor; 4xx não repete e 5xx repete.
- Rede real, de São Paulo, em 2026-10-08: CoinGecko R$ 416.149, Coinbase
  R$ 416.363, Yahoo US$ 82.938 e Binance R$ 417.902 para o BTC; `ZZZZ` na
  Coinbase dá "não negocia"; a cadeia completa cotou BTC, SOL e ETH.
- **Não verificado:** o comportamento a partir de `aws-us-east-1` (ou de outra
  região dos EUA). Não há como consultar dali sem republicar a função; o
  espelho da Binance, em particular, só foi testado do Brasil.

## Para publicar (quando o usuário autorizar)

Republicar a função `quotesync` (passos em `docs/quote-sync-job.md`) e conferir
nas execuções seguintes se BTC e SOL vêm sem erro e de qual provedor
(`quote_refresh_results.provider`). O app na Vercel não precisa de deploy para
isso, mas leva a mesma cadeia no próximo.
