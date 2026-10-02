import { z } from "zod";

import type { QuoteResult } from "@/modules/quotes/domain/quote-types";
import { quoteFailure } from "@/modules/quotes/domain/quote-types";
import { describeProviderError, fetchJson, ProviderRefusalError } from "@/modules/quotes/infrastructure/http";

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

const alphaVantageLookupSchema = z.object({
  "Global Quote": z.record(z.string(), z.string()).optional(),
  Note: z.string().optional(),
  Information: z.string().optional(),
  "Error Message": z.string().optional(),
});

/**
 * Confere se o Alpha Vantage conhece o símbolo (spec 026). Um símbolo
 * desconhecido volta com "Global Quote" vazio; o aviso de limite de uso e o de
 * chave sem acesso vêm com HTTP 200 em "Note" ou "Information" e não provam que
 * o ticker falta, então viram recusa do provedor.
 */
export async function lookupAlphaVantageSymbol(
  symbol: string,
  apiKey: string,
): Promise<{ found: true; priceBrl: number } | { found: false }> {
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "GLOBAL_QUOTE");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);
  const payload = alphaVantageLookupSchema.parse(await fetchJson(url));

  if (payload.Note || payload.Information) {
    throw new ProviderRefusalError(
      "RATE_LIMITED",
      "O Alpha Vantage recusou a consulta: limite de uso atingido ou chave sem acesso.",
    );
  }

  if (payload["Error Message"]) {
    throw new ProviderRefusalError("PROVIDER_ERROR", "O Alpha Vantage recusou a consulta.");
  }

  const quote = payload["Global Quote"];
  const price = quote ? Number(quote["05. price"]) : Number.NaN;

  return Number.isFinite(price) && price > 0 ? { found: true, priceBrl: price } : { found: false };
}

const alphaVantageMonthlySchema = z.object({
  "Monthly Time Series": z.record(z.string(), z.object({ "4. close": z.coerce.number().positive() })).optional(),
  Note: z.string().optional(),
  Information: z.string().optional(),
  "Error Message": z.string().optional(),
});

/**
 * Fechamento mensal de um símbolo numa única consulta (spec 029): o Alpha
 * Vantage devolve todo o histórico, um ponto no último pregão de cada mês, na
 * moeda do ativo. Consome uma das 25 consultas diárias do plano gratuito.
 */
export async function fetchAlphaVantageMonthlyCloses(symbol: string, apiKey: string) {
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "TIME_SERIES_MONTHLY");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);
  const payload = alphaVantageMonthlySchema.parse(await fetchJson(url));

  if (payload.Note || payload.Information) {
    throw new ProviderRefusalError(
      "RATE_LIMITED",
      "O Alpha Vantage recusou a consulta: limite de uso atingido ou chave sem acesso.",
    );
  }

  if (payload["Error Message"] || !payload["Monthly Time Series"]) {
    throw new ProviderRefusalError("NOT_FOUND", `O Alpha Vantage não tem o histórico de ${symbol}.`);
  }

  return Object.entries(payload["Monthly Time Series"]).map(([day, values]) => ({ day, value: values["4. close"] }));
}
