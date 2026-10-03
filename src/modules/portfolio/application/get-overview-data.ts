import { Prisma, type PortfolioMonthStatus } from "@/generated/prisma/client";
import { getUserDb } from "@/lib/user-db";
import { getAllocationOverview } from "@/modules/portfolio/application/get-allocation-overview";
import {
  buildFixedIncomeDuration,
  type FixedIncomeDuration,
} from "@/modules/portfolio/domain/fixed-income-duration";
import {
  DEFAULT_REBALANCE_TOLERANCE,
  type AllocationGroup,
} from "@/modules/portfolio/domain/rebalance";
import { toMonthParam } from "@/modules/portfolio/presentation/reference-month";
import { addMonths } from "@/modules/quotes/domain/calendar";

/**
 * Início de "Variação em todo o período" (decisão do usuário em 2026-10-02,
 * spec 030): a primeira competência minimamente completa. Junho e julho de
 * 2023 têm 5 e 6 posições, a linha inconsistente de Bitcoin pendente e dois
 * meses sem competência logo depois; outubro de 2023 é o primeiro mês com as
 * 10 posições da carteira de então e abre uma sequência quase contínua. Pode
 * voltar para a primeira competência depois do passo pré-produção.
 */
export const PERIOD_START = new Date(Date.UTC(2023, 9, 1));

export type OverviewHistoryPoint = {
  month: string;
  date: Date;
  totalBrl: number;
  byClass: Record<string, number>;
  byCurrency: Record<string, number>;
};

export type CompositionRow = {
  label: string;
  currentShare: number;
  targetShare: number | null;
};

export type CompositionGroup = {
  key: string;
  title: string;
  rows: CompositionRow[];
};

export type OverviewData = {
  referenceDate: Date;
  monthStatus: PortfolioMonthStatus;
  totalBrl: number;
  totalUsd: number | null;
  usdRate: number | null;
  btcRate: number | null;
  changeBrl: number | null;
  changePercent: number | null;
  /** Mês do calendário comparado na variação no mês; nulo antes do histórico. */
  previousMonth: Date | null;
  previousMissing: boolean;
  change12mBrl: number | null;
  change12mPercent: number | null;
  yearAgoMonth: Date;
  yearAgoMissing: boolean;
  periodStart: Date;
  /** A competência selecionada é anterior ao início do período. */
  beforePeriodStart: boolean;
  changeSinceStartBrl: number | null;
  changeSinceStartPercent: number | null;
  positionCount: number;
  institutionCount: number;
  offTargetTolerance: number;
  history: OverviewHistoryPoint[];
  composition: CompositionGroup[];
  rebalanceGroups: AllocationGroup[];
  fixedIncomeDuration: FixedIncomeDuration;
  classLabels: string[];
  currencyLabels: string[];
};

const COMPOSITION_TITLES: Record<string, string> = {
  ASSET_CLASS: "Classe de ativos",
  CURRENCY: "Moeda",
  STRATEGY: "Estratégia",
};

