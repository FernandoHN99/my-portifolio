// Horas do mês de Recebimentos (spec 094): para cada tipo de hora, o que o
// usuário declarou à empresa, o que o holerite pagou e o que ele realmente
// trabalhou. Só são guardadas e entram no backup; nenhuma tela as mostra ainda.
// O DSR e os dias de férias não são horas trabalhadas e ficam de fora.

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
