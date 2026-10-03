import type {
  QuoteProviderConfiguration,
  QuoteRequest,
  QuoteResult,
} from "@/modules/quotes/domain/quote-types";
import { quoteFailure } from "@/modules/quotes/domain/quote-types";
import { providerLabel } from "@/modules/quotes/domain/quote-refresh";
import { fetchAlphaVantageQuotes } from "@/modules/quotes/infrastructure/alpha-vantage";
import { fetchUsdBrl } from "@/modules/quotes/infrastructure/awesome-api";
import { fetchPtaxUsdLatest } from "@/modules/quotes/infrastructure/bcb";
import { fetchBinancePriceBrl } from "@/modules/quotes/infrastructure/binance";
import { fetchBrapiPrice } from "@/modules/quotes/infrastructure/brapi";
import { fetchCryptoQuotes } from "@/modules/quotes/infrastructure/coingecko";
import { fetchFinnhubQuotes } from "@/modules/quotes/infrastructure/finnhub";
import { describeProviderError } from "@/modules/quotes/infrastructure/http";
import { fetchYahooPrice } from "@/modules/quotes/infrastructure/yahoo";

// Cotações de hoje por cadeia de provedores (spec 037). Cada grupo tenta o
// primeiro provedor e passa ao seguinte só os símbolos que falharam; a falha
// final lista o motivo de cada provedor tentado.
//
// - câmbio: AwesomeAPI → PTAX do Banco Central → Yahoo Finance;
// - cripto: CoinGecko → Binance;
// - ativos em dólar (EUA): Finnhub → Yahoo Finance → Alpha Vantage;
// - demais (B3): Yahoo Finance → brapi, com BRAPI_TOKEN → Alpha Vantage.
//
// O Alpha Vantage gratuito tem 25 consultas por dia e fica por último.

type Step = {
  provider: string;
  /** Falso quando falta a chave; o passo é pulado sem contar como falha. */
  enabled: boolean;
  fetch: (requests: QuoteRequest[]) => Promise<QuoteResult[]>;
};

export async function fetchCurrentQuotes(
  requests: QuoteRequest[],
  configuration = getQuoteProviderConfiguration(),
  today = new Date().toISOString().slice(0, 10),
): Promise<QuoteResult[]> {
  const unique = [...new Map(requests.map((request) => [request.symbol, request])).values()];
  const fiat = unique.filter((request) => request.instrumentType === "FIAT");
  const crypto = unique.filter((request) => request.instrumentType === "CRIPTO");
  const usdAssets = unique.filter(
    (request) => request.instrumentType !== "FIAT" && request.instrumentType !== "CRIPTO" && request.baseCurrency === "USD",
  );
  const b3 = unique.filter(
    (request) => request.instrumentType !== "FIAT" && request.instrumentType !== "CRIPTO" && request.baseCurrency !== "USD",
  );
  const results: QuoteResult[] = [];

  // O dólar serve ao câmbio, aos ativos em dólar e aos pares em USDT.
  const needsUsd = fiat.some((request) => request.symbol === "USD") || usdAssets.length > 0 || crypto.length > 0;
  const usd = needsUsd ? await fetchUsdChain(configuration, today) : null;

  for (const request of fiat) {
    if (request.symbol === "BRL") {
      results.push({ symbol: "BRL", provider: "fixed", status: "SUCCESS", valueBrl: 1 });
    } else if (request.symbol === "USD" && usd) {
      results.push({ ...usd, symbol: "USD" });
    } else {
      results.push(
        quoteFailure(request.symbol, "awesome-api", "UNSUPPORTED_CURRENCY", `A moeda ${request.symbol} ainda não possui integração.`),
      );
    }
  }

  const usdBrl = usd?.status === "SUCCESS" ? usd.valueBrl : null;
  const usdMissing = (symbols: QuoteRequest[], provider: string) =>
    symbols.map((request) =>
      quoteFailure(
        request.symbol,
        provider,
        "MISSING_USD_QUOTE",
        usd?.status === "FAILED" ? `Sem o dólar do dia: ${usd.errorMessage}` : "Sem o dólar do dia.",
      ),
    );

  results.push(
    ...(await runChain(crypto, [
      {
        provider: "coingecko",
        enabled: true,
        fetch: (pending) =>
          fetchCryptoQuotes(
            pending.map((request) => ({ symbol: request.symbol, coinId: request.providerId })),
            configuration.coinGeckoApiKey,
          ),
      },
      { provider: "binance", enabled: true, fetch: (pending) => perSymbol(pending, "binance", (symbol) => fetchBinancePriceBrl(symbol, usdBrl)) },
    ])),
  );

  results.push(
    ...(await runChain(usdAssets, [
      {
        provider: "finnhub",
        enabled: Boolean(configuration.finnhubApiKey),
        fetch: async (pending) =>
          usdBrl === null
            ? usdMissing(pending, "finnhub")
            : fetchFinnhubQuotes(pending.map((request) => request.symbol), usdBrl, configuration.finnhubApiKey),
      },
      {
        provider: "yahoo",
        enabled: true,
        fetch: async (pending) =>
          usdBrl === null
            ? usdMissing(pending, "yahoo")
            : perSymbol(pending, "yahoo", async (symbol) => (await fetchYahooPrice(symbol)).price * usdBrl),
      },
      {
        provider: "alpha-vantage",
        enabled: Boolean(configuration.alphaVantageApiKey),
        fetch: async (pending) =>
          usdBrl === null
            ? usdMissing(pending, "alpha-vantage")
            : (await fetchAlphaVantageQuotes(pending.map((request) => request.symbol), configuration.alphaVantageApiKey)).map(
                (result) => (result.status === "SUCCESS" ? { ...result, valueBrl: result.valueBrl * usdBrl } : result),
              ),
      },
    ])),
  );

  results.push(
    ...(await runChain(b3, [
      { provider: "yahoo", enabled: true, fetch: (pending) => perSymbol(pending, "yahoo", async (symbol) => (await fetchYahooPrice(symbol)).price) },
      {
        provider: "brapi",
        enabled: Boolean(configuration.brapiToken),
        fetch: (pending) => perSymbol(pending, "brapi", (symbol) => fetchBrapiPrice(symbol, configuration.brapiToken!)),
      },
      {
        provider: "alpha-vantage",
        enabled: Boolean(configuration.alphaVantageApiKey),
        fetch: (pending) => fetchAlphaVantageQuotes(pending.map((request) => request.symbol), configuration.alphaVantageApiKey),
      },
    ])),
  );

  return results.sort((left, right) => left.symbol.localeCompare(right.symbol));
}

