import type { Competence } from "@/lib/competence";
import type { Cents } from "@/lib/money";

// Recebimentos (spec 088): entradas, saídas e holerites de cada mês, como a
// tabela de entradas e saídas e a aba Previdência do Excel. Tudo em centavos.
// Os totais e o balanço são derivados aqui e nunca guardados no banco.

/** Data no formato AAAA-MM-DD. */
export type IsoDate = string;

export const PAYSLIP_KINDS = ["SALARY", "VACATION", "THIRTEENTH", "PROFIT_SHARING", "OTHER"] as const;
export type PayslipKind = (typeof PAYSLIP_KINDS)[number];

/** Nomes padrão das linhas do holerite; "Outro" pede um nome livre. */
export const PAYSLIP_KIND_LABELS: Record<PayslipKind, string> = {
  SALARY: "Salário",
  VACATION: "Férias",
  THIRTEENTH: "13º salário",
  PROFIT_SHARING: "PLR",
  OTHER: "Outro",
};

/**
 * 13º salário e PLR têm tributação exclusiva na fonte: não entram na renda
 * tributável que define o limite de 12% do PGBL (spec 089).
 */
export function countsAsTaxable(kind: PayslipKind) {
  return kind !== "THIRTEENTH" && kind !== "PROFIT_SHARING";
}

/** Os valores digitados do mês; nulo é campo não lançado, diferente de zero. */
export type IncomeValues = {
  netIncomeCents: Cents | null;
  mealVoucherCents: Cents | null;
  cardSpendCents: Cents | null;
  pixSpendCents: Cents | null;
  mealVoucherSpendCents: Cents | null;
};

export const INCOME_VALUE_KEYS = [
  "netIncomeCents",
  "mealVoucherCents",
  "cardSpendCents",
  "pixSpendCents",
  "mealVoucherSpendCents",
] as const satisfies readonly (keyof IncomeValues)[];

export type Payslip = {
  id: string;
  kind: PayslipKind;
  label: string | null;
  employer: string;
  startsOn: IsoDate;
  endsOn: IsoDate;
  grossCents: Cents;
  prorated: boolean;
};

export type IncomeMonth = IncomeValues & {
  id: string;
  month: Competence;
  payslips: Payslip[];
};

