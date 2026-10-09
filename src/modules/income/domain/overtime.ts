import { addCompetenceMonths, type Competence } from "@/lib/competence";
import type { Cents } from "@/lib/money";
import type { IsoDate } from "@/modules/income/domain/income";
import type { HourKind } from "@/modules/income/domain/income-hours";
import { addDays, easterSunday, isBusinessDay } from "@/modules/portfolio/domain/business-days";

// Horas extras (spec 098). Duas competências que não se misturam:
//
// - o mês de trabalho é a folha de horas que o usuário envia à empresa, do dia
//   de corte do mês anterior ao do mês (21/02 a 21/03 é março);
// - o pagamento vem no holerite do mês seguinte (março → abril), pago no começo
//   do outro mês. Antes desse prazo a hora está "a vencer", nunca "não paga".
//
// O usuário declara as horas do mês (a folha) e, quando recebe o holerite,
// registra quantas horas dele o holerite pagou em cada adicional. Horas são
// inteiros em centésimos (9 h = 900), como o dinheiro em centavos. O valor e o
// DSR não são digitados: saem do salário bruto do holerite em Recebimentos e do
// calendário do mês dele, como a folha da empresa calcula (conferido com os
// holerites de 2026). A conciliação é derivada aqui, nunca guardada. Os
// adicionais vêm das regras do usuário; sem regra, vale o piso da CLT (decisão
// do usuário em 2026-10-08).

/** Horas × 100: 9 h = 900, 173,33 h = 17333. */
export type Hours = number;

/** O holerite das horas trabalhadas num mês é o do mês seguinte. */
export const PAYMENT_LAG_MONTHS = 1;

/** Art. 59 da CLT: a jornada pode ser prorrogada em até 2 horas por dia. */
export const CLT_DAILY_OVERTIME_LIMIT: Hours = 200;

export const MAX_DAY_HOURS: Hours = 2400;
/** Teto das horas de um mês: 31 dias de 24 h. */
export const MAX_MONTH_OVERTIME: Hours = 74400;

export const DAY_TYPES = ["WORKDAY", "SATURDAY", "SUNDAY", "HOLIDAY"] as const;
export type DayType = (typeof DAY_TYPES)[number];

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  WORKDAY: "Dia útil",
  SATURDAY: "Sábado",
  SUNDAY: "Domingo",
  HOLIDAY: "Feriado",
};

