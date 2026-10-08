import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { competenceDate, competenceOf, formatCompetenceLong, type Competence } from "@/lib/competence";
import { centsToDecimal, type Cents } from "@/lib/money";
import { SCOPED_USER } from "@/lib/user-db";
import { getIncomeContext, IncomeEditError } from "@/modules/income/application/income-db";
import { PAYSLIP_PROBLEMS, payslipProblem, type IncomeValues, type IsoDate, type PayslipKind } from "@/modules/income/domain/income";
import type { HourKind } from "@/modules/income/domain/income-hours";

// Gravações de Recebimentos (spec 088). Toda operação passa pelo cliente da
// área (concessão conferida, usuário da sessão) e roda numa transação: o mês e
// os holerites dele gravam inteiros ou nada. Os ids recebidos do navegador só
// indicam o registro; quem confere o dono é o escopo do cliente.

type Transaction = Prisma.TransactionClient;

export { IncomeEditError };

export type PayslipInput = {
  kind: PayslipKind;
  label: string | null;
  employer: string;
  startsOn: IsoDate;
  endsOn: IsoDate;
  grossCents: Cents;
  prorated: boolean;
  taxable: boolean;
};

export type IncomeMonthInput = {
  month: Competence;
  values: IncomeValues;
  payslips: PayslipInput[];
};

const TRANSACTION = { maxWait: 10_000, timeout: 30_000 } as const;

