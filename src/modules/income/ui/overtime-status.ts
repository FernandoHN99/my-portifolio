import type { WorkStatus } from "@/modules/income/domain/overtime";

/**
 * Tom do selo de cada situação (spec 098), na linguagem de Recebimentos: menta
 * para o que foi pago, violeta para o que venceu sem pagamento, `accent` para o
 * pago com atraso e neutro para o que ainda não venceu.
 */
export const STATUS_TONES: Record<WorkStatus, "primary" | "spent" | "accent" | "neutral"> = {
  NONE: "neutral",
  PAID: "primary",
  PAID_LATE: "accent",
  PARTIAL: "spent",
  OVERDUE: "spent",
  UPCOMING: "neutral",
};
