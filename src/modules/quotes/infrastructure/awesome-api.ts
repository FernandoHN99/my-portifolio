import { z } from "zod";

import { fetchJson } from "@/modules/quotes/infrastructure/http";

const awesomeCurrencySchema = z.record(
  z.string(),
  z.object({ bid: z.coerce.number().positive() }),
);

export async function fetchUsdBrl(apiKey?: string) {
  const url = new URL("https://economia.awesomeapi.com.br/json/last/USD-BRL");
  const headers = apiKey ? { "x-api-key": apiKey } : undefined;
  const payload = awesomeCurrencySchema.parse(await fetchJson(url, { headers }));
  const quote = payload.USDBRL;

  if (!quote) {
    throw new Error("A AwesomeAPI não retornou USD-BRL.");
  }

  return quote.bid;
}
