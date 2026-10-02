import {
  Prisma,
  QuoteRefreshStatus,
  QuoteRefreshTrigger,
  QuoteUpdateStatus,
  type PrismaClient,
} from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { fetchCurrentQuotes } from "@/modules/quotes/application/fetch-current-quotes";
import { calendarDay, monthOf, toDateKey } from "@/modules/quotes/domain/calendar";
import {
  isRefreshDue,
  type QuoteFailureView,
  type QuoteRefreshOutcome,
  type QuoteRefreshRunView,
  type QuoteRefreshSummary,
  type QuoteRefreshTriggerKind,
} from "@/modules/quotes/domain/quote-refresh";
import {
  quoteFailure,
  type QuoteRequest,
  type QuoteResult,
} from "@/modules/quotes/domain/quote-types";
import { describeProviderError } from "@/modules/quotes/infrastructure/http";

export type QuoteFetcher = (requests: QuoteRequest[]) => Promise<QuoteResult[]>;

type Transaction = Prisma.TransactionClient;

// Chave do bloqueio consultivo do PostgreSQL que serializa a reserva de uma
// execução. O bloqueio dura só a transação curta que cria a execução.
const QUOTE_REFRESH_LOCK_KEY = 2_026_100_201;
// Uma execução que continua RUNNING depois disso foi interrompida.
const STALE_RUN_MS = 10 * 60 * 1000;

export async function refreshQuotes({
  trigger,
  now = new Date(),
  fetchQuotes = fetchCurrentQuotes,
}: {
  trigger: QuoteRefreshTriggerKind;
  now?: Date;
  fetchQuotes?: QuoteFetcher;
}): Promise<QuoteRefreshOutcome> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return { state: "unavailable", message: "O banco de dados não está configurado." };
  }

  const startedClock = Date.now();
  const clock = () => new Date(now.getTime() + (Date.now() - startedClock));
  const today = calendarDay(now);
  const claim = await claimRun(prisma, trigger, now, today);

  if (claim.state !== "claimed") {
    return claim;
  }

  // Fica fora do try para que, se a gravação falhar, cada ativo consultado
  // ainda apareça como falha no aviso.
  let results: QuoteResult[] | null = null;

  try {
    const currentMonth = await prisma.portfolioMonth.findUnique({
      where: { referenceDate: monthOf(today) },
      select: { id: true },
    });
    const scopeMonth =
      currentMonth ??
      (await prisma.portfolioMonth.findFirst({
        orderBy: { referenceDate: "desc" },
        select: { id: true },
      }));
    const requests = scopeMonth ? await buildQuoteRequests(prisma, scopeMonth.id) : { valid: [], failures: [] };
    const fetched = await fetchSafely(fetchQuotes, requests.valid);
    const fetchedAt = clock();
    const completed = completeResults(requests.valid, fetched).concat(requests.failures);
    results = completed;
    const metadata = new Map(requests.valid.map((request) => [request.symbol, request]));
    const successes = completed.filter((result) => result.status === "SUCCESS");
    const failures = completed.filter((result) => result.status === "FAILED");

    await prisma.$transaction(
      async (transaction) => {
        if (completed.length > 0) {
          await transaction.quoteRefreshResult.createMany({
            data: completed.map((result) => ({
              runId: claim.runId,
              symbol: result.symbol,
              provider: result.provider,
              status: result.status === "SUCCESS" ? QuoteUpdateStatus.SUCCESS : QuoteUpdateStatus.FAILED,
              valueBrl: result.status === "SUCCESS" ? toPrice(result.valueBrl) : null,
              errorCode: result.status === "FAILED" ? result.errorCode : null,
              errorMessage: result.status === "FAILED" ? result.errorMessage : null,
              fetchedAt,
            })),
          });
        }

        for (const success of successes) {
          const request = metadata.get(success.symbol);

          if (!request) {
            continue;
          }

          const price = toPrice(success.valueBrl);
          await transaction.dailyQuote.upsert({
            where: { symbol_quoteDate: { symbol: success.symbol, quoteDate: today } },
            create: {
              symbol: success.symbol,
              quoteDate: today,
              instrumentType: request.instrumentType,
              baseCurrency: request.baseCurrency,
              valueBrl: price,
              provider: success.provider,
              fetchedAt,
              runId: claim.runId,
            },
            update: {
              instrumentType: request.instrumentType,
              baseCurrency: request.baseCurrency,
              valueBrl: price,
              provider: success.provider,
              fetchedAt,
              runId: claim.runId,
            },
          });
        }

        if (currentMonth) {
          await applyToCurrentMonth(transaction, {
            monthId: currentMonth.id,
            referenceDate: monthOf(today),
            today,
            prices: new Map(successes.map((success) => [success.symbol, toPrice(success.valueBrl)])),
            metadata,
          });
        }

        await transaction.quoteRefreshRun.update({
          where: { id: claim.runId },
          data: {
            status:
              failures.length === 0
                ? QuoteRefreshStatus.COMPLETED
                : successes.length === 0
                  ? QuoteRefreshStatus.FAILED
                  : QuoteRefreshStatus.COMPLETED_WITH_ISSUES,
            finishedAt: clock(),
            portfolioMonthId: currentMonth?.id ?? null,
            errorMessage:
              failures.length === 0
                ? null
                : `${failures.length} de ${completed.length} cotações não foram atualizadas.`,
          },
        });
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
  } catch (error) {
    console.error("A atualização de cotações falhou.", error);
    await recordFailedRun(prisma, claim.runId, results, clock()).catch(() => undefined);
  }

  const run = await readRunView(prisma, claim.runId);

  return run
    ? { state: "done", run }
    : { state: "unavailable", message: "Não foi possível ler o resultado da atualização." };
}

export async function getQuoteRefreshSummary(now = new Date()): Promise<QuoteRefreshSummary | null> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return null;
  }

  try {
    const [lastRun, lastUpdated] = await Promise.all([
      prisma.quoteRefreshRun.findFirst({ orderBy: { startedAt: "desc" }, select: { id: true } }),
      // Só conta como atualização a execução que gravou alguma cotação; uma
      // competência sem ativos com ticker termina sem resultados.
      prisma.quoteRefreshRun.findFirst({
        where: {
          status: { in: [QuoteRefreshStatus.COMPLETED, QuoteRefreshStatus.COMPLETED_WITH_ISSUES] },
          results: { some: { status: QuoteUpdateStatus.SUCCESS } },
        },
        orderBy: { startedAt: "desc" },
        select: { finishedAt: true, startedAt: true },
      }),
    ]);

    return {
      generatedAt: now.toISOString(),
      lastUpdatedAt: lastUpdated ? (lastUpdated.finishedAt ?? lastUpdated.startedAt).toISOString() : null,
      lastRun: lastRun ? await readRunView(prisma, lastRun.id) : null,
    };
  } catch {
    return null;
  }
}

