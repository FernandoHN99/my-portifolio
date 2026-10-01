import { z } from "zod";

import type { QuoteResult } from "@/modules/quotes/domain/quote-types";
import { quoteFailure } from "@/modules/quotes/domain/quote-types";
import { describeProviderError, fetchJson } from "@/modules/quotes/infrastructure/http";

const alphaVantageSchema = z.object({
  "Global Quote": z.object({ "05. price": z.coerce.number().positive() }),
});

export async function fetchAlphaVantageQuotes(
  symbols: string[],
  apiKey?: string,
): Promise<QuoteResult[]> {
  if (!apiKey) {
    return symbols.map((symbol) =>
      quoteFailure(
        symbol,
        "alpha-vantage",
        "MISSING_API_KEY",
        "Configure ALPHA_VANTAGE_API_KEY para atualizar este ativo.",
      ),
    );
  }

  const results: QuoteResult[] = [];

  for (const symbol of symbols) {
    try {
      const url = new URL("https://www.alphavantage.co/query");
      url.searchParams.set("function", "GLOBAL_QUOTE");
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("apikey", apiKey);
      const payload = alphaVantageSchema.parse(await fetchJson(url));
      results.push({
        symbol,
        provider: "alpha-vantage",
        status: "SUCCESS",
        valueBrl: payload["Global Quote"]["05. price"],
      });
    } catch (error) {
      const described = describeProviderError(error);
      results.push(
        quoteFailure(symbol, "alpha-vantage", described.code, described.message),
      );
    }
  }

  return results;
}
