// Horas do holerite de Recebimentos (spec 094): a transcrição, por tipo, das
// horas e do valor que cada holerite de 2026 pagou. Não têm tela; as horas extras
// declaradas e pagas ficam nas Horas extras (spec 098), que daqui usam só o valor
// da hora normal. O DSR e os dias de
// férias não são horas trabalhadas e ficam de fora.

export const HOUR_KINDS = ["NORMAL", "OVERTIME_50", "OVERTIME_75", "OVERTIME_100"] as const;
export type HourKind = (typeof HOUR_KINDS)[number];

/** Nomes como o holerite os escreve. */
export const HOUR_KIND_LABELS: Record<HourKind, string> = {
  NORMAL: "Horas normais",
  OVERTIME_50: "Horas extras 50%",
  OVERTIME_75: "Horas extras 75%",
  OVERTIME_100: "Horas extras 100%",
};

/** As horas de um tipo cabem no mês: 31 dias de 24 horas. */
export const MAX_MONTH_HOURS = 744;
