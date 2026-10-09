import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { competenceDate, competenceOf, formatCompetenceLong, type Competence } from "@/lib/competence";
import { decimalToCents } from "@/lib/money";
import { SCOPED_USER } from "@/lib/user-db";
import { getIncomeContext, IncomeEditError } from "@/modules/income/application/income-db";
import { dateOf, hoursDecimal, readOvertimeRules, recomputeImportedTotals, totalsData } from "@/modules/income/application/overtime-data";
import { isIsoDate, type IsoDate } from "@/modules/income/domain/income";
import {
  defaultDayType,
  formatDayMonth,
  MAX_MONTH_OVERTIME,
  MAX_PERCENT,
  overtimeHours,
  OVERTIME_CATEGORIES,
  paymentHours,
  ruleFor,
  totalsFromDays,
  type DayType,
  type Hours,
  type OvertimeCategory,
  type OvertimePayKind,
  type OvertimeTotals,
  type PaymentLine,
} from "@/modules/income/domain/overtime";

const isoDateOf = (date: Date) => date.toISOString().slice(0, 10);

// Gravações das horas extras (spec 098), sempre pelo cliente de Recebimentos e
// em transação. O formulário único do mês grava tudo de uma vez
// (`saveOvertimeEntry`): a declaração, o tipo dos dias da folha e os pagamentos
// (só as horas; os valores são calculados). A folha anexada entra antes, pela
// importação. Excluir o mês tem desfazer.

type Transaction = Prisma.TransactionClient;

const TRANSACTION = { maxWait: 10_000, timeout: 30_000 } as const;

