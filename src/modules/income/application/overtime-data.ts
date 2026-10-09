import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { competenceDate, competenceOf, type Competence } from "@/lib/competence";
import { centsToDecimal, decimalToCents } from "@/lib/money";
import type { IsoDate } from "@/modules/income/domain/income";
import {
  ruleFor,
  sortRules,
  totalsFromDays,
  transcribedHourlyRate,
  type DayType,
  type Hours,
  type OvertimeDay,
  type OvertimePayment,
  type OvertimeRule,
  type OvertimeTotals,
  type PayslipSalary,
} from "@/modules/income/domain/overtime";

// Leitura e gravação comuns das horas extras (spec 098). Sempre pelo cliente de
// Recebimentos (`getIncomeContext`), que confere a concessão e o dono; aqui só
// se convertem as linhas do banco em objetos do domínio e de volta.

type Client = PrismaClient | Prisma.TransactionClient;

const hoursOf = (value: { toString(): string } | null) => (value === null ? null : decimalToCents(value));
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
export const dateOf = (value: IsoDate) => new Date(`${value}T00:00:00.000Z`);
export const hoursDecimal = (hours: Hours) => centsToDecimal(hours);

export type StoredDay = OvertimeDay & { id: string; manualType: boolean; activity: string | null };

export type StoredWorkMonth = {
  id: string;
  month: Competence;
  startsOn: IsoDate;
  endsOn: IsoDate;
  source: "IMPORT" | "MANUAL";
  totals: OvertimeTotals;
  compensated: Hours;
  sourceName: string | null;
  importWarnings: string[];
  note: string | null;
  days: StoredDay[];
};

export async function readOvertimeRules(client: Client): Promise<OvertimeRule[]> {
  const rows = await client.overtimeRule.findMany({ orderBy: { effectiveFrom: "asc" } });

  return rows.map((row) => ({
    id: row.id,
    effectiveFrom: competenceOf(row.effectiveFrom),
    dailyHours: decimalToCents(row.dailyHours),
    weekdayPercent: row.weekdayPercent,
    weekdayBeyondPercent: row.weekdayBeyondPercent,
    saturdayPercent: row.saturdayPercent,
    sundayPercent: row.sundayPercent,
    holidayPercent: row.holidayPercent,
    usualDailyLimit: hoursOf(row.usualDailyLimit),
    exceptionalDailyLimit: hoursOf(row.exceptionalDailyLimit),
    netShortfall: row.netShortfall,
    note: row.note,
  }));
}

export async function readWorkMonths(client: Client): Promise<StoredWorkMonth[]> {
  const rows = await client.overtimeMonth.findMany({
    orderBy: { month: "asc" },
    include: { days: { orderBy: { date: "asc" } } },
  });

  return rows.map((row) => ({
    id: row.id,
    month: competenceOf(row.month),
    startsOn: isoDate(row.startsOn),
    endsOn: isoDate(row.endsOn),
    source: row.source,
    totals: {
      weekday: decimalToCents(row.weekdayHours),
      weekdayBeyond: decimalToCents(row.weekdayBeyondHours),
      saturday: decimalToCents(row.saturdayHours),
      sunday: decimalToCents(row.sundayHours),
      holiday: decimalToCents(row.holidayHours),
      shortfall: decimalToCents(row.shortfallHours),
    },
    compensated: decimalToCents(row.compensatedHours),
    sourceName: row.sourceName,
    importWarnings: row.importWarnings,
    note: row.note,
    days: row.days.map((day) => ({
      id: day.id,
      date: isoDate(day.date),
      hours: decimalToCents(day.hours),
      dayType: day.dayType as DayType,
      manualType: day.manualType,
      activity: day.activity,
    })),
  }));
}

/** Os pagamentos registrados, com o mês de trabalho de cada um. */
export async function readPayments(client: Client): Promise<OvertimePayment[]> {
  const rows = await client.overtimePayment.findMany({
    orderBy: [{ paymentMonth: "asc" }],
    include: { month: { select: { month: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    workMonth: competenceOf(row.month.month),
    paymentMonth: competenceOf(row.paymentMonth),
    lines: [
      { kind: "OVERTIME_50" as const, hours: decimalToCents(row.hours50) },
      { kind: "OVERTIME_75" as const, hours: decimalToCents(row.hours75) },
      { kind: "OVERTIME_100" as const, hours: decimalToCents(row.hours100) },
    ].filter((line) => line.hours > 0),
    note: row.note,
  }));
}

/**
 * A transcrição das horas do holerite dá a hora normal. Sem ela, estima pelo
 * maior bruto do tipo Salário do mês (o da empresa, se houver mais de um), de
 * mês cheio se não é proporcional e o mês não tem férias.
 */
export async function readSalaries(client: Client): Promise<Record<Competence, PayslipSalary>> {
  const rows = await client.incomeMonth.findMany({
    orderBy: { month: "asc" },
    select: {
      month: true,
      payslips: { select: { kind: true, grossSalary: true, prorated: true } },
      hourRecords: { select: { kind: true, paidHours: true, paidAmount: true } },
    },
  });
  const salaries: Record<Competence, PayslipSalary> = {};

  for (const row of rows) {
    const salary = row.payslips.filter((payslip) => payslip.kind === "SALARY").sort((a, b) => b.grossSalary.comparedTo(a.grossSalary))[0];
    const transcribedRate = transcribedHourlyRate(
      row.hourRecords.map((line) => ({ kind: line.kind, hours: line.paidHours ? decimalToCents(line.paidHours) : 0, cents: line.paidAmount ? decimalToCents(line.paidAmount) : 0 })),
    );
    if (!salary && !transcribedRate) continue;

    salaries[competenceOf(row.month)] = {
      grossCents: salary ? decimalToCents(salary.grossSalary) : 0,
      fullMonth: Boolean(salary && !salary.prorated && !row.payslips.some((payslip) => payslip.kind === "VACATION")),
      ...(transcribedRate ? { transcribedRate } : {}),
    };
  }

  return salaries;
}

export function totalsData(totals: OvertimeTotals) {
  return {
    weekdayHours: hoursDecimal(totals.weekday),
    weekdayBeyondHours: hoursDecimal(totals.weekdayBeyond),
    saturdayHours: hoursDecimal(totals.saturday),
    sundayHours: hoursDecimal(totals.sunday),
    holidayHours: hoursDecimal(totals.holiday),
    shortfallHours: hoursDecimal(totals.shortfall),
  };
}

/**
 * Os totais dos meses importados saem dos dias pela jornada da regra do mês:
 * recalcula depois de trocar o tipo de um dia, importar ou mudar as regras.
 */
export async function recomputeImportedTotals(client: Client, onlyMonth?: Competence) {
  const rules = await readOvertimeRules(client);
  const months = await client.overtimeMonth.findMany({
    where: { source: "IMPORT", ...(onlyMonth ? { month: competenceDate(onlyMonth) } : {}) },
    select: { id: true, month: true, days: { select: { date: true, hours: true, dayType: true } } },
  });

  for (const month of months) {
    const rule = ruleFor(competenceOf(month.month), sortRules(rules));
    const totals = totalsFromDays(
      month.days.map((day) => ({ date: isoDate(day.date), hours: decimalToCents(day.hours), dayType: day.dayType as DayType })),
      rule.dailyHours,
    );
    await client.overtimeMonth.updateMany({ where: { id: month.id }, data: totalsData(totals) });
  }
}
