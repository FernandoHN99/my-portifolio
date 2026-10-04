import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import { getUserDb } from "@/lib/user-db";
import {
  ASSET_KIND_DEFINITIONS,
  baseCurrencyOf,
  normalizeTicker,
  providerForQuote,
  type AssetKind,
  type QuoteProvider,
} from "@/modules/portfolio/domain/asset-kinds";
import { getQuoteProviderConfiguration } from "@/modules/quotes/application/fetch-current-quotes";
import { readMonthQuoteValues } from "@/modules/quotes/application/month-quote-values";
import { calendarDay, toDateKey } from "@/modules/quotes/domain/calendar";
import { providerLabel } from "@/modules/quotes/domain/quote-refresh";
import type { QuoteProviderConfiguration } from "@/modules/quotes/domain/quote-types";
import type { CoinCandidate, TickerCheckResponse } from "@/modules/quotes/domain/ticker-check";
import { lookupAlphaVantageSymbol } from "@/modules/quotes/infrastructure/alpha-vantage";
import { fetchUsdBrl } from "@/modules/quotes/infrastructure/awesome-api";
import {
  fetchCoinGeckoPrices,
  resolveCoinGeckoCoin,
  searchCoinGeckoCoins,
} from "@/modules/quotes/infrastructure/coingecko";
import { lookupFinnhubSymbol } from "@/modules/quotes/infrastructure/finnhub";
import { describeProviderError } from "@/modules/quotes/infrastructure/http";
import { fetchYahooPrice } from "@/modules/quotes/infrastructure/yahoo";
import { latestTreasuryPoint, treasurySeriesOf } from "@/modules/quotes/domain/treasury";
import { readTreasuryBook } from "@/modules/quotes/infrastructure/treasury";

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
  /** Moeda da CoinGecko conferida, guardada no ativo novo ao salvar. */
  coinId: string | null;
  quoteDate: Date;
  fetchedAt: Date;
  expiresAt: number;
};

const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

type Lookup =
  | { state: "found"; priceBrl: number; coinId: string | null; name: string | null; quoteDate?: string; coins?: CoinCandidate[] }
  | { state: "not-found" }
  | { state: "unavailable"; code: string; message: string };

// Resposta do provedor por provedor e símbolo, reaproveitada pelo mesmo tempo
// do token e só no mesmo dia: digitar de novo, trocar entre ETF e ação da B3 ou
// conferir outra posição com o mesmo ticker não gasta outra consulta. Importa
// sobretudo no Alpha Vantage, de 25 consultas gratuitas por dia (spec 003),
// que a atualização diária também usa. Indisponível não fica guardado, para a
// próxima checagem tentar de novo.
type CachedLookup = { lookup: Extract<Lookup, { state: "found" | "not-found" }>; fetchedAt: Date; expiresAt: number };

const globalForTickers = globalThis as unknown as {
  tickerCheckStore?: Map<string, VerifiedTicker>;
  tickerLookupCache?: Map<string, CachedLookup>;
};
const store = (globalForTickers.tickerCheckStore ??= new Map<string, VerifiedTicker>());
const lookupCache = (globalForTickers.tickerLookupCache ??= new Map<string, CachedLookup>());

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