async function transact<T>(operation: (transaction: Transaction, userId: string) => Promise<T>) {
  const { prisma, userId } = await getIncomeContext();
  return (prisma as PrismaClient).$transaction((transaction) => operation(transaction, userId), TRANSACTION);
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** O período da folha: até 45 dias, terminando no mês da competência. */
export function periodProblem(month: Competence, startsOn: IsoDate, endsOn: IsoDate) {
  if (!isIsoDate(startsOn) || !isIsoDate(endsOn)) return "Informe o início e o fim do período.";
  if (startsOn > endsOn) return "O período começa depois de terminar.";
  if ((Date.parse(endsOn) - Date.parse(startsOn)) / 86_400_000 >= 45) return "O período vai até 45 dias.";
  if (endsOn.slice(0, 7) !== month) return `O período termina no mês da competência (${formatCompetenceLong(month)}).`;
  return null;
}

const noteOf = (note: string | null) => note?.trim().replace(/\s+/g, " ").slice(0, 500) || null;

const takenMessage = (month: Competence) => `${formatCompetenceLong(month)} já tem horas extras. Abra o mês na tabela para editar.`;

async function assertMonthFree(transaction: Transaction, month: Competence, exceptId?: string) {
  const taken = await transaction.overtimeMonth.findFirst({
    where: { month: competenceDate(month), ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });

  if (taken) {
    throw new IncomeEditError(takenMessage(month));
  }
}

export type PaymentInput = {
  /** O pagamento já registrado que o formulário corrige; ausente no novo. */
  id?: string;
  paymentMonth: Competence;
  lines: PaymentLine[];
  note: string | null;
};

export type EntryInput = {
  /** O mês aberto na tabela; ausente ao declarar um mês novo. */
  id?: string;
  /** Id do mês novo, escolhido pelo navegador: repetir o pedido não duplica. */
  requestId: string;
  /** A folha anexada neste formulário já foi gravada pela importação: o mês dela é este. */
  attached: boolean;
  month: Competence;
  startsOn: IsoDate;
  endsOn: IsoDate;
  /** As horas a mais por faixa, como estão no formulário. */
  totals: Record<OvertimeCategory, Hours>;
  compensated: Hours;
  note: string | null;
  /** Dias da folha cujo tipo o usuário trocou no formulário. */
  dayTypes: { dayId: string; dayType: DayType }[];
  /** Todos os pagamentos do mês: os que ficam de fora são excluídos. */
  payments: PaymentInput[];
};

function assertEntry(input: EntryInput) {
  const problem = periodProblem(input.month, input.startsOn, input.endsOn);
  if (problem) throw new IncomeEditError(problem);

  for (const value of OVERTIME_CATEGORIES.map((category) => input.totals[category])) {
    if (!Number.isInteger(value) || value < 0 || value > MAX_MONTH_OVERTIME) throw new IncomeEditError("As horas do mês vão de 0 a 744.");
  }

  if (!Number.isInteger(input.compensated) || input.compensated < 0) throw new IncomeEditError("As horas compensadas não podem ser negativas.");

  const months = input.payments.map((payment) => payment.paymentMonth);
  if (new Set(months).size !== months.length) throw new IncomeEditError("Cada holerite entra uma vez nos pagamentos do mês.");

  for (const payment of input.payments) {
    const kinds = payment.lines.map((line) => line.kind);
    if (new Set(kinds).size !== kinds.length) throw new IncomeEditError("Cada adicional entra uma vez no pagamento.");
    for (const line of payment.lines) {
      if (!Number.isInteger(line.hours) || line.hours < 0 || line.hours > MAX_MONTH_OVERTIME) throw new IncomeEditError("As horas pagas vão de 0 a 744.");
    }
  }
}

const sameTotals = (a: Record<OvertimeCategory, Hours>, b: Record<OvertimeCategory, Hours>) => OVERTIME_CATEGORIES.every((category) => a[category] === b[category]);

/**
 * Salva o mês do formulário único: cria ou atualiza a declaração (mês, período
 * e horas), troca o tipo dos dias e acerta os pagamentos (cria, corrige e
 * exclui os que saíram; pagamento sem horas não fica). Com os dias de uma folha,
 * o mês segue a folha enquanto as horas batem com ela e vira "declarado à mão"
 * quando o usuário as muda. Devolve o id do mês.
 */
export async function saveOvertimeEntry(input: EntryInput) {
  assertEntry(input);

  try {
    return await transact(async (transaction) => {
      let current = input.id ? await transaction.overtimeMonth.findFirst({ where: { id: input.id }, select: { id: true, shortfallHours: true } }) : null;

      if (input.id && !current) {
        throw new IncomeEditError("Mês não encontrado. Atualize a página e tente de novo.");
      }

      if (!input.id) {
        const existing = await transaction.overtimeMonth.findFirst({ where: { month: competenceDate(input.month) }, select: { id: true, shortfallHours: true } });
        if (existing && existing.id !== input.requestId && !input.attached) throw new IncomeEditError(takenMessage(input.month));
        current = existing;
      }

      const monthId = current?.id ?? input.requestId;

      if (current) {
        await assertMonthFree(transaction, input.month, current.id);

        for (const { dayId, dayType } of input.dayTypes) {
          const day = await transaction.overtimeDay.findFirst({ where: { id: dayId, overtimeMonthId: current.id }, select: { date: true } });
          if (!day) throw new IncomeEditError("Dia não encontrado. Atualize a página e tente de novo.");
          await transaction.overtimeDay.updateMany({ where: { id: dayId }, data: { dayType, manualType: dayType !== defaultDayType(isoDateOf(day.date)) } });
        }
      }

      const days = current
        ? (await transaction.overtimeDay.findMany({ where: { overtimeMonthId: current.id }, orderBy: { date: "asc" }, select: { date: true, hours: true, dayType: true } })).map((day) => ({
            date: isoDateOf(day.date),
            hours: decimalToCents(day.hours),
            dayType: day.dayType as DayType,
          }))
        : [];

      if (days.length > 0 && (days[0].date < input.startsOn || days.at(-1)!.date > input.endsOn)) {
        throw new IncomeEditError(`Os dias da folha vão de ${formatDayMonth(days[0].date)} a ${formatDayMonth(days.at(-1)!.date)}: o período precisa incluí-los.`);
      }

      const rules = await readOvertimeRules(transaction);
      const fromSheet = days.length > 0 ? totalsFromDays(days, ruleFor(input.month, rules).dailyHours) : null;
      const totals: OvertimeTotals = {
        ...input.totals,
        shortfall: fromSheet ? fromSheet.shortfall : current ? decimalToCents(current.shortfallHours) : 0,
      };

      if (input.compensated > overtimeHours(totals)) {
        throw new IncomeEditError("As horas compensadas passam das horas extras do mês.");
      }

      const data = {
        month: competenceDate(input.month),
        startsOn: dateOf(input.startsOn),
        endsOn: dateOf(input.endsOn),
        source: fromSheet && sameTotals(fromSheet, totals) ? ("IMPORT" as const) : ("MANUAL" as const),
        ...totalsData(totals),
        compensatedHours: hoursDecimal(input.compensated),
        note: noteOf(input.note),
      };

      if (current) {
        await transaction.overtimeMonth.updateMany({ where: { id: current.id }, data });
      } else {
        await transaction.overtimeMonth.create({ data: { ...data, id: monthId, userId: SCOPED_USER } });
      }

      // Os pagamentos do mês saem e voltam como estão no formulário (com o id e
      // a data de criação dos que já existiam), o que deixa trocar o holerite
      // de dois pagamentos sem esbarrar na unicidade.
      const stored = await transaction.overtimePayment.findMany({ where: { overtimeMonthId: monthId }, select: { id: true, createdAt: true } });
      const createdAt = new Map(stored.map((payment) => [payment.id, payment.createdAt]));
      const kept = input.payments.filter((payment) => paymentHours(payment) > 0);

      if (kept.some((payment) => payment.id && !createdAt.has(payment.id))) {
        throw new IncomeEditError("Pagamento não encontrado. Atualize a página e tente de novo.");
      }

      await transaction.overtimePayment.deleteMany({ where: { overtimeMonthId: monthId } });

      if (kept.length > 0) {
        await transaction.overtimePayment.createMany({
          data: kept.map((payment) => ({
            id: payment.id ?? randomUUID(),
            userId: SCOPED_USER,
            overtimeMonthId: monthId,
            ...paymentData(payment),
            ...(payment.id ? { createdAt: createdAt.get(payment.id) } : {}),
          })),
        });
      }

      return { monthId };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new IncomeEditError(takenMessage(input.month));
    throw error;
  }
}

function paymentData(input: PaymentInput) {
  const hours = (kind: OvertimePayKind) => hoursDecimal(input.lines.find((line) => line.kind === kind)?.hours ?? 0);

  return {
    paymentMonth: competenceDate(input.paymentMonth),
    hours50: hours("OVERTIME_50"),
    hours75: hours("OVERTIME_75"),
    hours100: hours("OVERTIME_100"),
    note: noteOf(input.note),
  };
}

type MonthSnapshot = Prisma.OvertimeMonthUncheckedCreateInput;
type DaySnapshot = Prisma.OvertimeDayUncheckedCreateInput;
type PaymentSnapshot = Prisma.OvertimePaymentUncheckedCreateInput;
type UndoEntry = { userId: string; expiresAt: number; month: MonthSnapshot; days: DaySnapshot[]; payments: PaymentSnapshot[] };

const UNDO_TTL_MS = 10 * 60 * 1000;
const globalForUndo = globalThis as unknown as { overtimeUndo?: Map<string, UndoEntry> };
const undoStore: Map<string, UndoEntry> = (globalForUndo.overtimeUndo ??= new Map<string, UndoEntry>());

function storeUndo(entry: UndoEntry) {
  const now = Date.now();
  for (const [key, value] of undoStore) {
    if (value.expiresAt < now) undoStore.delete(key);
  }

  const token = randomUUID();
  undoStore.set(token, entry);
  return token;
}

/** Exclui o mês de trabalho com os dias e os pagamentos dele. Devolve o token do desfazer. */
export async function deleteOvertimeMonth(id: string) {
  return transact(async (transaction, userId) => {
    const row = await transaction.overtimeMonth.findFirst({ where: { id }, include: { days: true, payments: true } });

    if (!row) {
      throw new IncomeEditError("Mês não encontrado. Atualize a página e tente de novo.");
    }

    await transaction.overtimeMonth.deleteMany({ where: { id } });

    const { days, payments, ...month } = row;
    const token = storeUndo({ userId, expiresAt: Date.now() + UNDO_TTL_MS, month, days, payments });
    return { month: competenceOf(row.month), undoToken: token };
  });
}

/** Desfaz a exclusão recente de um mês, do mesmo usuário. */
export async function undoOvertimeChange(token: string) {
  const entry = undoStore.get(token);

  if (!entry || entry.expiresAt < Date.now()) {
    undoStore.delete(token);
    throw new IncomeEditError("Não é mais possível desfazer esta alteração.");
  }

  await transact(async (transaction, userId) => {
    if (userId !== entry.userId) {
      throw new IncomeEditError("Não é mais possível desfazer esta alteração.");
    }

    await assertMonthFree(transaction, competenceOf(entry.month.month as Date));
    await transaction.overtimeMonth.create({ data: { ...entry.month, userId: SCOPED_USER } });

    if (entry.days.length > 0) {
      await transaction.overtimeDay.createMany({ data: entry.days.map((day) => ({ ...day, userId: SCOPED_USER })) });
    }

    if (entry.payments.length > 0) {
      await transaction.overtimePayment.createMany({ data: entry.payments.map((payment) => ({ ...payment, userId: SCOPED_USER })) });
    }
  });

  undoStore.delete(token);
}

export type RuleInput = {
  effectiveFrom: Competence;
  dailyHours: Hours;
  weekdayPercent: number;
  weekdayBeyondPercent: number;
  saturdayPercent: number;
  sundayPercent: number;
  holidayPercent: number;
  usualDailyLimit: Hours | null;
  exceptionalDailyLimit: Hours | null;
  netShortfall: boolean;
  note: string | null;
};

export function ruleProblem(rules: readonly RuleInput[]) {
  const months = rules.map((rule) => rule.effectiveFrom);
  if (new Set(months).size !== months.length) return "Duas versões da regra começam no mesmo mês.";

  for (const rule of rules) {
    const percents = [rule.weekdayPercent, rule.weekdayBeyondPercent, rule.saturdayPercent, rule.sundayPercent, rule.holidayPercent];
    if (percents.some((value) => !Number.isInteger(value) || value < 0 || value > MAX_PERCENT)) return "Os adicionais vão de 0% a 300%.";
    if (rule.dailyHours < 100 || rule.dailyHours > 1200) return "A jornada vai de 1 a 12 horas por dia.";
    for (const limit of [rule.usualDailyLimit, rule.exceptionalDailyLimit]) {
      if (limit !== null && (limit < 0 || limit > 1600)) return "Os limites diários vão de 0 a 16 horas.";
    }
    if (rule.usualDailyLimit !== null && rule.exceptionalDailyLimit !== null && rule.exceptionalDailyLimit < rule.usualDailyLimit) {
      return "O limite excepcional não pode ficar abaixo do habitual.";
    }
  }

  return null;
}

/**
 * Troca as versões da regra de uma vez (a lista inteira vem do formulário) e
 * recalcula os meses importados, porque a jornada pode ter mudado.
 */
export async function saveOvertimeRules(rules: RuleInput[]) {
  const problem = ruleProblem(rules);
  if (problem) throw new IncomeEditError(problem);

  await transact(async (transaction) => {
    await transaction.overtimeRule.deleteMany({});

    if (rules.length > 0) {
      await transaction.overtimeRule.createMany({
        data: rules.map((rule) => ({
          userId: SCOPED_USER,
          effectiveFrom: competenceDate(rule.effectiveFrom),
          dailyHours: hoursDecimal(rule.dailyHours),
          weekdayPercent: rule.weekdayPercent,
          weekdayBeyondPercent: rule.weekdayBeyondPercent,
          saturdayPercent: rule.saturdayPercent,
          sundayPercent: rule.sundayPercent,
          holidayPercent: rule.holidayPercent,
          usualDailyLimit: rule.usualDailyLimit === null ? null : hoursDecimal(rule.usualDailyLimit),
          exceptionalDailyLimit: rule.exceptionalDailyLimit === null ? null : hoursDecimal(rule.exceptionalDailyLimit),
          netShortfall: rule.netShortfall,
          note: noteOf(rule.note),
        })),
      });
    }

    await recomputeImportedTotals(transaction);
  });
}
