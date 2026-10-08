import { z } from "zod";

import { fetchJson, ProviderRefusalError, QuoteHttpError } from "@/modules/quotes/infrastructure/http";

// Coinbase pela API pública de preços: sem chave, sem bloqueio das regiões dos
// EUA (onde roda o job do Neon, que a Binance recusa com HTTP 451) e com par em
// reais (BTC-BRL, SOL-BRL). Reserva da CoinGecko na cotação de cripto.

const spotSchema = z.object({ data: z.object({ amount: z.coerce.number().positive() }) });

/** Preço em reais do par SÍMBOLO-BRL; par que a Coinbase não negocia é NOT_FOUND. */
export async function fetchCoinbasePriceBrl(symbol: string) {
  const url = new URL(`https://api.coinbase.com/v2/prices/${encodeURIComponent(symbol)}-BRL/spot`);

  try {
    return spotSchema.parse(await fetchJson(url, undefined, { timeoutMs: 6_000, attempts: 2 })).data.amount;
  } catch (error) {
    if (error instanceof QuoteHttpError && error.statusCode === 404) {
      throw new ProviderRefusalError("NOT_FOUND", `A Coinbase não negocia ${symbol} em reais.`);
    }

    throw error;
  }
}
