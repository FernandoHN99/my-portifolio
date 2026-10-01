import type {
  QuoteProviderConfiguration,
  QuoteRequest,
  QuoteResult,
} from "@/modules/quotes/domain/quote-types";
import { quoteFailure } from "@/modules/quotes/domain/quote-types";
import { fetchAlphaVantageQuotes } from "@/modules/quotes/infrastructure/alpha-vantage";
import { fetchUsdBrl } from "@/modules/quotes/infrastructure/awesome-api";
import { fetchCryptoQuotes } from "@/modules/quotes/infrastructure/coingecko";
import { fetchFinnhubQuotes } from "@/modules/quotes/infrastructure/finnhub";
import { describeProviderError } from "@/modules/quotes/infrastructure/http";

export async function fetchCurrentQuotes(
  requests: QuoteRequest[],
  configuration = getQuoteProviderConfiguration(),
): Promise<QuoteResult[]> {
  const uniqueRequests = [...new Map(requests.map((request) => [request.symbol, request])).values()];
  const results: QuoteResult[] = [];
  const crypto = uniqueRequests.filter((request) => request.instrumentType === "CRIPTO");
  const usdAssets = uniqueRequests.filter(
    (request) =>
      request.instrumentType !== "FIAT" &&
      request.instrumentType !== "CRIPTO" &&
      request.baseCurrency === "USD",
  );
  const remaining = uniqueRequests.filter(
    (request) =>
      request.instrumentType !== "FIAT" &&
      request.instrumentType !== "CRIPTO" &&
      request.baseCurrency !== "USD",
  );
  const needsUsd = uniqueRequests.some((request) => request.symbol === "USD") || usdAssets.length > 0;
  let usdBrl: number | null = null;
  let usdError: { code: string; message: string } | null = null;

  if (needsUsd) {
    try {
      usdBrl = await fetchUsdBrl(configuration.awesomeApiKey);
    } catch (error) {
      usdError = describeProviderError(error);
    }
  }

  for (const request of uniqueRequests.filter((item) => item.instrumentType === "FIAT")) {
    if (request.symbol === "BRL") {
      results.push({
        symbol: request.symbol,
        provider: "fixed",
        status: "SUCCESS",
        valueBrl: 1,
      });
      continue;
    }

    if (request.symbol === "USD" && usdBrl !== null) {
      results.push({
        symbol: request.symbol,
        provider: "awesome-api",
        status: "SUCCESS",
        valueBrl: usdBrl,
      });
      continue;
    }

    results.push(
      quoteFailure(
        request.symbol,
        "awesome-api",
        usdError?.code ?? "UNSUPPORTED_CURRENCY",
        usdError?.message ?? `A moeda ${request.symbol} ainda não possui integração.`,
      ),
    );
  }

  results.push(
    ...(await fetchCryptoQuotes(
      crypto.map((request) => request.symbol),
      configuration.coinGeckoApiKey,
    )),
  );

  if (usdAssets.length > 0) {
    results.push(
      ...(usdBrl === null
        ? usdAssets.map((request) =>
            quoteFailure(
              request.symbol,
              "finnhub",
              usdError?.code ?? "MISSING_USD_QUOTE",
              usdError?.message ?? "Não foi possível obter USD-BRL.",
            ),
          )
        : await fetchFinnhubQuotes(
            usdAssets.map((request) => request.symbol),
            usdBrl,
            configuration.finnhubApiKey,
          )),
    );
  }

  results.push(
    ...(await fetchAlphaVantageQuotes(
      remaining.map((request) => request.symbol),
      configuration.alphaVantageApiKey,
    )),
  );

  return results.sort((left, right) => left.symbol.localeCompare(right.symbol));
}

export function getQuoteProviderConfiguration(): QuoteProviderConfiguration {
  return {
    awesomeApiKey: process.env.AWESOME_API_KEY || undefined,
    coinGeckoApiKey: process.env.COINGECKO_API_KEY || undefined,
    finnhubApiKey: process.env.FINNHUB_API_KEY || undefined,
    alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY || undefined,
  };
}