/** Dólar do dia: AwesomeAPI, PTAX do Banco Central e Yahoo Finance, nessa ordem. */
async function fetchUsdChain(configuration: QuoteProviderConfiguration, today: string): Promise<QuoteResult> {
  const [result] = await runChain(
    [{ symbol: "USD", instrumentType: "FIAT", baseCurrency: "USD" }],
    [
      { provider: "awesome-api", enabled: true, fetch: (pending) => perSymbol(pending, "awesome-api", () => fetchUsdBrl(configuration.awesomeApiKey)) },
      { provider: "bcb", enabled: true, fetch: (pending) => perSymbol(pending, "bcb", () => fetchPtaxUsdLatest(today)) },
      { provider: "yahoo", enabled: true, fetch: (pending) => perSymbol(pending, "yahoo", async () => (await fetchYahooPrice("USD")).price) },
    ],
  );

  return result;
}

async function runChain(requests: QuoteRequest[], steps: Step[]): Promise<QuoteResult[]> {
  const done: QuoteResult[] = [];
  const failures = new Map<string, { provider: string; code: string; messages: string[] }>();
  let pending = requests;

  for (const step of steps) {
    if (pending.length === 0) {
      break;
    }

    if (!step.enabled) {
      continue;
    }

    let results: QuoteResult[];

    try {
      results = await step.fetch(pending);
    } catch (error) {
      const described = describeProviderError(error);
      results = pending.map((request) => quoteFailure(request.symbol, step.provider, described.code, described.message));
    }

    const succeeded = new Set<string>();

    for (const result of results) {
      if (result.status === "SUCCESS") {
        done.push(result);
        succeeded.add(result.symbol);
        continue;
      }

      const entry = failures.get(result.symbol) ?? { provider: result.provider, code: result.errorCode, messages: [] };
      entry.provider = result.provider;
      entry.code = result.errorCode;
      entry.messages.push(`${providerLabel(result.provider)}: ${result.errorMessage}`);
      failures.set(result.symbol, entry);
    }

    pending = pending.filter((request) => !succeeded.has(request.symbol));
  }

  for (const request of pending) {
    const failure = failures.get(request.symbol);
    done.push(
      failure
        ? quoteFailure(request.symbol, failure.provider, failure.code, failure.messages.join(" "))
        : quoteFailure(request.symbol, "configuration", "MISSING_API_KEY", "Nenhum provedor configurado para este ativo."),
    );
  }

  return done;
}

/** Um provedor de um símbolo por vez, com a falha de cada um isolada. */
async function perSymbol(
  requests: QuoteRequest[],
  provider: string,
  read: (symbol: string) => Promise<number>,
): Promise<QuoteResult[]> {
  const results: QuoteResult[] = [];

  for (const request of requests) {
    try {
      const valueBrl = await read(request.symbol);
      results.push({ symbol: request.symbol, provider, status: "SUCCESS", valueBrl });
    } catch (error) {
      const described = describeProviderError(error);
      results.push(quoteFailure(request.symbol, provider, described.code, described.message));
    }
  }

  return results;
}

export function getQuoteProviderConfiguration(): QuoteProviderConfiguration {
  return {
    awesomeApiKey: process.env.AWESOME_API_KEY || undefined,
    coinGeckoApiKey: process.env.COINGECKO_API_KEY || undefined,
    finnhubApiKey: process.env.FINNHUB_API_KEY || undefined,
    alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY || undefined,
    brapiToken: process.env.BRAPI_TOKEN || undefined,
  };
}
