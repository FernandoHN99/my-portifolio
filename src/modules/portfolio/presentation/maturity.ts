import { formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";

// Aviso de vencimento de um ativo (spec 026). O vencimento é informativo: não
// muda o prazo do rateio nem nenhum cálculo.

export const MATURITY_SOON_DAYS = 30;

export type MaturityStatus = {
  tone: "neutral" | "soon" | "expired";
  label: string;
  /** Data completa para a dica, como "Vence em 15/06/2027". */
  title: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Datas como AAAA-MM-DD, comparadas em dias de calendário. */
export function maturityStatus(maturityDate: string, referenceDay: string): MaturityStatus {
  const maturity = parseDay(maturityDate);
  const reference = parseDay(referenceDay);
  const days = Math.round((maturity.getTime() - reference.getTime()) / DAY_MS);
  const full = formatDay(maturity);

  if (days < 0) {
    return { tone: "expired", label: "vencido", title: `Venceu em ${full}` };
  }

  if (days <= MATURITY_SOON_DAYS) {
    return {
      tone: "soon",
      label: days === 0 ? "vence hoje" : days === 1 ? "vence amanhã" : `vence em ${days} dias`,
      title: `Vence em ${full}`,
    };
  }

  return { tone: "neutral", label: `vence em ${formatMonthCompact(maturity)}`, title: `Vence em ${full}` };
}

/** Rótulo curto do vencimento para listas, como "Jun/27". */
export function maturityHint(maturityDate: string) {
  return `vence ${formatMonthCompact(parseDay(maturityDate))}`;
}

export function formatDay(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}

function parseDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