async function claimRun(
  prisma: PrismaClient,
  trigger: QuoteRefreshTriggerKind,
  now: Date,
  today: Date,
): Promise<{ state: "claimed"; runId: string } | Exclude<QuoteRefreshOutcome, { state: "done" | "unavailable" }>> {
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${QUOTE_REFRESH_LOCK_KEY})`;
    await transaction.quoteRefreshRun.updateMany({
      where: {
        status: QuoteRefreshStatus.RUNNING,
        startedAt: { lt: new Date(now.getTime() - STALE_RUN_MS) },
      },
      data: {
        status: QuoteRefreshStatus.FAILED,
        finishedAt: now,
        errorMessage: "A execução foi interrompida antes de terminar.",
      },
    });

    const running = await transaction.quoteRefreshRun.findFirst({
      where: { status: QuoteRefreshStatus.RUNNING },
      select: { id: true },
    });

    if (running) {
      return { state: "busy" as const, runId: running.id };
    }

    if (trigger === "AUTO") {
      const last = await transaction.quoteRefreshRun.findFirst({
        orderBy: { startedAt: "desc" },
        select: { startedAt: true },
      });

      if (last && !isRefreshDue(last.startedAt, now)) {
        return { state: "fresh" as const, lastStartedAt: last.startedAt.toISOString() };
      }
    }

    const run = await transaction.quoteRefreshRun.create({
      data: {
        trigger: trigger === "AUTO" ? QuoteRefreshTrigger.AUTO : QuoteRefreshTrigger.MANUAL,
        status: QuoteRefreshStatus.RUNNING,
        quoteDate: today,
        startedAt: now,
      },
      select: { id: true },
    });

    return { state: "claimed" as const, runId: run.id };
  });
}

// Encerra como falha uma execução cuja gravação não terminou. A transação
// principal foi desfeita, então os resultados são regravados aqui: cada ativo
// consultado vira uma falha com o motivo, para o aviso indicar cada um.
async function recordFailedRun(
  prisma: PrismaClient,
  runId: string,
  results: QuoteResult[] | null,
  finishedAt: Date,
) {
  await prisma.$transaction(async (transaction) => {
    if (results && results.length > 0) {
      await transaction.quoteRefreshResult.createMany({
        skipDuplicates: true,
        data: results.map((result) => ({
          runId,
          symbol: result.symbol,
          provider: result.provider,
          status: QuoteUpdateStatus.FAILED,
          // Sem o valor: ele pode ter sido a causa da falha na gravação.
          valueBrl: null,
          errorCode: result.status === "FAILED" ? result.errorCode : "NOT_SAVED",
          errorMessage:
            result.status === "FAILED" ? result.errorMessage : "A cotação foi obtida, mas não pôde ser gravada.",
          fetchedAt: finishedAt,
        })),
      });
    }

    await transaction.quoteRefreshRun.update({
      where: { id: runId },
      data: {
        status: QuoteRefreshStatus.FAILED,
        finishedAt,
        errorMessage: results
          ? "As cotações foram consultadas, mas não puderam ser gravadas."
          : "Não foi possível ler os ativos da carteira para atualizar as cotações.",
      },
    });
  });
}

async function buildQuoteRequests(prisma: PrismaClient, monthId: string) {
  const positions = await prisma.position.findMany({
    where: { portfolioMonthId: monthId, asset: { quoteSymbol: { not: null } } },
    select: { asset: { select: { quoteSymbol: true } } },
  });
  const symbols = [
    ...new Set(
      positions
        .map((position) => position.asset.quoteSymbol)
        .filter((symbol): symbol is string => Boolean(symbol)),
    ),
  ].sort((left, right) => left.localeCompare(right));
  const [monthQuotes, dailyQuotes] = await Promise.all([
    prisma.marketQuote.findMany({
      where: { symbol: { in: symbols } },
      orderBy: { referenceDate: "desc" },
      select: { symbol: true, instrumentType: true, baseCurrency: true },
    }),
    prisma.dailyQuote.findMany({
      where: { symbol: { in: symbols } },
      orderBy: { quoteDate: "desc" },
      select: { symbol: true, instrumentType: true, baseCurrency: true },
    }),
  ]);
  const metadata = new Map<string, QuoteRequest>();

  for (const quote of [...monthQuotes, ...dailyQuotes]) {
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
      failures.push(
        quoteFailure(
          symbol,
          "configuration",
          "MISSING_QUOTE_METADATA",
          `Não há histórico de ${symbol} para escolher o provedor da cotação.`,
        ),
      );
    }
  }

  return { valid, failures };
}

async function fetchSafely(fetchQuotes: QuoteFetcher, requests: QuoteRequest[]) {
  if (requests.length === 0) {
    return [];
  }

  try {
    return await fetchQuotes(requests);
  } catch (error) {
    const described = describeProviderError(error);
    return requests.map((request) =>
      quoteFailure(request.symbol, "provider", described.code, described.message),
    );
  }
}

// Garante exatamente um resultado válido por símbolo pedido.
function completeResults(requests: QuoteRequest[], fetched: QuoteResult[]) {
  const bySymbol = new Map<string, QuoteResult>();

  for (const result of fetched) {
    if (!bySymbol.has(result.symbol)) {
      bySymbol.set(result.symbol, result);
    }
  }

  return requests.map((request): QuoteResult => {
    const result = bySymbol.get(request.symbol);

    if (!result) {
      return quoteFailure(request.symbol, "provider", "MISSING_RESULT", "O provedor não devolveu este ativo.");
    }

    if (result.status === "SUCCESS" && !(Number.isFinite(result.valueBrl) && result.valueBrl > 0)) {
      return quoteFailure(
        request.symbol,
        result.provider,
        "INVALID_VALUE",
        "O provedor devolveu um valor que não é um preço válido.",
      );
    }

    return result;
  });
}

async function applyToCurrentMonth(
  transaction: Transaction,
  {
    monthId,
    referenceDate,
    today,
    prices,
    metadata,
  }: {
    monthId: string;
    referenceDate: Date;
    today: Date;
    prices: Map<string, Prisma.Decimal>;
    metadata: Map<string, QuoteRequest>;
  },
) {
  if (prices.size === 0) {
    return;
  }

  for (const [symbol, price] of prices) {
    const request = metadata.get(symbol);

    if (!request) {
      continue;
    }

    await transaction.marketQuote.upsert({
      where: { referenceDate_symbol: { referenceDate, symbol } },
      create: {
        referenceDate,
        symbol,
        instrumentType: request.instrumentType,
        baseCurrency: request.baseCurrency,
        valueBrl: price,
        quoteDate: today,
      },
      update: { valueBrl: price, quoteDate: today, carriedFrom: null },
    });
  }

  const positions = await transaction.position.findMany({
    where: { portfolioMonthId: monthId, asset: { quoteSymbol: { in: [...prices.keys()] } } },
    select: { id: true, quantity: true, asset: { select: { quoteSymbol: true } } },
  });

  for (const position of positions) {
    const price = position.asset.quoteSymbol ? prices.get(position.asset.quoteSymbol) : undefined;

    if (!price) {
      continue;
    }

    await transaction.position.update({
      where: { id: position.id },
      data: { unitPriceBrl: price, totalBrl: position.quantity.mul(price).toDecimalPlaces(2) },
    });
  }

  const usdBrl = prices.get("USD");

  if (usdBrl) {
    await transaction.position.updateMany({
      where: { portfolioMonthId: monthId, exchangeRateBrl: { not: null } },
      data: { exchangeRateBrl: usdBrl },
    });
  }
}

async function readRunView(prisma: PrismaClient, runId: string): Promise<QuoteRefreshRunView | null> {
  const run = await prisma.quoteRefreshRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      trigger: true,
      status: true,
      quoteDate: true,
      startedAt: true,
      finishedAt: true,
      errorMessage: true,
      portfolioMonth: { select: { referenceDate: true } },
      results: {
        orderBy: { symbol: "asc" },
        select: { symbol: true, provider: true, status: true, errorCode: true, errorMessage: true },
      },
    },
  });

  if (!run) {
    return null;
  }

  const failed = run.results.filter((result) => result.status === QuoteUpdateStatus.FAILED);
  const assets = await assetNamesBySymbol(
    prisma,
    failed.map((result) => result.symbol),
  );
  const failures: QuoteFailureView[] = failed.map((result) => ({
    symbol: result.symbol,
    assets: assets.get(result.symbol) ?? [],
    provider: result.provider,
    errorCode: result.errorCode ?? "UNKNOWN",
    errorMessage: result.errorMessage ?? "Falha sem descrição.",
  }));

  return {
    id: run.id,
    trigger: run.trigger,
    status: run.status,
    quoteDate: toDateKey(run.quoteDate),
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    succeeded: run.results.length - failed.length,
    failures,
    errorMessage: run.errorMessage,
    repricedMonth: run.portfolioMonth ? run.portfolioMonth.referenceDate.toISOString().slice(0, 7) : null,
  };
}

// Nomes dos ativos que usam cada símbolo na competência mais recente, para que
// os avisos indiquem o ativo e não só o ticker.
async function assetNamesBySymbol(prisma: PrismaClient, symbols: string[]) {
  const names = new Map<string, string[]>();

  if (symbols.length === 0) {
    return names;
  }

  const latest = await prisma.portfolioMonth.findFirst({
    orderBy: { referenceDate: "desc" },
    select: { id: true },
  });
  const assets = await prisma.asset.findMany({
    where: {
      quoteSymbol: { in: symbols },
      ...(latest ? { positions: { some: { portfolioMonthId: latest.id } } } : {}),
    },
    orderBy: { name: "asc" },
    select: { name: true, quoteSymbol: true },
  });

  for (const asset of assets) {
    if (!asset.quoteSymbol) {
      continue;
    }

    names.set(asset.quoteSymbol, [...(names.get(asset.quoteSymbol) ?? []), asset.name]);
  }

  return names;
}

function toPrice(value: number) {
  return new Prisma.Decimal(value).toDecimalPlaces(8);
}
