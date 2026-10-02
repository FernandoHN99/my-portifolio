import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import {
  ASSET_KIND_DEFINITIONS,
  baseCurrencyOf,
  normalizeTicker,
  providerForQuote,
  type AssetKind,
  type QuoteProvider,
} from "@/modules/portfolio/domain/asset-kinds";
import { getQuoteProviderConfiguration } from "@/modules/quotes/application/fetch-current-quotes";
import { calendarDay, toDateKey } from "@/modules/quotes/domain/calendar";
import { providerLabel } from "@/modules/quotes/domain/quote-refresh";
import type { QuoteProviderConfiguration } from "@/modules/quotes/domain/quote-types";
import type { TickerCheckResponse } from "@/modules/quotes/domain/ticker-check";
import { lookupAlphaVantageSymbol } from "@/modules/quotes/infrastructure/alpha-vantage";
import { fetchUsdBrl } from "@/modules/quotes/infrastructure/awesome-api";
import { fetchCoinGeckoPrices, resolveCoinGeckoCoin } from "@/modules/quotes/infrastructure/coingecko";
import { lookupFinnhubSymbol } from "@/modules/quotes/infrastructure/finnhub";
import { describeProviderError } from "@/modules/quotes/infrastructure/http";

// Checagem do ticker de um ativo novo (spec 026). O resultado fica guardado no
// servidor sob um token opaco, como o desfazer da spec 017: ao salvar, a
// inclusão usa a cotação conferida aqui em vez de confiar num preço enviado
// pelo navegador, e um ticker que o provedor não conhece nunca recebe token.

export type VerifiedTicker = {
  symbol: string;
  kind: AssetKind;
  status: "found" | "unavailable";
  provider: QuoteProvider;
  priceBrl: number | null;
  quoteDate: Date;
  fetchedAt: Date;
  expiresAt: number;
};

const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

const globalForTickers = globalThis as unknown as { tickerCheckStore?: Map<string, VerifiedTicker> };
const store = (globalForTickers.tickerCheckStore ??= new Map<string, VerifiedTicker>());

export function readVerifiedTicker(token: string): VerifiedTicker | null {
  const entry = store.get(token);

  if (!entry || entry.expiresAt < Date.now()) {
    store.delete(token);
    return null;
  }

  return entry;
}

function remember(entry: Omit<VerifiedTicker, "expiresAt">) {
  const now = Date.now();

  for (const [key, value] of store) {
    if (value.expiresAt < now) {
      store.delete(key);
    }
  }

  const token = randomUUID();
  store.set(token, { ...entry, expiresAt: now + TOKEN_TTL_MS });
  return token;
}

type Lookup =
  | { state: "found"; priceBrl: number; name: string | null }
  | { state: "not-found" }
  | { state: "unavailable"; code: string; message: string };

