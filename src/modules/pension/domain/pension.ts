import type { Competence } from "@/lib/competence";
import type { Cents } from "@/lib/money";
import {
  countsAsTaxable,
  dailyRateCents,
  daysWorked,
  payslipIncomeCents,
  taxableIncomeCents,
  type IsoDate,
  type Payslip,
} from "@/modules/income/domain/income";

// Previdência (spec 089): quanto ainda cabe no PGBL no ano. O limite de
// dedução é 12% da renda tributável bruta do ano, como a aba Previdência do
// Excel, que filtra por "Ano Base". A renda vem dos holerites de Recebimentos;
// os aportes, das movimentações das posições do tipo Previdência.

/** 12% da renda tributável: o teto de dedução das contribuições ao PGBL. */
export const PGBL_DEDUCTION_PERCENT = 12;

export type PensionContribution = {
  id: string;
  occurredOn: IsoDate;
  /** O saldo inicial é a primeira parcela, como na spec 071. */
  kind: "OPENING" | "CONTRIBUTION";
  amountCents: Cents;
  assetName: string;
  institutionName: string;
  accountId: string;
  assetId: string;
};

export type WorkedPeriod = Payslip & { month: Competence };

export type WorkedPeriodRow = WorkedPeriod & {
  days: number;
  dailyRateCents: Cents;
  incomeCents: Cents;
  taxableCents: Cents;
  counted: boolean;
};

export type PensionContributionRow = PensionContribution & {
  number: number;
  /** Aportado no ano até este aporte, inclusive. */
  cumulativeCents: Cents;
  /** O acumulado como parte do limite, em %; nulo sem limite. */
  usagePercent: number | null;
};

/** Trecho da barra do limite: dentro dele (menta) ou acima dele (violeta). */
export type UsageSegment = { id: string; startCents: Cents; endCents: Cents; over: boolean };

export type PensionYear = {
  year: number;
  contributions: PensionContributionRow[];
  periods: WorkedPeriodRow[];
  taxableCents: Cents;
  limitCents: Cents;
  contributedCents: Cents;
  /** Limite menos aportes: positivo é o que falta; negativo, o que passou. */
  remainingCents: Cents;
  /** O aportado como parte do limite, em % inteiro; nulo sem limite. */
  usagePercent: number | null;
  /** Um ou dois trechos por aporte, na ordem; o que passa do limite é `over`. */
  segments: UsageSegment[];
};

/** Quanto do limite já foi usado, em % inteiro; sem limite não há %. */
export function limitUsagePercent(contributedCents: Cents, limitCents: Cents): number | null {
  return limitCents > 0 ? Math.round((contributedCents / limitCents) * 100) : null;
}

/**
 * Divide os aportes em trechos da barra do limite: cada um começa onde o
 * anterior terminou, e a parte que ultrapassa o limite vira um trecho `over`.
 * Sem limite (nenhum holerite no ano) não há o que ultrapassar.
 */
export function usageSegments(amounts: readonly { id: string; amountCents: Cents }[], limitCents: Cents): UsageSegment[] {
  const segments: UsageSegment[] = [];
  let start = 0;

  for (const { id, amountCents } of amounts) {
    const end = start + amountCents;

    if (limitCents <= 0) {
      segments.push({ id, startCents: start, endCents: end, over: false });
    } else {
      if (start < limitCents) {
        segments.push({ id, startCents: start, endCents: Math.min(end, limitCents), over: false });
      }

      if (end > limitCents) {
        segments.push({ id, startCents: Math.max(start, limitCents), endCents: end, over: true });
      }
    }

    start = end;
  }

  return segments;
}

/** Ano da linha do holerite pela data inicial, como `YEAR([Data Inicial])`. */
export function periodYear(period: Pick<WorkedPeriod, "startsOn">) {
  return Number(period.startsOn.slice(0, 4));
}

export function contributionYear(contribution: Pick<PensionContribution, "occurredOn">) {
  return Number(contribution.occurredOn.slice(0, 4));
}

export function deductionLimitCents(taxableCents: Cents): Cents {
  return Math.round((taxableCents * PGBL_DEDUCTION_PERCENT) / 100);
}

/** Anos com aporte ou holerite e o ano atual, do mais recente ao mais antigo. */
export function pensionYears(
  contributions: readonly Pick<PensionContribution, "occurredOn">[],
  periods: readonly Pick<WorkedPeriod, "startsOn">[],
  currentYear: number,
) {
  return [...new Set([currentYear, ...contributions.map(contributionYear), ...periods.map(periodYear)])].sort((a, b) => b - a);
}

export function summarizePensionYear(
  contributions: readonly PensionContribution[],
  periods: readonly WorkedPeriod[],
  year: number,
): PensionYear {
  const ofYear = contributions
    .filter((contribution) => contributionYear(contribution) === year)
    .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.id.localeCompare(b.id));
  const rows = periods
    .filter((period) => periodYear(period) === year)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.endsOn.localeCompare(b.endsOn) || a.id.localeCompare(b.id))
    .map((period) => ({
      ...period,
      days: daysWorked(period.startsOn, period.endsOn),
      dailyRateCents: dailyRateCents(period.grossCents),
      incomeCents: payslipIncomeCents(period),
      taxableCents: taxableIncomeCents(period),
      counted: countsAsTaxable(period.kind),
    }));
  const taxableCents = rows.reduce((sum, row) => sum + row.taxableCents, 0);
  const limitCents = deductionLimitCents(taxableCents);
  const contributedCents = ofYear.reduce((sum, contribution) => sum + contribution.amountCents, 0);
  let running = 0;
  const yearContributions = ofYear.map((contribution, index) => {
    running += contribution.amountCents;
    return { ...contribution, number: index + 1, cumulativeCents: running, usagePercent: limitUsagePercent(running, limitCents) };
  });

  return {
    year,
    contributions: yearContributions,
    periods: rows,
    taxableCents,
    limitCents,
    contributedCents,
    remainingCents: limitCents - contributedCents,
    usagePercent: limitUsagePercent(contributedCents, limitCents),
    segments: usageSegments(ofYear, limitCents),
  };
}