export async function checkTicker(
  input: { monthId: string; kind: AssetKind; ticker: string; coinId?: string },
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

  const prisma = await getUserDb();

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
    // A do usuário: a compartilhada ou a digitada por ele (spec 051).
    readMonthQuoteValues(prisma, month.referenceDate, [symbol]).then((quotes) => quotes.get(symbol)),
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

  // Um símbolo já cotado por outro provedor geraria duas regras de cotação para
  // o mesmo símbolo, que é compartilhado entre os usuários (spec 051).
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
  // Cada moeda escolhida é uma consulta própria no cache (spec 033).
  const cacheSymbol = provider === "coingecko" && input.coinId ? `${symbol}:${input.coinId}` : symbol;
  const { lookup, fetchedAt } = await cachedLookup(provider, cacheSymbol, now, async () => {
    // Um cripto cuja moeda já está guardada num ativo é conferido por ela, sem
    // nova busca: a cotação é do símbolo, e o símbolo tem uma moeda só, a mesma
    // para todos os usuários (spec 051).
    const stored =
      provider === "coingecko"
        ? await getPrismaClient()!.asset.findFirst({
            where: { quoteSymbol: symbol, quoteProviderId: { not: null } },
            orderBy: { createdAt: "asc" },
            select: { quoteProviderId: true },
          })
        : null;

    return lookupSymbol(
      provider,
      symbol,
      options.configuration ?? getQuoteProviderConfiguration(),
      stored?.quoteProviderId ?? null,
      input.coinId ?? null,
      toDateKey(now),
    );
  });
  const quoteDate = lookup.state === "found" && lookup.quoteDate
    ? new Date(`${lookup.quoteDate}T00:00:00Z`) : calendarDay(fetchedAt);

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
      coinId: null,
      quoteDate,
      fetchedAt,
    });
    return { status: "unavailable", symbol, provider, code: lookup.code, message: lookup.message, token };
  }

  const token = remember({
    symbol,
    kind: input.kind,
    status: "found",
    provider,
    priceBrl: lookup.priceBrl,
    coinId: lookup.coinId,
    quoteDate,
    fetchedAt,
  });

  return {
    status: "found",
    symbol,
    provider,
    priceBrl: lookup.priceBrl,
    name: lookup.name,
    quoteDate: toDateKey(quoteDate),
    token,
    coinId: lookup.coinId,
    ...(lookup.coins && lookup.coins.length > 1 ? { coins: lookup.coins } : {}),
  };
}

async function cachedLookup(
  provider: QuoteProvider,
  symbol: string,
  now: Date,
  lookup: () => Promise<Lookup>,
): Promise<{ lookup: Lookup; fetchedAt: Date }> {
  const key = `${provider}:${symbol}`;
  const cached = lookupCache.get(key);

  if (
    cached &&
    cached.expiresAt > now.getTime() &&
    calendarDay(cached.fetchedAt).getTime() === calendarDay(now).getTime()
  ) {
    return cached;
  }

  for (const [entryKey, entry] of lookupCache) {
    if (entry.expiresAt <= now.getTime()) {
      lookupCache.delete(entryKey);
    }
  }

  const result = await lookup();

  if (result.state === "unavailable") {
    lookupCache.delete(key);
  } else {
    lookupCache.set(key, { lookup: result, fetchedAt: now, expiresAt: now.getTime() + TOKEN_TTL_MS });
  }

  return { lookup: result, fetchedAt: now };
}

