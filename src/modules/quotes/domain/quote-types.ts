export type QuoteRequest = {
  symbol: string;
  instrumentType: string;
  baseCurrency: string;
  /**
   * Identificador do símbolo no provedor, quando é outro: a moeda da CoinGecko
   * guardada para um cripto novo (spec 026).
   */
  providerId?: string;
};

export type QuoteSuccess = {
  symbol: string;
  provider: string;
  status: "SUCCESS";
  valueBrl: number;
};

export type QuoteFailure = {
  symbol: string;
  provider: string;
  status: "FAILED";
  errorCode: string;
  errorMessage: string;
};

export type QuoteResult = QuoteSuccess | QuoteFailure;

export type QuoteProviderConfiguration = {
  awesomeApiKey?: string;
  coinGeckoApiKey?: string;
  finnhubApiKey?: string;
  alphaVantageApiKey?: string;
};

export function quoteFailure(
  symbol: string,
  provider: string,
  errorCode: string,
  errorMessage: string,
): QuoteFailure {
  return { symbol, provider, status: "FAILED", errorCode, errorMessage };
}
