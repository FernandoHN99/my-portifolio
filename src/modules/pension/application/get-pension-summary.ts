import { currentCompetence } from "@/lib/competence";
import { decimalToCents } from "@/lib/money";
import { readIncomeMonths } from "@/modules/income/application/get-income-ledger";
import { getPensionDb } from "@/modules/pension/application/pension-db";
import type { PensionContribution, WorkedPeriod } from "@/modules/pension/domain/pension";
import { assetTypeOf } from "@/modules/portfolio/domain/classification";

export type PensionData = {
  contributions: PensionContribution[];
  periods: WorkedPeriod[];
  /** Mês corrente, que define o ano mostrado por padrão. */
  currentCompetence: string;
};

/**
 * Aportes nas posições de Previdência e os holerites de Recebimentos (spec
 * 089). Aporte é o saldo inicial ou um aporte, sem as pernas de transferência
 * interna (spec 059), como conta `recordedByMonth`. O tipo do ativo vem de
 * `assetTypeOf`, que também reconhece os ativos antigos sem tipo.
 */
export async function getPensionData(now = new Date()): Promise<PensionData> {
  const prisma = await getPensionDb();
  const assets = await prisma.asset.findMany({
    select: { id: true, name: true, assetType: true, quoteSymbol: true, baseCurrency: true, cashAccount: true },
  });
  const pensionIds = assets.filter((asset) => assetTypeOf(asset) === "pension").map((asset) => asset.id);

  const [transactions, months] = await Promise.all([
    pensionIds.length === 0
      ? Promise.resolve([])
      : prisma.positionTransaction.findMany({
          where: { kind: { in: ["OPENING", "CONTRIBUTION"] }, transferId: null, position: { assetId: { in: pensionIds } } },
          orderBy: [{ occurredOn: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            kind: true,
            occurredOn: true,
            amountBrl: true,
            position: {
              select: {
                accountId: true,
                assetId: true,
                asset: { select: { name: true } },
                account: { select: { institution: { select: { name: true } } } },
              },
            },
          },
        }),
    readIncomeMonths(prisma),
  ]);

  return {
    contributions: transactions.map((transaction) => ({
      id: transaction.id,
      occurredOn: transaction.occurredOn.toISOString().slice(0, 10),
      kind: transaction.kind as PensionContribution["kind"],
      amountCents: decimalToCents(transaction.amountBrl),
      assetName: transaction.position.asset.name,
      institutionName: transaction.position.account.institution.name,
      accountId: transaction.position.accountId,
      assetId: transaction.position.assetId,
    })),
    periods: months.flatMap((month) => month.payslips.map((payslip) => ({ ...payslip, month: month.month }))),
    currentCompetence: currentCompetence(now),
  };
}
