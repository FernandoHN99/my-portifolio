import { z } from "zod";

import type { QuoteResult } from "@/modules/quotes/domain/quote-types";
import { quoteFailure } from "@/modules/quotes/domain/quote-types";
import { describeProviderError, fetchJson } from "@/modules/quotes/infrastructure/http";

const finnhubQuoteSchema = z.object({ c: z.number().positive() });

export async function fetchFinnhubQuotes(
  symbols: string[],
  usdBrl: number,
  apiKey?: string,
): Promise<QuoteResult[]> {
  if (!apiKey) {
    return symbols.map((symbol) =>
      quoteFailure(
        symbol,
        "finnhub",
        "MISSING_API_KEY",
        "Configure FINNHUB_API_KEY para atualizar ativos cotados em USD.",
      ),
    );
  }

  const results: QuoteResult[] = [];

  for (const symbol of symbols) {
    try {
      const url = new URL("https://finnhub.io/api/v1/quote");
      url.searchParams.set("symbol", symbol);
      const payload = finnhubQuoteSchema.parse(
        await fetchJson(url, { headers: { "X-Finnhub-Token": apiKey } }),
      );
      results.push({
        symbol,
        provider: "finnhub",
        status: "SUCCESS",
        valueBrl: payload.c * usdBrl,
      });
    } catch (error) {
      const described = describeProviderError(error);
      results.push(quoteFailure(symbol, "finnhub", described.code, described.message));
    }
  }

  return results;
}
