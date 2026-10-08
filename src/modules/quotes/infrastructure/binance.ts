import { z } from "zod";

import { fetchJson, ProviderRefusalError, QuoteHttpError } from "@/modules/quotes/infrastructure/http";

// Binance pela API pública de mercado (spec 037): sem chave e com limites
// largos. Reserva da CoinGecko na cotação de cripto e fonte principal do
// histórico mensal, que a CoinGecko gratuita limita a 365 dias. Usa o par em
// reais quando existe (BTCBRL, SOLBRL); senão, o par em USDT, convertido pelo
// dólar.

const priceSchema = z.object({ price: z.coerce.number().positive() });
const klinesSchema = z.array(z.tuple([z.number(), z.string(), z.string(), z.string(), z.string()]).rest(z.unknown()));

const BASE = "https://api.binance.com/api/v3";
// Espelho oficial só de dados de mercado, sem a restrição regional do endereço
// principal, que responde HTTP 451 nas regiões dos EUA.
const MARKET_DATA_BASE = "https://data-api.binance.vision/api/v3";

/** Consulta pública; com HTTP 451, repete no espelho de dados de mercado. */
async function fetchBinance(path: string, params: Record<string, string>) {
  const build = (base: string) => {
    const url = new URL(`${base}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url;
  };

  try {
    return await fetchJson(build(BASE));
  } catch (error) {
    if (error instanceof QuoteHttpError && error.statusCode === 451) {
      return fetchJson(build(MARKET_DATA_BASE));
    }

    throw error;
  }
}

async function firstPair<T>(symbol: string, read: (pair: string) => Promise<T>) {
  for (const quote of ["BRL", "USDT"] as const) {
    try {
      return { quote, value: await read(`${symbol}${quote}`) };
    } catch (error) {
      // Par inexistente responde HTTP 400; outro erro interrompe.
      if (!(error instanceof QuoteHttpError && error.statusCode === 400)) {
        throw error;
      }
    }
  }

  throw new ProviderRefusalError("NOT_FOUND", `A Binance não negocia ${symbol} em reais nem em USDT.`);
}

/** Preço em reais; pares em USDT são convertidos pelo dólar informado. */
export async function fetchBinancePriceBrl(symbol: string, usdBrl: number | null) {
  const { quote, value } = await firstPair(symbol, async (pair) =>
    priceSchema.parse(await fetchBinance("/ticker/price", { symbol: pair })).price,
  );

  if (quote === "BRL") {
    return value;
  }

  if (!usdBrl) {
    throw new ProviderRefusalError("MISSING_USD_QUOTE", `A Binance cota ${symbol} em USDT e o dólar do dia não respondeu.`);
  }

  return value * usdBrl;
}

/**
 * Fechamento mensal de todo o histórico disponível numa única consulta, no
 * último dia de cada mês. `currency` diz se os valores estão em reais ou em
 * USDT.
 */
export async function fetchBinanceMonthlyCloses(symbol: string, months = 40) {
  const { quote, value } = await firstPair(symbol, async (pair) =>
    klinesSchema.parse(await fetchBinance("/klines", { symbol: pair, interval: "1M", limit: String(months) })),
  );

  return {
    currency: quote === "BRL" ? "BRL" : "USD",
    points: value.map(([openTime, , , , close]) => {
      const open = new Date(openTime);
      const lastDay = new Date(Date.UTC(open.getUTCFullYear(), open.getUTCMonth() + 1, 0));
      return { day: lastDay.toISOString().slice(0, 10), value: Number(close) };
    }),
  };
}
