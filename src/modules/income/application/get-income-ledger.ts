import type { PrismaClient } from "@/generated/prisma/client";
import { competenceOf, currentCompetence } from "@/lib/competence";
import { decimalToCents } from "@/lib/money";
import { getIncomeDb } from "@/modules/income/application/income-db";
import type { IncomeMonth } from "@/modules/income/domain/income";

export type IncomeLedger = {
  months: IncomeMonth[];
  /** Empresas dos holerites, da mais recente à mais antiga, para sugerir. */
  employers: string[];
  /** Mês corrente, sugerido nos meses novos. */
  currentCompetence: string;
};

const cents = (value: { toString(): string } | null) => (value === null ? null : decimalToCents(value));
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/** Meses e holerites do usuário em objetos simples, com valores em centavos. */
export async function readIncomeMonths(prisma: PrismaClient): Promise<IncomeMonth[]> {
  const rows = await prisma.incomeMonth.findMany({
    orderBy: { month: "asc" },
    select: {
      id: true,
      month: true,
      netIncome: true,
      mealVoucher: true,
      cardSpend: true,
      pixSpend: true,
      mealVoucherSpend: true,
      payslips: {
        orderBy: [{ startsOn: "asc" }, { endsOn: "asc" }, { createdAt: "asc" }],
        select: { id: true, kind: true, label: true, employer: true, startsOn: true, endsOn: true, grossSalary: true, prorated: true },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    month: competenceOf(row.month),
    netIncomeCents: cents(row.netIncome),
    mealVoucherCents: cents(row.mealVoucher),
    cardSpendCents: cents(row.cardSpend),
    pixSpendCents: cents(row.pixSpend),
    mealVoucherSpendCents: cents(row.mealVoucherSpend),
    payslips: row.payslips.map(({ grossSalary, startsOn, endsOn, ...payslip }) => ({
      ...payslip,
      startsOn: isoDate(startsOn),
      endsOn: isoDate(endsOn),
      grossCents: decimalToCents(grossSalary),
    })),
  }));
}

/** Tudo o que a página de Recebimentos mostra. */
export async function getIncomeLedger(now = new Date()): Promise<IncomeLedger> {
  const months = await readIncomeMonths(await getIncomeDb());
  const employers = [...months]
    .reverse()
    .flatMap((month) => [...month.payslips].reverse().map((payslip) => payslip.employer.trim()))
    .filter((employer, index, all) => employer !== "" && all.indexOf(employer) === index);

  return { months, employers, currentCompetence: currentCompetence(now) };
}
