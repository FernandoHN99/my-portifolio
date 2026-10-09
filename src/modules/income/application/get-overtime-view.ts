import { currentCompetence, type Competence } from "@/lib/competence";
import { getIncomeDb } from "@/modules/income/application/income-db";
import { readOvertimeRules, readPayments, readSalaries, readWorkMonths, type StoredDay } from "@/modules/income/application/overtime-data";
import type { IsoDate } from "@/modules/income/domain/income";
import {
  dayOvertime,
  optionalDayName,
  reconcileOvertime,
  ruleFor,
  type Hours,
  type OvertimeRule,
  type PayslipSalary,
  type WorkMonthView,
} from "@/modules/income/domain/overtime";

export type OvertimeDayView = StoredDay & {
  /** Horas a mais do dia e falta em relação à jornada. */
  extra: Hours;
  shortfall: Hours;
  /** Ponto facultativo ou feriado regional comum nesta data. */
  hint: string | null;
};

export type OvertimeMonthView = WorkMonthView & {
  source: "IMPORT" | "MANUAL";
  sourceName: string | null;
  note: string | null;
  days: OvertimeDayView[];
};

export type OvertimeView = {
  months: OvertimeMonthView[];
  rules: OvertimeRule[];
  /** O salário bruto de cada holerite em Recebimentos, para o formulário calcular os valores. */
  salaries: Record<Competence, PayslipSalary>;
  currentCompetence: Competence;
  today: IsoDate;
};

/** "AAAA-MM-DD" no relógio local, como a competência corrente. */
export function localToday(now = new Date()): IsoDate {
  return `${currentCompetence(now)}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Tudo o que a aba Horas extras mostra: os meses declarados com os pagamentos e a conciliação. */
export async function getOvertimeView(now = new Date()): Promise<OvertimeView> {
  const prisma = await getIncomeDb();
  const [rules, stored, payments, salaries] = await Promise.all([readOvertimeRules(prisma), readWorkMonths(prisma), readPayments(prisma), readSalaries(prisma)]);
  const today = localToday(now);
  const reconciliation = reconcileOvertime({ workMonths: stored, payments, rules, salaries, today });
  const byMonth = new Map(stored.map((month) => [month.month, month]));

  return {
    months: reconciliation.months.map((view) => {
      const month = byMonth.get(view.month)!;
      const rule = ruleFor(view.month, rules);

      return {
        ...view,
        source: month.source,
        sourceName: month.sourceName,
        note: month.note,
        days: month.days.map((day) => ({ ...day, ...dayOvertime(day, rule.dailyHours), hint: optionalDayName(day.date) })),
      };
    }),
    rules,
    salaries,
    currentCompetence: currentCompetence(now),
    today,
  };
}
