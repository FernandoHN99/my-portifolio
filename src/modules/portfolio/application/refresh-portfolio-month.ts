import {
  MonthlyUpdateStatus,
  PortfolioMonthStatus,
  Prisma,
  QuoteUpdateStatus,
} from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { fetchCurrentQuotes } from "@/modules/quotes/application/fetch-current-quotes";
import type { QuoteRequest, QuoteResult } from "@/modules/quotes/domain/quote-types";

export type MonthlyUpdateOutcome = {
  runId: string;
  targetMonth: Date;
  status: MonthlyUpdateStatus;
  successfulQuotes: number;
  failedQuotes: number;
};

export async function refreshPortfolioMonth(
  requestedMonth = currentReferenceMonth(),
  fetchQuotes: typeof fetchCurrentQuotes = fetchCurrentQuotes,
): Promise<MonthlyUpdateOutcome> {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("DATABASE_URL não está configurada.");
  }

  const targetMonth = normalizeReferenceMonth(requestedMonth);
  const draft = await ensureMonthlyDraft(targetMonth);

  try {
    const requests = await buildQuoteRequests(draft.targetMonthId);
    const metadataFailures = requests.failures;
    const fetchedQuotes = await fetchQuotes(requests.valid);
    const results = [...fetchedQuotes, ...metadataFailures].sort((left, right) =>
      left.symbol.localeCompare(right.symbol),
    );
    const failures = results.filter((result) => result.status === "FAILED");

    await prisma.$transaction(async (transaction) => {
      await transaction.monthlyUpdateRun.update({
        where: { id: draft.runId },
        data: { status: MonthlyUpdateStatus.RUNNING, errorMessage: null, completedAt: null },
      });
      await transaction.quoteUpdateResult.deleteMany({ where: { runId: draft.runId } });
      await transaction.quoteUpdateResult.createMany({
        data: results.map((result) => ({
          runId: draft.runId,
          symbol: result.symbol,
          provider: result.provider,
          status:
            result.status === "SUCCESS"
              ? QuoteUpdateStatus.SUCCESS
              : QuoteUpdateStatus.FAILED,
          valueBrl:
            result.status === "SUCCESS" ? new Prisma.Decimal(result.valueBrl) : null,
          errorCode: result.status === "FAILED" ? result.errorCode : null,
          errorMessage: result.status === "FAILED" ? result.errorMessage : null,
        })),
      });
    });

    if (failures.length > 0) {
      await prisma.monthlyUpdateRun.update({
        where: { id: draft.runId },
        data: {
          status: MonthlyUpdateStatus.COMPLETED_WITH_ISSUES,
          completedAt: new Date(),
          errorMessage: `${failures.length} cotações não foram atualizadas.`,
        },
      });

      return summarizeOutcome(draft.runId, targetMonth, results);
    }

    await applyQuotesToDraft({
      runId: draft.runId,
      targetMonth,
      targetMonthId: draft.targetMonthId,
      requests: requests.valid,
      results,
    });

    return summarizeOutcome(draft.runId, targetMonth, results);
  } catch (error) {
    await prisma.monthlyUpdateRun.update({
      where: { id: draft.runId },
      data: {
        status: MonthlyUpdateStatus.FAILED,
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Falha desconhecida.",
      },
    });

    return {
      runId: draft.runId,
      targetMonth,
      status: MonthlyUpdateStatus.FAILED,
      successfulQuotes: 0,
      failedQuotes: 0,
    };
  }
}

async function ensureMonthlyDraft(targetMonth: Date) {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("DATABASE_URL não está configurada.");
  }

  const existingTarget = await prisma.portfolioMonth.findUnique({
    where: { referenceDate: targetMonth },
    select: {
      id: true,
      targetUpdate: { select: { id: true } },
    },
  });

  if (existingTarget) {
    if (!existingTarget.targetUpdate) {
      throw new Error("A competência já existe e não foi criada pelo fluxo de atualização.");
    }

    return {
      targetMonthId: existingTarget.id,
      runId: existingTarget.targetUpdate.id,
    };
  }

  const sourceMonth = await prisma.portfolioMonth.findFirst({
    where: { referenceDate: { lt: targetMonth } },
    orderBy: { referenceDate: "desc" },
    select: {
      id: true,
      positions: {
        select: {
          accountId: true,
          assetId: true,
          quantity: true,
          unitPriceBrl: true,
          exchangeRateBrl: true,
          totalBrl: true,
          strategy: true,
        },
      },
    },
  });

  if (!sourceMonth || sourceMonth.positions.length === 0) {
    throw new Error("Não existe uma competência anterior com posições para copiar.");
  }

  return prisma.$transaction(async (transaction) => {
    const month = await transaction.portfolioMonth.create({
      data: {
        referenceDate: targetMonth,
        status: PortfolioMonthStatus.DRAFT,
      },
      select: { id: true },
    });

    await transaction.position.createMany({
      data: sourceMonth.positions.map((position) => ({
        ...position,
        portfolioMonthId: month.id,
      })),
    });

    const run = await transaction.monthlyUpdateRun.create({
      data: {
        sourceMonthId: sourceMonth.id,
        targetMonthId: month.id,
        status: MonthlyUpdateStatus.RUNNING,
      },
      select: { id: true },
    });

    return { targetMonthId: month.id, runId: run.id };
  });
}