async function transact<T>(operation: (transaction: Transaction, userId: string) => Promise<T>) {
  const { prisma, userId } = await getIncomeContext();
  return (prisma as PrismaClient).$transaction((transaction) => operation(transaction, userId), TRANSACTION);
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const decimal = (cents: Cents | null) => (cents === null ? null : centsToDecimal(cents));
const date = (value: IsoDate) => new Date(`${value}T00:00:00.000Z`);

function monthData(values: IncomeValues) {
  return {
    netIncome: decimal(values.netIncomeCents),
    mealVoucher: decimal(values.mealVoucherCents),
    cardSpend: decimal(values.cardSpendCents),
    pixSpend: decimal(values.pixSpendCents),
    mealVoucherSpend: decimal(values.mealVoucherSpendCents),
  };
}

function payslipData(incomeMonthId: string, payslip: PayslipInput) {
  return {
    userId: SCOPED_USER,
    incomeMonthId,
    kind: payslip.kind,
    label: payslip.label?.trim() || null,
    employer: payslip.employer.trim().replace(/\s+/g, " "),
    startsOn: date(payslip.startsOn),
    endsOn: date(payslip.endsOn),
    grossSalary: centsToDecimal(payslip.grossCents),
    prorated: payslip.prorated,
    taxable: payslip.taxable,
  };
}

/** As regras do domínio também no servidor: o período cabe no mês do registro. */
function assertPayslips(input: IncomeMonthInput) {
  for (const payslip of input.payslips) {
    const problem = payslipProblem(input.month, payslip);

    if (problem) {
      throw new IncomeEditError(PAYSLIP_PROBLEMS[problem]);
    }
  }
}

async function assertMonthFree(transaction: Transaction, month: Competence, exceptId?: string) {
  const taken = await transaction.incomeMonth.findFirst({
    where: { month: competenceDate(month), ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });

  if (taken) {
    throw new IncomeEditError(`${formatCompetenceLong(month)} já está lançado. Abra o mês na tabela para editar.`);
  }
}

/**
 * Inclui um mês com os holerites. O id é escolhido pelo navegador: repetir o
 * pedido (duplo clique ou nova tentativa) encontra o mês já gravado e não
 * duplica. O mês é único por usuário.
 */
export async function createIncomeMonth(input: IncomeMonthInput & { requestId: string }): Promise<{ repeated: boolean }> {
  assertPayslips(input);

  try {
    return await transact(async (transaction) => {
      // O mesmo pedido já gravado é repetição, não um mês ocupado.
      if ((await transaction.incomeMonth.count({ where: { id: input.requestId } })) > 0) {
        return { repeated: true };
      }

      await assertMonthFree(transaction, input.month);
      await transaction.incomeMonth.create({
        data: { id: input.requestId, userId: SCOPED_USER, month: competenceDate(input.month), ...monthData(input.values) },
      });

      if (input.payslips.length > 0) {
        await transaction.incomePayslip.createMany({ data: input.payslips.map((payslip) => payslipData(input.requestId, payslip)) });
      }

      return { repeated: false };
    });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const prisma = (await getIncomeContext()).prisma;

    if ((await prisma.incomeMonth.count({ where: { id: input.requestId } })) > 0) {
      return { repeated: true };
    }

    // Outro pedido gravou o mesmo mês ao mesmo tempo.
    throw new IncomeEditError(`${formatCompetenceLong(input.month)} já está lançado. Abra o mês na tabela para editar.`);
  }
}

/** Salva o mês: os valores e a lista inteira de holerites, trocada de uma vez. */
export async function updateIncomeMonth(id: string, input: IncomeMonthInput) {
  assertPayslips(input);

  try {
    await transact(async (transaction) => {
      const current = await transaction.incomeMonth.findFirst({ where: { id }, select: { id: true } });

      if (!current) {
        throw new IncomeEditError("Mês não encontrado. Atualize a página e tente de novo.");
      }

      await assertMonthFree(transaction, input.month, id);
      await transaction.incomeMonth.update({ where: { id }, data: { month: competenceDate(input.month), ...monthData(input.values) } });
      await transaction.incomePayslip.deleteMany({ where: { incomeMonthId: id } });

      if (input.payslips.length > 0) {
        await transaction.incomePayslip.createMany({ data: input.payslips.map((payslip) => payslipData(id, payslip)) });
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new IncomeEditError(`${formatCompetenceLong(input.month)} já está lançado. Abra o mês na tabela para editar.`);
    }

    throw error;
  }
}

type MonthSnapshot = {
  id: string;
  month: Date;
  netIncome: string | null;
  mealVoucher: string | null;
  cardSpend: string | null;
  pixSpend: string | null;
  mealVoucherSpend: string | null;
  createdAt: Date;
};

type PayslipSnapshot = {
  id: string;
  incomeMonthId: string;
  kind: PayslipKind;
  label: string | null;
  employer: string;
  startsOn: Date;
  endsOn: Date;
  grossSalary: string;
  prorated: boolean;
  taxable: boolean;
  createdAt: Date;
};

// As horas do mês (spec 094) saem em cascata com ele, então voltam no desfazer.
type HourRecordSnapshot = {
  id: string;
  incomeMonthId: string;
  kind: HourKind;
  declaredHours: string | null;
  paidHours: string | null;
  workedHours: string | null;
  paidAmount: string | null;
  note: string | null;
  createdAt: Date;
};

type UndoEntry = {
  userId: string;
  expiresAt: number;
  month: MonthSnapshot;
  payslips: PayslipSnapshot[];
  hourRecords: HourRecordSnapshot[];
};

const UNDO_TTL_MS = 10 * 60 * 1000;
const globalForUndo = globalThis as unknown as { incomeUndo?: Map<string, UndoEntry> };
const undoStore: Map<string, UndoEntry> = (globalForUndo.incomeUndo ??= new Map<string, UndoEntry>());

function storeUndo(entry: UndoEntry) {
  const now = Date.now();

  for (const [key, value] of undoStore) {
    if (value.expiresAt < now) {
      undoStore.delete(key);
    }
  }

  const token = randomUUID();
  undoStore.set(token, entry);
  return token;
}

const text = (value: { toString(): string } | null) => (value === null ? null : value.toString());

/** Exclui o mês, os holerites e as horas dele. Devolve o token do desfazer. */
export async function deleteIncomeMonth(id: string) {
  return transact(async (transaction, userId) => {
    const row = await transaction.incomeMonth.findFirst({
      where: { id },
      select: {
        id: true,
        month: true,
        netIncome: true,
        mealVoucher: true,
        cardSpend: true,
        pixSpend: true,
        mealVoucherSpend: true,
        createdAt: true,
        payslips: {
          select: {
            id: true,
            incomeMonthId: true,
            kind: true,
            label: true,
            employer: true,
            startsOn: true,
            endsOn: true,
            grossSalary: true,
            prorated: true,
            taxable: true,
            createdAt: true,
          },
        },
        hourRecords: {
          select: {
            id: true,
            incomeMonthId: true,
            kind: true,
            declaredHours: true,
            paidHours: true,
            workedHours: true,
            paidAmount: true,
            note: true,
            createdAt: true,
          },
        },
      },
    });

    if (!row) {
      throw new IncomeEditError("Mês não encontrado. Atualize a página e tente de novo.");
    }

    await transaction.incomeMonth.deleteMany({ where: { id } });

    const { payslips, hourRecords, netIncome, mealVoucher, cardSpend, pixSpend, mealVoucherSpend, ...month } = row;
    const token = storeUndo({
      userId,
      expiresAt: Date.now() + UNDO_TTL_MS,
      month: {
        ...month,
        netIncome: text(netIncome),
        mealVoucher: text(mealVoucher),
        cardSpend: text(cardSpend),
        pixSpend: text(pixSpend),
        mealVoucherSpend: text(mealVoucherSpend),
      },
      payslips: payslips.map(({ grossSalary, ...payslip }) => ({ ...payslip, grossSalary: grossSalary.toString() })),
      hourRecords: hourRecords.map(({ declaredHours, paidHours, workedHours, paidAmount, ...record }) => ({
        ...record,
        declaredHours: text(declaredHours),
        paidHours: text(paidHours),
        workedHours: text(workedHours),
        paidAmount: text(paidAmount),
      })),
    });

    return { month: competenceOf(row.month), undoToken: token };
  });
}

/** Desfaz uma exclusão recente do mesmo usuário. */
export async function undoIncomeChange(token: string) {
  const entry = undoStore.get(token);

  if (!entry || entry.expiresAt < Date.now()) {
    undoStore.delete(token);
    throw new IncomeEditError("Não é mais possível desfazer esta alteração.");
  }

  await transact(async (transaction, userId) => {
    // O retrato só volta para o próprio dono.
    if (userId !== entry.userId) {
      throw new IncomeEditError("Não é mais possível desfazer esta alteração.");
    }

    await assertMonthFree(transaction, competenceOf(entry.month.month));
    await transaction.incomeMonth.create({ data: { ...entry.month, userId: SCOPED_USER } });

    if (entry.payslips.length > 0) {
      await transaction.incomePayslip.createMany({ data: entry.payslips.map((payslip) => ({ ...payslip, userId: SCOPED_USER })) });
    }

    if (entry.hourRecords.length > 0) {
      await transaction.incomeHourRecord.createMany({ data: entry.hourRecords.map((record) => ({ ...record, userId: SCOPED_USER })) });
    }
  });

  undoStore.delete(token);
}