/** As faixas das horas a mais, cada uma com o seu adicional na regra. */
export const OVERTIME_CATEGORIES = ["weekday", "weekdayBeyond", "saturday", "sunday", "holiday"] as const;
export type OvertimeCategory = (typeof OVERTIME_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<OvertimeCategory, string> = {
  weekday: "Dia útil, até 2 h/dia",
  weekdayBeyond: "Dia útil, além de 2 h/dia",
  saturday: "Sábado",
  sunday: "Domingo",
  holiday: "Feriado",
};

export type OvertimeTotals = Record<OvertimeCategory, Hours> & {
  /** Horas abaixo da jornada em dias úteis com algum trabalho (informativo). */
  shortfall: Hours;
};

export const EMPTY_TOTALS: OvertimeTotals = { weekday: 0, weekdayBeyond: 0, saturday: 0, sunday: 0, holiday: 0, shortfall: 0 };

/** Soma das horas a mais do mês, sem a falta. */
export function overtimeHours(totals: OvertimeTotals) {
  return OVERTIME_CATEGORIES.reduce((sum, category) => sum + totals[category], 0);
}

// ---------------------------------------------------------------- regras

export type OvertimeRule = {
  id: string | null;
  /** Competência de trabalho a partir da qual a versão vale; nula no piso padrão. */
  effectiveFrom: Competence | null;
  dailyHours: Hours;
  weekdayPercent: number;
  weekdayBeyondPercent: number;
  saturdayPercent: number;
  sundayPercent: number;
  holidayPercent: number;
  /**
   * Horas extras por dia útil que a empresa aceita normalmente e na exceção. Só
   * registram a regra da empresa: não mudam as horas nem o valor.
   */
  usualDailyLimit: Hours | null;
  exceptionalDailyLimit: Hours | null;
  /** Desconta das extras do mês as horas abaixo da jornada. */
  netShortfall: boolean;
  note: string | null;
};

/**
 * Piso legal, sem convenção: 50% em dia útil e no sábado (art. 59 da CLT e
 * art. 7º, XVI, da Constituição), 100% no domingo e no feriado não compensados
 * (Lei 605/49 e Súmula 146 do TST). Não é a regra da empresa: é o mínimo.
 */
export const CLT_FLOOR_RULE: OvertimeRule = {
  id: null,
  effectiveFrom: null,
  dailyHours: 800,
  weekdayPercent: 50,
  weekdayBeyondPercent: 50,
  saturdayPercent: 50,
  sundayPercent: 100,
  holidayPercent: 100,
  usualDailyLimit: null,
  exceptionalDailyLimit: null,
  netShortfall: false,
  note: null,
};

export const MAX_PERCENT = 300;

export function categoryPercent(rule: OvertimeRule, category: OvertimeCategory) {
  switch (category) {
    case "weekday":
      return rule.weekdayPercent;
    case "weekdayBeyond":
      return rule.weekdayBeyondPercent;
    case "saturday":
      return rule.saturdayPercent;
    case "sunday":
      return rule.sundayPercent;
    case "holiday":
      return rule.holidayPercent;
  }
}

/** Versões da mais antiga à mais nova. */
export function sortRules(rules: readonly OvertimeRule[]) {
  return [...rules].sort((a, b) => (a.effectiveFrom ?? "").localeCompare(b.effectiveFrom ?? ""));
}

/** A versão mais recente que já vale no mês; antes de todas, o piso da CLT. */
export function ruleFor(month: Competence, rules: readonly OvertimeRule[]): OvertimeRule {
  let found: OvertimeRule | null = null;

  for (const rule of sortRules(rules)) {
    if (rule.effectiveFrom !== null && rule.effectiveFrom <= month) {
      found = rule;
    }
  }

  return found ?? CLT_FLOOR_RULE;
}

// ---------------------------------------------------------------- dias

const weekdayOf = (date: IsoDate) => new Date(`${date}T00:00:00.000Z`).getUTCDay();

const laborHolidayCache = new Map<number, Set<IsoDate>>();

/**
 * Feriados de quem trabalha na cidade de São Paulo: os nacionais da lei (Leis
 * 662/49, 6.802/80 e 14.759/23), a Sexta-feira Santa, o 9 de julho do estado e
 * o 25 de janeiro e o Corpus Christi da cidade. A folha da empresa conta os de
 * São Paulo: o DSR de junho e de julho de 2026 só fecha com Corpus Christi e
 * 09/07 como feriados, e o usuário confirmou 09/07. Carnaval é ponto
 * facultativo e fica como dia útil.
 */
export function laborHolidays(year: number) {
  const cached = laborHolidayCache.get(year);

  if (cached) {
    return cached;
  }

  const fixed = ["01-01", "01-25", "04-21", "05-01", "07-09", "09-07", "10-12", "11-02", "11-15", "12-25"];

  if (year >= 2024) {
    fixed.push("11-20");
  }

  const easter = easterSunday(year);
  const holidays = new Set([...fixed.map((day) => `${year}-${day}`), addDays(easter, -2), addDays(easter, 60)]);
  laborHolidayCache.set(year, holidays);
  return holidays;
}

/** O tipo pelo calendário: fim de semana, feriado ou dia útil. */
export function defaultDayType(date: IsoDate): DayType {
  const weekday = weekdayOf(date);

  if (laborHolidays(Number(date.slice(0, 4))).has(date)) return "HOLIDAY";
  if (weekday === 0) return "SUNDAY";
  if (weekday === 6) return "SATURDAY";
  return "WORKDAY";
}

/**
 * Dias úteis que costumam ser folga ou ponto facultativo. Não mudam o tipo do
 * dia; o nome aparece na lista de dias para o usuário marcar, se for o caso.
 */
export function optionalDayName(date: IsoDate): string | null {
  const year = Number(date.slice(0, 4));
  const easter = easterSunday(year);
  const named: Record<string, string> = {
    [addDays(easter, -48)]: "Carnaval",
    [addDays(easter, -47)]: "Carnaval",
    [addDays(easter, -46)]: "Quarta-feira de Cinzas",
    [`${year}-12-24`]: "véspera de Natal",
    [`${year}-12-31`]: "véspera de Ano-Novo",
  };

  return named[date] ?? null;
}

export type OvertimeDay = {
  date: IsoDate;
  /** Todas as horas trabalhadas no dia. */
  hours: Hours;
  dayType: DayType;
};

/** As horas a mais de um dia e a falta, pela jornada da regra. */
export function dayOvertime(day: OvertimeDay, dailyHours: Hours) {
  if (day.dayType !== "WORKDAY") {
    return { extra: day.hours, shortfall: 0 };
  }

  return {
    extra: Math.max(0, day.hours - dailyHours),
    shortfall: day.hours > 0 && day.hours < dailyHours ? dailyHours - day.hours : 0,
  };
}

/** Os totais do mês a partir dos dias da folha. */
export function totalsFromDays(days: readonly OvertimeDay[], dailyHours: Hours): OvertimeTotals {
  const totals = { ...EMPTY_TOTALS };

  for (const day of days) {
    const { extra, shortfall } = dayOvertime(day, dailyHours);

    switch (day.dayType) {
      case "WORKDAY":
        totals.weekday += Math.min(extra, CLT_DAILY_OVERTIME_LIMIT);
        totals.weekdayBeyond += Math.max(0, extra - CLT_DAILY_OVERTIME_LIMIT);
        totals.shortfall += shortfall;
        break;
      case "SATURDAY":
        totals.saturday += extra;
        break;
      case "SUNDAY":
        totals.sunday += extra;
        break;
      case "HOLIDAY":
        totals.holiday += extra;
        break;
    }
  }

  return totals;
}

/** Ordem em que a compensação abate as horas: as de menor adicional primeiro. */
const DEDUCTION_ORDER: readonly OvertimeCategory[] = ["weekday", "saturday", "weekdayBeyond", "sunday", "holiday"];

/**
 * Horas a receber por faixa: as extras menos as compensadas com folga e, se a
 * regra manda, menos as horas abaixo da jornada do mês.
 */
export function payableByCategory(totals: OvertimeTotals, compensated: Hours, rule: OvertimeRule) {
  const byCategory = Object.fromEntries(OVERTIME_CATEGORIES.map((category) => [category, totals[category]])) as Record<
    OvertimeCategory,
    Hours
  >;
  let deduction = compensated + (rule.netShortfall ? totals.shortfall : 0);

  for (const category of DEDUCTION_ORDER) {
    const take = Math.min(deduction, byCategory[category]);
    byCategory[category] -= take;
    deduction -= take;
  }

  return byCategory;
}

// ---------------------------------------------------------------- pagamentos

export const OVERTIME_PAY_KINDS = ["OVERTIME_50", "OVERTIME_75", "OVERTIME_100"] as const;
export type OvertimePayKind = (typeof OVERTIME_PAY_KINDS)[number];

export const PAY_KIND_PERCENT: Record<OvertimePayKind, number> = {
  OVERTIME_50: 50,
  OVERTIME_75: 75,
  OVERTIME_100: 100,
};

export type PaymentLine = { kind: OvertimePayKind; hours: Hours };

/**
 * O que um holerite pagou de um mês de trabalho, em horas por adicional,
 * registrado pelo usuário quando recebe o holerite. Um mês pode ter mais de um
 * (o do holerite seguinte e uma regularização depois).
 */
export type OvertimePayment = {
  id: string;
  workMonth: Competence;
  paymentMonth: Competence;
  lines: PaymentLine[];
  note: string | null;
};

export type WorkMonth = {
  id: string;
  month: Competence;
  startsOn: IsoDate;
  endsOn: IsoDate;
  totals: OvertimeTotals;
  compensated: Hours;
};

export type PaymentTiming = "onTime" | "late" | "early";

export const TIMING_LABELS: Record<PaymentTiming, string> = { onTime: "no prazo", late: "com atraso", early: "adiantado" };

export type WorkStatus = "NONE" | "PAID" | "PAID_LATE" | "PARTIAL" | "OVERDUE" | "UPCOMING";

export const STATUS_LABELS: Record<WorkStatus, string> = {
  NONE: "Sem extras",
  PAID: "Pago",
  PAID_LATE: "Pago com atraso",
  PARTIAL: "Pago em parte",
  OVERDUE: "Não pago",
  UPCOMING: "A vencer",
};

/** O holerite em que as horas do mês de trabalho deveriam vir. */
export function duePaymentMonth(workMonth: Competence) {
  return addCompetenceMonths(workMonth, PAYMENT_LAG_MONTHS);
}

/** No holerite esperado, num holerite depois (regularização) ou antes. */
export function paymentTiming(workMonth: Competence, paymentMonth: Competence): PaymentTiming {
  const due = duePaymentMonth(workMonth);
  return paymentMonth === due ? "onTime" : paymentMonth > due ? "late" : "early";
}

/**
 * Prazo do holerite: o 5º dia útil do mês seguinte a ele (art. 459, § 1º, da
 * CLT), contando segunda a sexta sem os feriados nacionais.
 */
export function paymentDeadline(paymentMonth: Competence): IsoDate {
  let day = `${addCompetenceMonths(paymentMonth, 1)}-01`;
  let count = 0;

  for (;;) {
    if (isBusinessDay(day)) {
      count += 1;
      if (count === 5) return day;
    }
    day = addDays(day, 1);
  }
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

export const paymentHours = (payment: Pick<OvertimePayment, "lines">) => sum(payment.lines.map((line) => line.hours));

// ---------------------------------------------------------------- valores

/**
 * O salário de um holerite em Recebimentos: o bruto da linha de salário (total
 * de vencimentos, com as extras e o DSR que ele pagou) e se é de mês cheio. Mês
 * com férias ou proporcional não serve para estimar a hora normal pelo bruto;
 * a transcrição da hora normal ou das extras continua válida nesses meses.
 */
export type PayslipSalary = { grossCents: Cents; fullMonth: boolean; transcribedRate?: TranscribedHourlyRate };

export type TranscribedHourlyRate = { cents: number; source: "normal" | "overtime" };

/** A transcrição do holerite dá a base sem depender das horas atribuídas a cada mês de trabalho. */
export function transcribedHourlyRate(lines: readonly { kind: HourKind; hours: Hours; cents: Cents }[]): TranscribedHourlyRate | null {
  const valued = lines.filter((line) => line.hours > 0 && line.cents > 0);
  const normal = valued.find((line) => line.kind === "NORMAL");

  if (normal) return { cents: (normal.cents * 100) / normal.hours, source: "normal" };

  const extra = valued.filter((line) => line.kind !== "NORMAL");
  const weightedHours = sum(extra.map((line) => (line.hours / 100) * (1 + PAY_KIND_PERCENT[line.kind as OvertimePayKind] / 100)));
  return weightedHours > 0 ? { cents: sum(extra.map((line) => line.cents)) / weightedHours, source: "overtime" } : null;
}

/** Divisor do salário em horas: a jornada diária × 25 (8 h por dia, 40 h por semana → 200 h; art. 64 da CLT). */
export function monthlyHours(rule: OvertimeRule): Hours {
  return rule.dailyHours * 25;
}

const dsrCache = new Map<Competence, { rest: number; work: number }>();

/**
 * Os dias do mês do holerite para o DSR das extras: domingos e feriados
 * (descanso) contra os demais, sábado incluído. O DSR é o valor das extras ÷
 * dias úteis × dias de descanso (Lei 605/49), como nos holerites de 2026.
 */
export function dsrDays(month: Competence) {
  const cached = dsrCache.get(month);
  if (cached) return cached;

  const holidays = laborHolidays(Number(month.slice(0, 4)));
  const days = { rest: 0, work: 0 };

  for (let date = `${month}-01`; date.startsWith(month); date = addDays(date, 1)) {
    if (weekdayOf(date) === 0 || holidays.has(date)) days.rest += 1;
    else days.work += 1;
  }

  dsrCache.set(month, days);
  return days;
}

/** A hora normal (centavos por hora, com fração) e o holerite cujo salário a deu. */
export type HourlyRate = { cents: number; month: Competence; source: "normal" | "overtime" | "gross" };

/**
 * A hora normal vem primeiro da linha normal transcrita do holerite, depois
 * das extras transcritas (valor ÷ horas ponderadas pelos adicionais). Essa
 * base é estável mesmo quando os pagamentos ainda não foram todos atribuídos.
 * Sem transcrição, estima pelo salário bruto em Recebimentos: o bruto é o
 * salário (divisor × hora) mais as extras que o holerite pagou e o
 * DSR delas, então a hora é bruto ÷ (divisor + horas pagas × (1 + adicional) ×
 * (1 + descanso ÷ úteis)). É uma estimativa: outras verbas e pagamentos ainda
 * não atribuídos afetam o resultado. Sem transcrição nem salário de mês
 * cheio, usa a hora do anterior que tem (ou do primeiro, antes de todos).
 */
export function hourlyRates({
  salaries,
  payments,
  rules,
}: {
  salaries: Readonly<Record<Competence, PayslipSalary>>;
  payments: readonly Pick<OvertimePayment, "paymentMonth" | "lines">[];
  rules: readonly OvertimeRule[];
}) {
  const known = Object.entries(salaries)
    .filter(([, salary]) => salary.transcribedRate || (salary.fullMonth && salary.grossCents > 0))
    .map(([month, salary]): HourlyRate => {
      if (salary.transcribedRate) return { ...salary.transcribedRate, month };

      const weighted = sum(
        payments
          .filter((payment) => payment.paymentMonth === month)
          .flatMap((payment) => payment.lines)
          .map((line) => (line.hours / 100) * (1 + PAY_KIND_PERCENT[line.kind] / 100)),
      );
      const { rest, work } = dsrDays(month);
      return { cents: salary.grossCents / (monthlyHours(ruleFor(month, rules)) / 100 + weighted * (1 + rest / work)), month, source: "gross" };
    })
    .sort((a, b) => a.month.localeCompare(b.month));

  return (month: Competence): HourlyRate | null => known.filter((rate) => rate.month <= month).at(-1) ?? known[0] ?? null;
}

export type PaymentValue = {
  /** Valor de cada linha: horas × hora normal × (1 + adicional), em centavos. */
  lines: (PaymentLine & { cents: Cents })[];
  amountCents: Cents;
  dsrCents: Cents;
};

/** O valor de um pagamento pela hora normal e o DSR pelo calendário do holerite. */
export function paymentValue(lines: readonly PaymentLine[], paymentMonth: Competence, rate: HourlyRate | null): PaymentValue | null {
  if (!rate) return null;

  const valued = lines.map((line) => ({ ...line, cents: Math.round((line.hours / 100) * rate.cents * (1 + PAY_KIND_PERCENT[line.kind] / 100)) }));
  const amountCents = sum(valued.map((line) => line.cents));
  const { rest, work } = dsrDays(paymentMonth);
  return { lines: valued, amountCents, dsrCents: Math.round((amountCents * rest) / work) };
}

export type PaymentView = OvertimePayment & {
  hours: Hours;
  timing: PaymentTiming;
  rate: HourlyRate | null;
  /** Valor das horas e DSR; nulos sem nenhum salário em Recebimentos. */
  amountCents: Cents | null;
  dsrCents: Cents | null;
};

export type WorkMonthView = {
  id: string;
  month: Competence;
  startsOn: IsoDate;
  endsOn: IsoDate;
  rule: OvertimeRule;
  totals: OvertimeTotals;
  worked: Hours;
  compensated: Hours;
  payable: Hours;
  payableByCategory: Record<OvertimeCategory, Hours>;
  dueMonth: Competence;
  deadline: IsoDate;
  payments: PaymentView[];
  paid: Hours;
  paidLate: Hours;
  open: Hours;
  /** Horas pagas além das declaradas. */
  overpaid: Hours;
  status: WorkStatus;
  /** A hora normal do holerite esperado, para o valor estimado. */
  rate: HourlyRate | null;
  estimatedCents: Cents | null;
  receivedCents: Cents | null;
  dsrCents: Cents;
  /** Valor estimado das horas em aberto. */
  openValueCents: Cents | null;
};

export type OvertimeReconciliation = {
  months: WorkMonthView[];
};

/**
 * A conciliação, mês de trabalho por mês de trabalho: o que foi declarado, o
 * que cada pagamento registrado pagou (no prazo, depois ou antes) e o que falta.
 * Nenhum mês vira "não pago" antes do prazo do holerite seguinte. Os valores
 * saem da hora normal de cada holerite (`hourlyRates`).
 */
export function reconcileOvertime({
  workMonths,
  payments,
  rules,
  salaries = {},
  today,
}: {
  workMonths: readonly WorkMonth[];
  payments: readonly OvertimePayment[];
  rules: readonly OvertimeRule[];
  /** O salário bruto de cada holerite em Recebimentos. */
  salaries?: Readonly<Record<Competence, PayslipSalary>>;
  today: IsoDate;
}): OvertimeReconciliation {
  const rateFor = hourlyRates({ salaries, payments, rules });

  const viewOf = (payment: OvertimePayment): PaymentView => {
    const rate = rateFor(payment.paymentMonth);
    const value = paymentValue(payment.lines, payment.paymentMonth, rate);
    return {
      ...payment,
      hours: paymentHours(payment),
      timing: paymentTiming(payment.workMonth, payment.paymentMonth),
      rate,
      amountCents: value?.amountCents ?? null,
      dsrCents: value?.dsrCents ?? null,
    };
  };

  const months = [...workMonths]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((month): WorkMonthView => {
      const rule = ruleFor(month.month, rules);
      const byCategory = payableByCategory(month.totals, month.compensated, rule);
      const payable = sum(Object.values(byCategory));
      const own = payments
        .filter((payment) => payment.workMonth === month.month)
        .sort((a, b) => a.paymentMonth.localeCompare(b.paymentMonth))
        .map(viewOf);
      const paid = sum(own.map((payment) => payment.hours));
      const paidLate = sum(own.filter((payment) => payment.timing === "late").map((payment) => payment.hours));
      const open = Math.max(0, payable - paid);
      const dueMonth = duePaymentMonth(month.month);
      const deadline = paymentDeadline(dueMonth);
      const status: WorkStatus =
        payable === 0 ? "NONE" : open === 0 ? (paidLate > 0 ? "PAID_LATE" : "PAID") : today <= deadline ? "UPCOMING" : paid > 0 ? "PARTIAL" : "OVERDUE";
      const rate = rateFor(dueMonth);
      const estimatedCents =
        rate === null
          ? null
          : Math.round(sum(OVERTIME_CATEGORIES.map((category) => (byCategory[category] / 100) * rate.cents * (1 + categoryPercent(rule, category) / 100))));
      const amounts = own.map((payment) => payment.amountCents);

      return {
        id: month.id,
        month: month.month,
        startsOn: month.startsOn,
        endsOn: month.endsOn,
        rule,
        totals: month.totals,
        worked: overtimeHours(month.totals),
        compensated: month.compensated,
        payable,
        payableByCategory: byCategory,
        dueMonth,
        deadline,
        payments: own,
        paid,
        paidLate,
        open,
        overpaid: Math.max(0, paid - payable),
        status,
        rate,
        estimatedCents,
        receivedCents: amounts.some((amount) => amount === null) ? null : sum(amounts.map((amount) => amount ?? 0)),
        dsrCents: sum(own.map((payment) => payment.dsrCents ?? 0)),
        openValueCents: estimatedCents === null || payable === 0 ? null : Math.round((estimatedCents * open) / payable),
      };
    });

  return { months };
}

export type OvertimeSummary = {
  worked: Hours;
  payable: Hours;
  paid: Hours;
  overdue: Hours;
  awaiting: Hours;
  estimatedCents: Cents;
  receivedCents: Cents;
  dsrCents: Cents;
  overdueValueCents: Cents;
  awaitingValueCents: Cents;
  overdueMonths: number;
  /** O primeiro holerite ainda esperado, para "previsto em". */
  nextDue: Competence | null;
};

const OVERDUE_STATUSES: readonly WorkStatus[] = ["OVERDUE", "PARTIAL"];

export function isOverdue(status: WorkStatus) {
  return OVERDUE_STATUSES.includes(status);
}

/** Os números dos cards: somas dos meses de trabalho escolhidos. */
export function summarizeOvertime(months: readonly WorkMonthView[]): OvertimeSummary {
  const overdue = months.filter((month) => OVERDUE_STATUSES.includes(month.status));
  const awaiting = months.filter((month) => month.status === "UPCOMING");

  return {
    worked: sum(months.map((month) => month.worked)),
    payable: sum(months.map((month) => month.payable)),
    paid: sum(months.map((month) => month.paid)),
    overdue: sum(overdue.map((month) => month.open)),
    awaiting: sum(awaiting.map((month) => month.open)),
    estimatedCents: sum(months.map((month) => month.estimatedCents ?? 0)),
    receivedCents: sum(months.map((month) => month.receivedCents ?? 0)),
    dsrCents: sum(months.map((month) => month.dsrCents)),
    overdueValueCents: sum(overdue.map((month) => month.openValueCents ?? 0)),
    awaitingValueCents: sum(awaiting.map((month) => month.openValueCents ?? 0)),
    overdueMonths: overdue.length,
    nextDue: awaiting.map((month) => month.dueMonth).sort()[0] ?? null,
  };
}

// ---------------------------------------------------------------- texto

/** "9 h", "9,5 h", "173,33 h"; com sinal quando pedido. */
export function formatHours(hours: Hours, { signed = false, unit = true }: { signed?: boolean; unit?: boolean } = {}) {
  const absolute = Math.abs(hours);
  const text = (absolute / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const sign = hours < 0 ? "−" : signed && hours > 0 ? "+" : "";
  return `${sign}${text}${unit ? " h" : ""}`;
}

/** Horas digitadas: "9", "9,5", "9.5" ou "9:30". Vazio é nulo; inválido, NaN. */
export function parseHoursInput(text: string): Hours | null {
  const value = text.trim().replace(/\s*h(oras?)?$/i, "");

  if (value === "") {
    return null;
  }

  const clock = /^(\d{1,3}):([0-5]\d)$/.exec(value);

  if (clock) {
    return Number(clock[1]) * 100 + Math.round((Number(clock[2]) * 100) / 60);
  }

  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(value)) {
    return Number.NaN;
  }

  return Math.round(Number(value.replace(",", ".")) * 100);
}

/** Horas no campo do formulário: "9,5". */
export function formatHoursInput(hours: Hours) {
  return formatHours(hours, { unit: false });
}

/** "21/02 a 21/03". */
export function formatPeriod(startsOn: IsoDate, endsOn: IsoDate) {
  const short = (date: IsoDate) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
  return `${short(startsOn)} a ${short(endsOn)}`;
}

/** "21/02". */
export function formatDayMonth(date: IsoDate) {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function weekdayShort(date: IsoDate) {
  return WEEKDAY_SHORT[weekdayOf(date)];
}
