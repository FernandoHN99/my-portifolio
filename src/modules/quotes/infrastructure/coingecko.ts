import { z } from "zod";

import type { QuoteResult } from "@/modules/quotes/domain/quote-types";
import { quoteFailure } from "@/modules/quotes/domain/quote-types";
import { describeProviderError, fetchJson } from "@/modules/quotes/infrastructure/http";

export type CoinGeckoCoin = { id: string; name: string };

const KNOWN_COINS: Record<string, CoinGeckoCoin> = {
  BTC: { id: "bitcoin", name: "Bitcoin" },
  SOL: { id: "solana", name: "Solana" },
};

const coinGeckoSchema = z.record(
  z.string(),
  z.object({ brl: z.number().positive() }),
);

const coinGeckoSearchSchema = z.object({
  coins: z.array(
    z.object({
      id: z.string(),
      symbol: z.string(),
      name: z.string(),
      market_cap_rank: z.number().nullable().optional(),
    }),
  ),
});

/**
 * Moedas da CoinGecko com exatamente o símbolo digitado, da maior para a menor
 * capitalização (spec 033). Quando há mais de uma, o usuário escolhe a moeda
 * na inclusão; a escolha fica guardada no ativo (`assets.quote_provider_id`).
 */
export async function searchCoinGeckoCoins(symbol: string, apiKey?: string): Promise<CoinGeckoCoin[]> {
  const url = new URL("https://api.coingecko.com/api/v3/search");
  url.searchParams.set("query", symbol);
  const payload = coinGeckoSearchSchema.parse(await fetchJson(url, { headers: headersFor(apiKey) }));

  return payload.coins
    .filter((coin) => coin.symbol.toUpperCase() === symbol)
    .sort((left, right) => (left.market_cap_rank ?? Infinity) - (right.market_cap_rank ?? Infinity))
    .map((coin) => ({ id: coin.id, name: coin.name }));
}

/**
 * Identificador CoinGecko de um ticker. Os já usados na carteira têm o
 * identificador fixo; os demais vêm da busca da CoinGecko: entre as moedas com
 * exatamente esse símbolo, a de maior capitalização. Na inclusão de um ativo
 * novo o usuário pode escolher outra (spec 033), e a moeda conferida fica
 * guardada no ativo; a busca só volta a decidir para um símbolo sem moeda
 * guardada.
 */
export async function resolveCoinGeckoCoin(symbol: string, apiKey?: string): Promise<CoinGeckoCoin | null> {
  const known = KNOWN_COINS[symbol];

  if (known) {
    return known;
  }

  return (await searchCoinGeckoCoins(symbol, apiKey))[0] ?? null;
}

/**
 * Preço do dia em reais. Das funções do Neon, na região dos EUA, a CoinGecko
 * às vezes não responde: duas tentativas de 6 s têm o mesmo pior caso de uma de
 * 12 s e recuperam a maior parte dessas falhas passageiras.
 */
export async function fetchCoinGeckoPrices(ids: string[], apiKey?: string) {
  const url = new URL("https://api.coingecko.com/api/v3/simple/price");
  url.searchParams.set("ids", ids.join(","));
  url.searchParams.set("vs_currencies", "brl");
  const payload = coinGeckoSchema.parse(
    await fetchJson(url, { headers: headersFor(apiKey) }, { timeoutMs: 6_000, attempts: 2 }),
  );

  return new Map(Object.entries(payload).map(([id, quote]) => [id, quote.brl]));
}

/**
 * Cotações de cripto em reais. `coinId` é a moeda guardada no ativo do símbolo;
 * sem ela, o identificador sai de `resolveCoinGeckoCoin`.
 */
export async function fetchCryptoQuotes(
  requests: { symbol: string; coinId?: string }[],
  apiKey?: string,
): Promise<QuoteResult[]> {
  const results: QuoteResult[] = [];
  const supported: { symbol: string; id: string }[] = [];

  for (const { symbol, coinId } of requests) {
    try {
      const coin = coinId ? { id: coinId } : await resolveCoinGeckoCoin(symbol, apiKey);

      if (coin) {
        supported.push({ symbol, id: coin.id });
      } else {
        results.push(
          quoteFailure(symbol, "coingecko", "NOT_FOUND", `A CoinGecko não encontrou o ticker ${symbol}.`),
        );
      }
    } catch (error) {
      const described = describeProviderError(error);
      results.push(quoteFailure(symbol, "coingecko", described.code, described.message));
    }
  }

  if (supported.length === 0) {
    return results;
  }

  try {
    const prices = await fetchCoinGeckoPrices(
      [...new Set(supported.map((item) => item.id))],
      apiKey,
    );

    for (const item of supported) {
      const price = prices.get(item.id);
      results.push(
        price
          ? {
              symbol: item.symbol,
              provider: "coingecko",
              status: "SUCCESS",
              valueBrl: price,
            }
          : quoteFailure(
              item.symbol,
              "coingecko",
              "MISSING_QUOTE",
              `A CoinGecko não retornou ${item.symbol}.`,
            ),
      );
    }
  } catch (error) {
    const described = describeProviderError(error);
    results.push(
      ...supported.map((item) =>
        quoteFailure(item.symbol, "coingecko", described.code, described.message),
      ),
    );
  }

  return results;
}

function headersFor(apiKey?: string) {
  return apiKey ? { "x-cg-demo-api-key": apiKey } : undefined;
}

const coinGeckoChartSchema = z.object({ prices: z.array(z.tuple([z.number(), z.number()])) });

/** Dias de histórico que o plano gratuito da CoinGecko permite consultar. */
export const COINGECKO_HISTORY_DAYS = 365;

/**
 * Preço diário em reais de uma moeda no último ano, numa única consulta (spec
 * 029). O plano gratuito recusa períodos maiores que 365 dias.
 */
export async function fetchCoinGeckoDailyHistory(coinId: string, apiKey?: string) {
  const url = new URL(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart`);
  url.searchParams.set("vs_currency", "brl");
  url.searchParams.set("days", String(COINGECKO_HISTORY_DAYS));
  url.searchParams.set("interval", "daily");
  const payload = coinGeckoChartSchema.parse(await fetchJson(url, { headers: headersFor(apiKey) }));

  return payload.prices
    .filter(([, price]) => price > 0)
    .map(([time, price]) => ({ day: new Date(time).toISOString().slice(0, 10), value: price }));
}