async function lookupSymbol(
  provider: QuoteProvider,
  symbol: string,
  configuration: QuoteProviderConfiguration,
  storedCoinId: string | null,
  chosenCoinId: string | null,
  today: string,
): Promise<Lookup> {
  try {
    switch (provider) {
      case "tesouro": {
        const series = treasurySeriesOf(await readTreasuryBook(), { symbol, providerId: chosenCoinId });
        if (!series || series.maturityDate <= today) return { state: "not-found" };
        const point = latestTreasuryPoint(series, today);
        return point
          ? { state: "found", priceBrl: point.value, quoteDate: point.day, coinId: series.providerId, name: series.name }
          : { state: "unavailable", code: "MISSING_QUOTE", message: "O Tesouro não publicou preço de mercado para este título." };
      }
      case "finnhub": {
        // EUA: Finnhub e, sem a chave ou com ele fora do ar, o Yahoo Finance
        // (spec 037). Os dois cotam em dólar; o real sai do câmbio do dia.
        let priceUsd: number | null = null;

        if (configuration.finnhubApiKey) {
          try {
            const result = await lookupFinnhubSymbol(symbol, configuration.finnhubApiKey);

            if (!result.found) {
              return { state: "not-found" };
            }

            priceUsd = result.priceUsd;
          } catch {
            priceUsd = null;
          }
        }

        if (priceUsd === null) {
          const yahoo = await lookupYahoo(symbol);

          if (yahoo.state !== "found") {
            return yahoo;
          }

          priceUsd = yahoo.price;
        }

        // Sem o câmbio do dia não há preço em reais, mas o ticker existe e pode
        // ser salvo com a cotação digitada.
        try {
          const usdBrl = await fetchUsdBrl(configuration.awesomeApiKey);
          return { state: "found", priceBrl: priceUsd * usdBrl, coinId: null, name: null };
        } catch (error) {
          const described = describeProviderError(error);
          return {
            state: "unavailable",
            code: described.code,
            message: `${symbol} existe, mas o câmbio do dia não respondeu na AwesomeAPI: ${described.message}`,
          };
        }
      }
      case "yahoo": {
        // B3: Yahoo Finance e, se ele falhar sem dizer que o ticker não existe,
        // o Alpha Vantage, que tem 25 consultas por dia (spec 037).
        const yahoo = await lookupYahoo(symbol);

        if (yahoo.state === "found") {
          return { state: "found", priceBrl: yahoo.price, coinId: null, name: null };
        }

        if (yahoo.state === "not-found" || !configuration.alphaVantageApiKey) {
          return yahoo;
        }

        const result = await lookupAlphaVantageSymbol(symbol, configuration.alphaVantageApiKey);
        return result.found
          ? { state: "found", priceBrl: result.priceBrl, coinId: null, name: null }
          : { state: "not-found" };
      }
      case "alpha-vantage": {
        if (!configuration.alphaVantageApiKey) {
          return missingKey("ALPHA_VANTAGE_API_KEY");
        }

        const result = await lookupAlphaVantageSymbol(symbol, configuration.alphaVantageApiKey);
        return result.found
          ? { state: "found", priceBrl: result.priceBrl, coinId: null, name: null }
          : { state: "not-found" };
      }
      case "coingecko": {
        // A moeda guardada num ativo vale para o símbolo inteiro, sem escolha;
        // ela não tem o nome à mão, e a checagem mostra só o ticker. Sem moeda
        // guardada, a busca lista as candidatas e o usuário pode escolher outra
        // além da de maior capitalização (spec 033). BTC e SOL têm moeda fixa.
        let coin: { id: string; name: string | null } | null;
        let coins: CoinCandidate[] | undefined;

        if (storedCoinId) {
          coin = { id: storedCoinId, name: null };
        } else if (symbol === "BTC" || symbol === "SOL") {
          coin = await resolveCoinGeckoCoin(symbol, configuration.coinGeckoApiKey);
        } else {
          coins = await searchCoinGeckoCoins(symbol, configuration.coinGeckoApiKey);
          coin = (chosenCoinId ? coins.find((candidate) => candidate.id === chosenCoinId) : null) ?? coins[0] ?? null;
        }

        if (!coin) {
          return { state: "not-found" };
        }

        const price = (await fetchCoinGeckoPrices([coin.id], configuration.coinGeckoApiKey)).get(coin.id);
        return price
          ? { state: "found", priceBrl: price, coinId: coin.id, name: coin.name, coins }
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

async function lookupYahoo(
  symbol: string,
): Promise<{ state: "found"; price: number } | { state: "not-found" } | { state: "unavailable"; code: string; message: string }> {
  try {
    return { state: "found", price: (await fetchYahooPrice(symbol)).price };
  } catch (error) {
    const described = describeProviderError(error);

    if (described.code === "NOT_FOUND") {
      return { state: "not-found" };
    }

    return { state: "unavailable", code: described.code, message: `Yahoo Finance: ${described.message}` };
  }
}

function missingKey(variable: string): Lookup {
  return {
    state: "unavailable",
    code: "MISSING_API_KEY",
    message: `Configure ${variable} para conferir este ticker.`,
  };
}