export type MonthTotals = {
  incomeCents: Cents;
  spendCents: Cents;
  balanceCents: Cents;
  /** Soma da renda das linhas do holerite, de todos os tipos. */
  grossCents: Cents;
  /** Algum valor de entrada ou saída foi lançado. */
  hasValues: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): value is IsoDate {
  const match = ISO_DATE.exec(value);

  if (!match) {
    return false;
  }

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

function utc(date: IsoDate) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Primeiro e último dia do mês, AAAA-MM-DD. */
export function monthBounds(month: Competence): { first: IsoDate; last: IsoDate } {
  const [year, number] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(last).padStart(2, "0")}` };
}

/** Dias trabalhados, contando o início e o fim, como `DAYS(fim; início) + 1`. */
export function daysWorked(startsOn: IsoDate, endsOn: IsoDate) {
  return Math.round((utc(endsOn) - utc(startsOn)) / DAY_MS) + 1;
}

/** O período cobre o mês inteiro, do dia 1 ao último. */
export function coversWholeMonth(month: Competence, startsOn: IsoDate, endsOn: IsoDate) {
  const bounds = monthBounds(month);
  return startsOn === bounds.first && endsOn === bounds.last;
}

/** Salário por dia, com o mês comercial de 30 dias da planilha. */
export function dailyRateCents(grossCents: Cents): Cents {
  return Math.round(grossCents / 30);
}

/**
 * Renda da linha: proporcional, dias × bruto ÷ 30, quando "Necessário
 * calcular"; senão, o bruto inteiro. Arredonda por linha, como a planilha
 * mostra (R$ 218,83 de 2 dias de R$ 3.282,50).
 */
export function payslipIncomeCents(payslip: Pick<Payslip, "grossCents" | "prorated" | "startsOn" | "endsOn">): Cents {
  if (!payslip.prorated) {
    return payslip.grossCents;
  }

  return Math.round((payslip.grossCents * daysWorked(payslip.startsOn, payslip.endsOn)) / 30);
}

/** Renda que entra na base dos 12%: a da linha, salvo 13º e PLR. */
export function taxableIncomeCents(payslip: Pick<Payslip, "kind" | "grossCents" | "prorated" | "startsOn" | "endsOn">): Cents {
  return countsAsTaxable(payslip.kind) ? payslipIncomeCents(payslip) : 0;
}

/** Nome da linha: o nome livre ou o do tipo. */
export function payslipName(payslip: Pick<Payslip, "kind" | "label">) {
  return payslip.label?.trim() || PAYSLIP_KIND_LABELS[payslip.kind];
}

export function monthTotals(month: IncomeValues & { payslips: readonly Payslip[] }): MonthTotals {
  const value = (cents: Cents | null) => cents ?? 0;
  const incomeCents = value(month.netIncomeCents) + value(month.mealVoucherCents);
  const spendCents = value(month.cardSpendCents) + value(month.pixSpendCents) + value(month.mealVoucherSpendCents);

  return {
    incomeCents,
    spendCents,
    balanceCents: incomeCents - spendCents,
    grossCents: month.payslips.reduce((sum, payslip) => sum + payslipIncomeCents(payslip), 0),
    hasValues: INCOME_VALUE_KEYS.some((key) => month[key] !== null),
  };
}

export type YearSummary = {
  year: number;
  months: (IncomeMonth & { totals: MonthTotals })[];
  totals: { incomeCents: Cents; spendCents: Cents; balanceCents: Cents; grossCents: Cents };
};

export function yearOf(month: Competence) {
  return Number(month.slice(0, 4));
}

/** Anos com meses lançados e o ano atual, do mais recente ao mais antigo. */
export function incomeYears(months: readonly Pick<IncomeMonth, "month">[], currentYear: number) {
  return [...new Set([currentYear, ...months.map((month) => yearOf(month.month))])].sort((a, b) => b - a);
}

export function summarizeYear(months: readonly IncomeMonth[], year: number): YearSummary {
  const selected = months
    .filter((month) => yearOf(month.month) === year)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((month) => ({ ...month, totals: monthTotals(month) }));

  return {
    year,
    months: selected,
    totals: selected.reduce(
      (sum, month) => ({
        incomeCents: sum.incomeCents + month.totals.incomeCents,
        spendCents: sum.spendCents + month.totals.spendCents,
        balanceCents: sum.balanceCents + month.totals.balanceCents,
        grossCents: sum.grossCents + month.totals.grossCents,
      }),
      { incomeCents: 0, spendCents: 0, balanceCents: 0, grossCents: 0 },
    ),
  };
}

export type PayslipProblem = "employer" | "label" | "gross" | "dates" | "order" | "outside";

/**
 * Confere uma linha do holerite: empresa, nome no tipo Outro, bruto positivo
 * e o período dentro do mês do registro, com o fim depois do início.
 */
export function payslipProblem(
  month: Competence,
  payslip: Pick<Payslip, "kind" | "label" | "employer" | "startsOn" | "endsOn" | "grossCents">,
): PayslipProblem | null {
  if (payslip.employer.trim() === "") return "employer";
  if (payslip.kind === "OTHER" && !payslip.label?.trim()) return "label";
  if (!(payslip.grossCents > 0)) return "gross";
  if (!isIsoDate(payslip.startsOn) || !isIsoDate(payslip.endsOn)) return "dates";
  if (payslip.endsOn < payslip.startsOn) return "order";

  const bounds = monthBounds(month);
  if (payslip.startsOn < bounds.first || payslip.endsOn > bounds.last) return "outside";

  return null;
}

export const PAYSLIP_PROBLEMS: Record<PayslipProblem, string> = {
  employer: "Informe a empresa de cada holerite.",
  label: "Dê um nome ao holerite do tipo Outro.",
  gross: "Informe um salário bruto maior que zero.",
  dates: "Informe o início e o fim de cada holerite.",
  order: "O fim do período vem antes do início.",
  outside: "O período do holerite precisa estar dentro do mês.",
};
