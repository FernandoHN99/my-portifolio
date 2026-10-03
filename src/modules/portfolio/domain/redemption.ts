// Prazo de resgate de uma classificação do rateio (spec 035). Na planilha, a
// coluna de duração era o prazo de resgate para liquidez; o vencimento do título
// é outro campo, opcional, do ativo (spec 026). Os valores aceitos daqui em
// diante são fixos; "-" é o "Nenhum" já usado nos dados importados. Valores
// antigos, como D+0 e D+1, continuam nos dados até o passo pré-produção.

export const NO_REDEMPTION = "-";

export const REDEMPTION_VALUES = ["Curto", "Médio", "Longo", NO_REDEMPTION] as const;

export function isRedemption(value: string) {
  return (REDEMPTION_VALUES as readonly string[]).includes(value);
}

export function redemptionLabel(value: string) {
  return value === NO_REDEMPTION ? "Nenhum" : value;
}