async function buildQuoteRequests(targetMonthId: string) {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("DATABASE_URL não está configurada.");
  }

  const positions = await prisma.position.findMany({
    where: {
      portfolioMonthId: targetMonthId,
      asset: { quoteSymbol: { not: null } },
    },
    select: { asset: { select: { quoteSymbol: true } } },
  });
  const symbols = [
    ...new Set(
      positions
        .map((position) => position.asset.quoteSymbol)
        .filter((symbol): symbol is string => Boolean(symbol)),
    ),
  ];
  const historicalQuotes = await prisma.marketQuote.findMany({
    where: { symbol: { in: symbols } },
    orderBy: { referenceDate: "desc" },
    select: { symbol: true, instrumentType: true, baseCurrency: true },
  });
  const metadata = new Map<string, QuoteRequest>();

  for (const quote of historicalQuotes) {
    if (!metadata.has(quote.symbol)) {
      metadata.set(quote.symbol, quote);
    }
  }

  const valid: QuoteRequest[] = [];
  const failures: QuoteResult[] = [];

  for (const symbol of symbols) {
    const request = metadata.get(symbol);
    if (request) {
      valid.push(request);
    } else {
      failures.push({
        symbol,
        provider: "configuration",
        status: "FAILED",
        errorCode: "MISSING_QUOTE_METADATA",
        errorMessage: `Não existe histórico suficiente para escolher o provedor de ${symbol}.`,
      });
    }
  }

  return { valid, failures };
}

async function applyQuotesToDraft({
  runId,
  targetMonth,
  targetMonthId,
  requests,
  results,
}: {
  runId: string;
  targetMonth: Date;
  targetMonthId: string;
  requests: QuoteRequest[];
  results: QuoteResult[];
}) {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("DATABASE_URL não está configurada.");
  }

  const successful = new Map(
    results
      .filter((result) => result.status === "SUCCESS")
      .map((result) => [result.symbol, result.valueBrl]),
  );
  const metadata = new Map(requests.map((request) => [request.symbol, request]));
  const positions = await prisma.position.findMany({
    where: { portfolioMonthId: targetMonthId },
    select: {
      id: true,
      quantity: true,
      asset: { select: { quoteSymbol: true } },
    },
  });
  const usdBrl = successful.get("USD");

  await prisma.$transaction(
    async (transaction) => {
      for (const [symbol, valueBrl] of successful) {
        const request = metadata.get(symbol);
        if (!request) {
          continue;
        }

        await transaction.marketQuote.upsert({
          where: { referenceDate_symbol: { referenceDate: targetMonth, symbol } },
          create: {
            referenceDate: targetMonth,
            symbol,
            instrumentType: request.instrumentType,
            baseCurrency: request.baseCurrency,
            valueBrl: new Prisma.Decimal(valueBrl),
          },
          update: { valueBrl: new Prisma.Decimal(valueBrl) },
        });
      }

      for (const position of positions) {
        const symbol = position.asset.quoteSymbol;
        if (!symbol) {
          continue;
        }
        const valueBrl = successful.get(symbol);
        if (valueBrl === undefined) {
          continue;
        }
        const price = new Prisma.Decimal(valueBrl);

        await transaction.position.update({
          where: { id: position.id },
          data: {
            unitPriceBrl: price,
            exchangeRateBrl: usdBrl === undefined ? null : new Prisma.Decimal(usdBrl),
            totalBrl: position.quantity.mul(price),
          },
        });
      }

      await transaction.monthlyUpdateRun.update({
        where: { id: runId },
        data: {
          status: MonthlyUpdateStatus.COMPLETED,
          completedAt: new Date(),
          errorMessage: null,
        },
      });
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

function summarizeOutcome(
  runId: string,
  targetMonth: Date,
  results: QuoteResult[],
): MonthlyUpdateOutcome {
  const failedQuotes = results.filter((result) => result.status === "FAILED").length;

  return {
    runId,
    targetMonth,
    status:
      failedQuotes === 0
        ? MonthlyUpdateStatus.COMPLETED
        : MonthlyUpdateStatus.COMPLETED_WITH_ISSUES,
    successfulQuotes: results.length - failedQuotes,
    failedQuotes,
  };
}

export function currentReferenceMonth(now = new Date()) {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
}

function normalizeReferenceMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
