// Prazo de liquidez de um ativo (spec 039): em quanto tempo o dinheiro fica
// disponível ao resgatar. Opcional e informativo, mais usado na renda fixa.
// As sugestões cobrem os casos comuns; outro valor pode ser digitado.

export const LIQUIDITY_SUGGESTIONS = ["Imediata", "D+0", "D+1", "D+2", "D+30", "D+90", "No vencimento"];

export const NO_LIQUIDITY = "Sem liquidez informada";

export const MAX_LIQUIDITY_LENGTH = 30;

/** Texto limpo; "d+1" vira "D+1". Vazio vira nulo. */
export function normalizeLiquidity(value: string | null | undefined) {
  const text = (value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();

  if (!text) {
    return null;
  }

  return /^d\s*\+\s*\d+$/i.test(text) ? `D+${text.replace(/\D/g, "")}` : text;
}