export async function getOverviewData(referenceDate?: Date): Promise<OverviewData | null> {
  const prisma = await getUserDb();

  if (!prisma) {
    return null;
  }

  try {
    const months = await prisma.portfolioMonth.findMany({
      orderBy: { referenceDate: "asc" },
      select: {
        referenceDate: true,
        status: true,
        positions: {
          select: {
            totalBrl: true,
            asset: { select: { baseCurrency: true } },
            account: { select: { institutionId: true } },
            allocations: { select: { assetClass: true, weight: true } },
          },
        },
      },
    });

    const requestedIndex = referenceDate
      ? months.findIndex((month) => month.referenceDate.getTime() === referenceDate.getTime())
      : -1;
    const selectedIndex = requestedIndex === -1 ? months.length - 1 : requestedIndex;
    const selected = months[selectedIndex];

    if (!selected || selected.positions.length === 0) {
      return null;
    }

    const history: OverviewHistoryPoint[] = months.map((month) => {
      const byClass: Record<string, number> = {};
      const byCurrency: Record<string, number> = {};
      let total = new Prisma.Decimal(0);

      for (const position of month.positions) {
        total = total.plus(position.totalBrl);
        const currency = position.asset.baseCurrency;
        byCurrency[currency] = (byCurrency[currency] ?? 0) + position.totalBrl.toNumber();

        if (position.allocations.length === 0) {
          byClass["Sem classificação"] =
            (byClass["Sem classificação"] ?? 0) + position.totalBrl.toNumber();
          continue;
        }

        for (const allocation of position.allocations) {
          const value = position.totalBrl.mul(allocation.weight).toNumber();
          byClass[allocation.assetClass] = (byClass[allocation.assetClass] ?? 0) + value;
        }
      }

      return {
        month: toMonthParam(month.referenceDate),
        date: month.referenceDate,
        totalBrl: total.toNumber(),
        byClass,
        byCurrency,
      };
    });

    // Comparações por meses do calendário (spec 030): sem a competência do mês
    // de comparação, o card mostra "Histórico insuficiente" em vez de comparar
    // com outra mais antiga.
    const selectedHistory = history[selectedIndex];
    const byTime = new Map(history.map((point) => [point.date.getTime(), point]));
    const previousMonth = addMonths(selected.referenceDate, -1);
    const yearAgoMonth = addMonths(selected.referenceDate, -12);
    const previousHistory = byTime.get(previousMonth.getTime()) ?? null;
    const yearAgoHistory = byTime.get(yearAgoMonth.getTime()) ?? null;
    const firstHistory = history.find((point) => point.date.getTime() >= PERIOD_START.getTime()) ?? history[0];
    const beforePeriodStart = selected.referenceDate.getTime() < firstHistory.date.getTime();
    const changeBrl = previousHistory ? selectedHistory.totalBrl - previousHistory.totalBrl : null;
    const change12mBrl = yearAgoHistory ? selectedHistory.totalBrl - yearAgoHistory.totalBrl : null;
    const changeSinceStartBrl =
      selected.referenceDate.getTime() > firstHistory.date.getTime()
        ? selectedHistory.totalBrl - firstHistory.totalBrl
        : null;

    const quotes = await prisma.marketQuote.findMany({
      where: { referenceDate: selected.referenceDate, symbol: { in: ["USD", "BTC"] } },
      select: { symbol: true, valueBrl: true },
    });
    const usdRate = quotes.find((quote) => quote.symbol === "USD")?.valueBrl.toNumber() ?? null;
    const btcRate = quotes.find((quote) => quote.symbol === "BTC")?.valueBrl.toNumber() ?? null;

    const allocation = await getAllocationOverview(selected.referenceDate);
    const composition = (allocation?.groups ?? [])
      .filter((group) => group.key in COMPOSITION_TITLES)
      .map((group) => ({
        key: group.key,
        title: COMPOSITION_TITLES[group.key],
        rows: group.rows.map((row) => ({
          label: row.label,
          currentShare: row.currentShare,
          targetShare: row.targetShare,
        })),
      }));

    return {
      referenceDate: selected.referenceDate,
      monthStatus: selected.status,
      totalBrl: selectedHistory.totalBrl,
      totalUsd: usdRate && usdRate !== 0 ? selectedHistory.totalBrl / usdRate : null,
      usdRate,
      btcRate,
      changeBrl,
      changePercent:
        changeBrl === null || !previousHistory || previousHistory.totalBrl === 0
          ? null
          : (changeBrl / previousHistory.totalBrl) * 100,
      previousMonth: selectedIndex > 0 ? previousMonth : null,
      previousMissing: selectedIndex > 0 && !previousHistory,
      change12mBrl,
      change12mPercent:
        change12mBrl === null || !yearAgoHistory || yearAgoHistory.totalBrl === 0
          ? null
          : (change12mBrl / yearAgoHistory.totalBrl) * 100,
      yearAgoMonth,
      yearAgoMissing: !yearAgoHistory && yearAgoMonth.getTime() >= history[0].date.getTime(),
      periodStart: firstHistory.date,
      beforePeriodStart,
      changeSinceStartBrl,
      changeSinceStartPercent:
        changeSinceStartBrl === null || firstHistory.totalBrl === 0
          ? null
          : (changeSinceStartBrl / firstHistory.totalBrl) * 100,
      positionCount: selected.positions.length,
      institutionCount: new Set(
        selected.positions.map((position) => position.account.institutionId),
      ).size,
      offTargetTolerance: allocation?.tolerance ?? DEFAULT_REBALANCE_TOLERANCE,
      history,
      composition,
      rebalanceGroups: allocation?.groups ?? [],
      fixedIncomeDuration: buildFixedIncomeDuration(
        allocation?.aggregates.fixedIncome ?? [],
        allocation?.targets ?? [],
      ),
      classLabels: collectLabels(history, "byClass"),
      currencyLabels: collectLabels(history, "byCurrency"),
    };
  } catch {
    return null;
  }
}

function collectLabels(history: OverviewHistoryPoint[], key: "byClass" | "byCurrency") {
  const totals = new Map<string, number>();

  for (const point of history) {
    for (const [label, value] of Object.entries(point[key])) {
      totals.set(label, (totals.get(label) ?? 0) + value);
    }
  }

  return [...totals.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([label]) => label);
}
