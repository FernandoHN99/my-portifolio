import { z } from "zod";

import type { QuoteResult } from "@/modules/quotes/domain/quote-types";
import { quoteFailure } from "@/modules/quotes/domain/quote-types";
import { describeProviderError, fetchJson } from "@/modules/quotes/infrastructure/http";

const COIN_IDS: Record<string, string> = {
  BTC: "bitcoin",
  SOL: "solana",
};

const coinGeckoSchema = z.record(
  z.string(),
  z.object({ brl: z.number().positive() }),
);

export async function fetchCryptoQuotes(
  symbols: string[],
  apiKey?: string,
): Promise<QuoteResult[]> {
  const mapped = symbols.map((symbol) => ({ symbol, id: COIN_IDS[symbol] }));
  const results: QuoteResult[] = mapped
    .filter((item) => !item.id)
    .map((item) =>
      quoteFailure(
        item.symbol,
        "coingecko",
        "UNMAPPED_SYMBOL",
        `O ativo ${item.symbol} não possui um identificador CoinGecko configurado.`,
      ),
    );
  const supported = mapped.filter((item): item is { symbol: string; id: string } => Boolean(item.id));

  if (supported.length === 0) {
    return results;
  }

  try {
    const url = new URL("https://api.coingecko.com/api/v3/simple/price");
    url.searchParams.set("ids", supported.map((item) => item.id).join(","));
    url.searchParams.set("vs_currencies", "brl");
    const headers = apiKey ? { "x-cg-demo-api-key": apiKey } : undefined;
    const payload = coinGeckoSchema.parse(await fetchJson(url, { headers }));

    for (const item of supported) {
      const quote = payload[item.id];
      results.push(
        quote
          ? {
              symbol: item.symbol,
              provider: "coingecko",
              status: "SUCCESS",
              valueBrl: quote.brl,
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
