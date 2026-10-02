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
 * Identificador CoinGecko de um ticker. Os já usados na carteira têm o
 * identificador fixo; os demais vêm da busca da CoinGecko: entre as moedas com
 * exatamente esse símbolo, a de maior capitalização. O nome encontrado aparece
 * na checagem de um ativo novo para o usuário conferir a moeda, e a moeda
 * conferida fica guardada no ativo ao salvar (`assets.quote_provider_id`, spec
 * 026); a busca só volta a decidir para um símbolo sem moeda guardada.
 */
export async function resolveCoinGeckoCoin(symbol: string, apiKey?: string): Promise<CoinGeckoCoin | null> {
  const known = KNOWN_COINS[symbol];

  if (known) {
    return known;
  }

  const url = new URL("https://api.coingecko.com/api/v3/search");
  url.searchParams.set("query", symbol);
  const payload = coinGeckoSearchSchema.parse(await fetchJson(url, { headers: headersFor(apiKey) }));
  const [best] = payload.coins
    .filter((coin) => coin.symbol.toUpperCase() === symbol)
    .sort((left, right) => (left.market_cap_rank ?? Infinity) - (right.market_cap_rank ?? Infinity));

  return best ? { id: best.id, name: best.name } : null;
}

export async function fetchCoinGeckoPrices(ids: string[], apiKey?: string) {
  const url = new URL("https://api.coingecko.com/api/v3/simple/price");
  url.searchParams.set("ids", ids.join(","));
  url.searchParams.set("vs_currencies", "brl");
  const payload = coinGeckoSchema.parse(await fetchJson(url, { headers: headersFor(apiKey) }));

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
