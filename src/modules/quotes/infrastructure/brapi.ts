import { z } from "zod";

import { fetchJson, ProviderRefusalError } from "@/modules/quotes/infrastructure/http";

// brapi.dev (spec 037): ações e ETFs da B3, com chave gratuita (15 mil
// consultas por mês, um ticker por consulta, histórico de 3 meses). Opcional:
// só entra na cadeia da B3 com BRAPI_TOKEN configurado.

const quoteSchema = z.object({
  results: z.array(z.object({ regularMarketPrice: z.number().nullable().optional() })).optional(),
  error: z.boolean().optional(),
  message: z.string().optional(),
});

export async function fetchBrapiPrice(symbol: string, token: string) {
  const ticker = symbol.replace(/\.SAO?$/, "");
  const url = new URL(`https://brapi.dev/api/quote/${encodeURIComponent(ticker)}`);
  const payload = quoteSchema.parse(await fetchJson(url, { headers: { authorization: `Bearer ${token}` } }));
  const price = payload.results?.[0]?.regularMarketPrice;

  if (payload.error || !price || price <= 0) {
    throw new ProviderRefusalError("NOT_FOUND", payload.message ?? `A brapi não retornou ${ticker}.`);
  }

  return price;
}
