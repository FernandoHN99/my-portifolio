// Contrato da checagem de ticker de um ativo novo (spec 026), compartilhado
// entre a rota, o diálogo de nova posição e os testes. Sem dependências de banco.

import type { AssetKind } from "@/modules/portfolio/domain/asset-kinds";

export type TickerCheckRequest = { monthId: string; kind: AssetKind; ticker: string };

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

export type TickerCheckStatus = TickerCheckResponse["status"];

/** Estados em que o ativo novo pode ser salvo, com ou sem cotação digitada. */
export function tickerCheckAllowsSaving(response: TickerCheckResponse | null) {
  return response?.status === "found" || response?.status === "known" || response?.status === "unavailable";
}