export async function checkTicker(
  input: { monthId: string; kind: AssetKind; ticker: string },
  options: { configuration?: QuoteProviderConfiguration; now?: Date } = {},
): Promise<TickerCheckResponse> {
  const definition = ASSET_KIND_DEFINITIONS[input.kind];

  if (definition.ticker !== "market" || !definition.provider || !definition.instrumentType) {
    return { status: "invalid", message: "Este tipo de ativo não tem ticker para conferir." };
  }

  const symbol = normalizeTicker(input.kind, input.ticker);

  if (!symbol) {
    return { status: "invalid", message: "Digite um ticker válido para este tipo de ativo." };
  }

  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("O banco de dados não está disponível.");
  }

  const month = await prisma.portfolioMonth.findUnique({
    where: { id: input.monthId },
    select: { referenceDate: true },
  });

  if (!month) {
    return { status: "invalid", message: "A competência não existe mais." };
  }

  const provider = providerForQuote(definition.instrumentType, baseCurrencyOf(input.kind, symbol));
  const [monthQuote, latestQuote, latestDaily] = await Promise.all([
    prisma.marketQuote.findUnique({
      where: { referenceDate_symbol: { referenceDate: month.referenceDate, symbol } },
      select: { valueBrl: true, instrumentType: true, baseCurrency: true },
    }),
    prisma.marketQuote.findFirst({
      where: { symbol },
      orderBy: { referenceDate: "desc" },
      select: { instrumentType: true, baseCurrency: true },
    }),
    prisma.dailyQuote.findFirst({
      where: { symbol },
      orderBy: { quoteDate: "desc" },
      select: { instrumentType: true, baseCurrency: true },
    }),
  ]);

  // Um símbolo já cotado na carteira por outro provedor geraria duas regras de
  // cotação para o mesmo símbolo.
  const stored = monthQuote ?? latestQuote ?? latestDaily;
  if (stored && providerForQuote(stored.instrumentType, stored.baseCurrency) !== provider) {
    return {
      status: "conflict",
      symbol,
      message: `${symbol} já é cotado na carteira por outro provedor (${providerLabel(
        providerForQuote(stored.instrumentType, stored.baseCurrency),
      )}). Escolha o tipo correspondente.`,
    };
  }

  if (monthQuote) {
    return { status: "known", symbol, priceBrl: monthQuote.valueBrl.toNumber() };
  }

  const now = options.now ?? new Date();
  const lookup = await lookupSymbol(provider, symbol, options.configuration ?? getQuoteProviderConfiguration());
  const quoteDate = calendarDay(now);

  if (lookup.state === "not-found") {
    return {
      status: "not-found",
      symbol,
      provider,
      message: `${providerLabel(provider)} não encontrou o ticker ${symbol}.`,
    };
  }

  if (lookup.state === "unavailable") {
    const token = remember({
      symbol,
      kind: input.kind,
      status: "unavailable",
      provider,
      priceBrl: null,
      quoteDate,
      fetchedAt: now,
    });
    return { status: "unavailable", symbol, provider, code: lookup.code, message: lookup.message, token };
  }

  const token = remember({
    symbol,
    kind: input.kind,
    status: "found",
    provider,
    priceBrl: lookup.priceBrl,
    quoteDate,
    fetchedAt: now,
  });

  return {
    status: "found",
    symbol,
    provider,
    priceBrl: lookup.priceBrl,
    name: lookup.name,
    quoteDate: toDateKey(quoteDate),
    token,
  };
}

async function lookupSymbol(
  provider: QuoteProvider,
  symbol: string,
  configuration: QuoteProviderConfiguration,
): Promise<Lookup> {
  try {
    switch (provider) {
      case "finnhub": {
        if (!configuration.finnhubApiKey) {
          return missingKey("FINNHUB_API_KEY");
        }

        const result = await lookupFinnhubSymbol(symbol, configuration.finnhubApiKey);

        if (!result.found) {
          return { state: "not-found" };
        }

        // O Finnhub cota em dólar; sem o câmbio do dia não há preço em reais,
        // mas o ticker existe e pode ser salvo com a cotação digitada.
        try {
          const usdBrl = await fetchUsdBrl(configuration.awesomeApiKey);
          return { state: "found", priceBrl: result.priceUsd * usdBrl, name: null };
        } catch (error) {
          const described = describeProviderError(error);
          return {
            state: "unavailable",
            code: described.code,
            message: `O Finnhub encontrou ${symbol}, mas o câmbio do dia não respondeu na AwesomeAPI: ${described.message}`,
          };
        }
      }
      case "alpha-vantage": {
        if (!configuration.alphaVantageApiKey) {
          return missingKey("ALPHA_VANTAGE_API_KEY");
        }

        const result = await lookupAlphaVantageSymbol(symbol, configuration.alphaVantageApiKey);
        return result.found ? { state: "found", priceBrl: result.priceBrl, name: null } : { state: "not-found" };
      }
      case "coingecko": {
        const coin = await resolveCoinGeckoCoin(symbol, configuration.coinGeckoApiKey);

        if (!coin) {
          return { state: "not-found" };
        }

        const price = (await fetchCoinGeckoPrices([coin.id], configuration.coinGeckoApiKey)).get(coin.id);
        return price
          ? { state: "found", priceBrl: price, name: coin.name }
          : { state: "unavailable", code: "MISSING_QUOTE", message: `A CoinGecko não retornou o preço de ${symbol}.` };
      }
      default:
        return { state: "unavailable", code: "UNSUPPORTED", message: "Este tipo não tem provedor para conferir." };
    }
  } catch (error) {
    const described = describeProviderError(error);
    return { state: "unavailable", code: described.code, message: described.message };
  }
}

function missingKey(variable: string): Lookup {
  return {
    state: "unavailable",
    code: "MISSING_API_KEY",
    message: `Configure ${variable} para conferir este ticker.`,
  };
}
