// Contrato da checagem de ticker de um ativo novo (spec 026), compartilhado
// entre a rota, o diálogo de nova posição e os testes. Sem dependências de banco.

import type { AssetKind } from "@/modules/portfolio/domain/asset-kinds";

export type TickerCheckRequest = {
  monthId: string;
  kind: AssetKind;
  ticker: string;
  /** Moeda da CoinGecko escolhida entre as candidatas (spec 033). */
  coinId?: string;
};

/** Moeda candidata da CoinGecko para um símbolo de cripto. */
export type CoinCandidate = { id: string; name: string };

export type TickerCheckResponse =
  /** O provedor conhece o ticker e devolveu a cotação de hoje, em reais. */
  | {
      status: "found";
      symbol: string;
      provider: string;
      priceBrl: number;
      name: string | null;
      quoteDate: string;
      token: string;
      /** Moeda conferida, quando o provedor é a CoinGecko. */
      coinId?: string | null;
      /** Moedas com o mesmo símbolo, quando há mais de uma para escolher. */
      coins?: CoinCandidate[];
    }
  /** A competência já tem cotação deste símbolo; o provedor não é consultado. */
  | { status: "known"; symbol: string; priceBrl: number }
  /** O provedor respondeu e não conhece o ticker: salvar fica bloqueado. */
  | { status: "not-found"; symbol: string; provider: string; message: string }
  /** O provedor não respondeu ou recusou: salvar exige a cotação digitada. */
  | { status: "unavailable"; symbol: string; provider: string; code: string; message: string; token: string }
  /** O símbolo já é cotado na carteira por outro provedor. */
  | { status: "conflict"; symbol: string; message: string }
  | { status: "invalid"; message: string };

/** Estados em que o ativo novo pode ser salvo, com ou sem cotação digitada. */
export function tickerCheckAllowsSaving(
  response: TickerCheckResponse | null,
): response is Extract<TickerCheckResponse, { status: "found" | "known" | "unavailable" }> {
  return response?.status === "found" || response?.status === "known" || response?.status === "unavailable";
}
