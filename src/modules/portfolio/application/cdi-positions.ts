import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { calculateCdiMonth, type CdiMovement } from "@/modules/portfolio/domain/cdi-valuation";
import { calendarDay, toDateKey } from "@/modules/quotes/domain/calendar";
import { fetchCdiDaily } from "@/modules/quotes/infrastructure/bcb";
import { describeProviderError, QuoteHttpError } from "@/modules/quotes/infrastructure/http";

// Renda fixa a percentual do CDI (spec 060): o saldo bruto de cada posição
// configurada é a base do mês, no dia do início do cálculo, mais as
// movimentações do mês, cada uma rendendo a partir do próprio dia pelo CDI
// diário observado (série 12 do Banco Central). Sem IR nem IOF. O rendimento
// calculado fica na posição (`calculated_income_brl`), sem virar transação, e
// a data da última taxa usada fica em `income_calculated_through`. Quando falta
// taxa conferida, o saldo conhecido é preservado e o motivo fica registrado.

type Client = PrismaClient | Prisma.TransactionClient;

export type CdiRatesFetcher = (startDay: string, endDay: string) => Promise<{ date: string; dailyPercent: string }[]>;

export type CdiReport = {
  rates: { state: "fetched" | "fresh" | "skipped" | "failed"; inserted: number; through: string | null; message?: string };
  valued: number;
  failed: { positionId: string; message: string }[];
};

const INDEXER = "CDI";
/** Uma nova consulta ao Banco Central só depois de algumas horas. */
const RATES_REFRESH_MS = 3 * 60 * 60 * 1000;
/** O SGS aceita até dez anos por consulta; cinco deixam folga. */
const MAX_WINDOW_DAYS = 5 * 365;

const CDI_POSITION_SELECT = {
  id: true,
  openingQuantity: true,
  calculationStartDate: true,
  calculatedIncomeBrl: true,
  asset: { select: { cdiPercent: true, maturityDate: true, quoteSymbol: true } },
  transactions: {
    orderBy: [{ occurredOn: "asc" as const }, { createdAt: "asc" as const }],
    select: { kind: true, occurredOn: true, amountBrl: true },
  },
} satisfies Prisma.PositionSelect;

type CdiPosition = Prisma.PositionGetPayload<{ select: typeof CDI_POSITION_SELECT }>;

/** Posição com o cálculo pelo CDI ligado: o ativo tem o percentual e a posição, o início. */
export const CDI_POSITION_WHERE = {
  calculationStartDate: { not: null },
  asset: { cdiPercent: { not: null }, quoteSymbol: null },
} satisfies Prisma.PositionWhereInput;

/**
 * Busca no Banco Central o CDI que falta para as posições em uso: do início do
 * cálculo mais antigo (ou do dia seguinte ao último conferido) até hoje. A
 * janela conferida vai até a última taxa publicada; dias sem taxa dentro dela
 * são dias sem CDI (feriados).
 */
export async function syncCdiRates(
  prisma: PrismaClient,
  { now = new Date(), fetchRates = fetchCdiDaily, monthIds }: { now?: Date; fetchRates?: CdiRatesFetcher; monthIds: string[] },
): Promise<CdiReport["rates"]> {
  const earliest = await prisma.position.findFirst({
    where: { ...CDI_POSITION_WHERE, portfolioMonthId: { in: monthIds } },
    orderBy: { calculationStartDate: "asc" },
    select: { calculationStartDate: true },
  });

  if (!earliest?.calculationStartDate) {
    return { state: "skipped", inserted: 0, through: null };
  }

  const today = toDateKey(calendarDay(now));
  const coverage = await prisma.rateCoverage.findMany({ where: { indexer: INDEXER }, orderBy: { throughDate: "desc" } });
  const start = toDateKey(earliest.calculationStartDate);
  const covered = coverage.find((window) => toDateKey(window.fromDate) <= start);
  const latest = coverage[0];

  if (covered && latest && now.getTime() - latest.fetchedAt.getTime() < RATES_REFRESH_MS) {
    return { state: "fresh", inserted: 0, through: toDateKey(latest.throughDate) };
  }

  // Sem janela que comece antes do início mais antigo, a busca recomeça dele;
  // com ela, continua do dia seguinte ao último dia conferido.
  const from = covered ? nextDay(toDateKey(covered.throughDate)) : start;

  if (from > today) {
    return { state: "fresh", inserted: 0, through: covered ? toDateKey(covered.throughDate) : null };
  }

  try {
    const rates: { date: string; dailyPercent: string }[] = [];

    for (let windowStart = from; windowStart <= today; windowStart = nextDay(addDays(windowStart, MAX_WINDOW_DAYS))) {
      const windowEnd = minDay(addDays(windowStart, MAX_WINDOW_DAYS), today);

      try {
        rates.push(...(await fetchRates(windowStart, windowEnd)));
      } catch (error) {
        // O SGS responde 404 quando não há nenhum valor no período, como num
        // fim de semana: é uma resposta, não uma falha.
        if (!(error instanceof QuoteHttpError && error.statusCode === 404)) {
          throw error;
        }
      }
    }

    const valid = rates.filter(
      (rate) => /^\d{4}-\d{2}-\d{2}$/.test(rate.date) && rate.date >= from && rate.date <= today && Number(rate.dailyPercent) >= 0,
    );
    const fetchedAt = new Date();
    const created = await prisma.rateObservation.createMany({
      data: valid.map((rate) => ({
        indexer: INDEXER,
        date: new Date(`${rate.date}T00:00:00.000Z`),
        dailyPercent: new Prisma.Decimal(rate.dailyPercent),
        source: "bcb-sgs-12",
        fetchedAt,
      })),
      skipDuplicates: true,
    });
    const lastPublished = valid.reduce<string | null>((max, rate) => (!max || rate.date > max ? rate.date : max), null);

    if (lastPublished) {
      const fromDate = covered ? covered.fromDate : new Date(`${from}T00:00:00.000Z`);
      // Uma janela só, que cresce: do início até a última taxa publicada.
      await prisma.rateCoverage.deleteMany({ where: { indexer: INDEXER, fromDate } });
      await prisma.rateCoverage.create({
        data: {
          indexer: INDEXER,
          fromDate,
          throughDate: new Date(`${lastPublished}T00:00:00.000Z`),
          lastPublishedDate: new Date(`${lastPublished}T00:00:00.000Z`),
          fetchedAt,
        },
      });
    } else if (covered) {
      await prisma.rateCoverage.update({ where: { id: covered.id }, data: { fetchedAt } });
    }

    return { state: "fetched", inserted: created.count, through: lastPublished ?? (covered ? toDateKey(covered.throughDate) : null) };
  } catch (error) {
    return { state: "failed", inserted: 0, through: covered ? toDateKey(covered.throughDate) : null, message: describeProviderError(error).message };
  }
}

/**
 * Calcula o saldo bruto das posições pelo CDI e grava o resultado. `asOf` é o
 * dia da avaliação (exclusivo, convenção da B3), como o primeiro dia do mês
 * seguinte para fechar uma competência; por padrão, hoje. A avaliação nunca
 * passa do dia seguinte à última taxa conferida.
 */
export async function valueCdiPositions(
  client: Client,
  { where, now = new Date(), asOf }: { where: Prisma.PositionWhereInput; now?: Date; asOf?: string },
) {
  const positions = await client.position.findMany({ where: { ...where, ...CDI_POSITION_WHERE }, select: CDI_POSITION_SELECT });
  const results: { positionId: string; state: "calculated" | "unavailable"; message?: string }[] = [];

  if (positions.length === 0) {
    return results;
  }

  const earliest = positions.reduce(
    (min, position) => (position.calculationStartDate! < min ? position.calculationStartDate! : min),
    positions[0].calculationStartDate!,
  );
  const [rates, coverage] = await Promise.all([
    client.rateObservation.findMany({
      where: { indexer: INDEXER, date: { gte: earliest } },
      select: { date: true, dailyPercent: true },
    }),
    client.rateCoverage.findMany({ where: { indexer: INDEXER }, select: { fromDate: true, throughDate: true } }),
  ]);
  const rateList = rates.map((rate) => ({ date: toDateKey(rate.date), dailyPercent: rate.dailyPercent.toString() }));
  const windows = coverage.map((window) => ({ from: toDateKey(window.fromDate), through: toDateKey(window.throughDate) }));
  const lastVerified = windows.reduce<string | null>((max, window) => (!max || window.through > max ? window.through : max), null);
  // A avaliação vai até `asOf` (por padrão, hoje), sem passar do dia seguinte
  // à última taxa conferida.
  const until = asOf ?? toDateKey(calendarDay(now));
  const evaluation = lastVerified ? minDay(until, nextDay(lastVerified)) : until;

  for (const position of positions) {
    const result = valueOne(position, { rates: rateList, windows, asOf: evaluation });

    if (result.state === "calculated") {
      await client.position.update({
        where: { id: position.id },
        data: {
          quantity: new Prisma.Decimal(result.balance),
          totalBrl: new Prisma.Decimal(result.balance),
          calculatedIncomeBrl: new Prisma.Decimal(result.income),
          incomeCalculatedThrough: result.lastRateDate ? new Date(`${result.lastRateDate}T00:00:00.000Z`) : null,
          incomeCalculationError: null,
        },
      });
      results.push({ positionId: position.id, state: "calculated" });
    } else {
      await client.position.update({
        where: { id: position.id },
        data: { incomeCalculationError: result.message.slice(0, 500) },
      });
      results.push({ positionId: position.id, state: "unavailable", message: result.message });
    }
  }

  return results;
}

function valueOne(
  position: CdiPosition,
  { rates, windows, asOf }: { rates: { date: string; dailyPercent: string }[]; windows: { from: string; through: string }[]; asOf: string },
) {
  const start = toDateKey(position.calculationStartDate!);

  if (windows.length === 0) {
    return { state: "unavailable" as const, message: "O CDI do Banco Central ainda não foi carregado. O saldo conhecido foi preservado." };
  }

  const movements: CdiMovement[] = position.transactions.map((entry) => ({
    date: toDateKey(entry.occurredOn),
    kind: entry.kind,
    amount: entry.amountBrl.toString(),
  }));

  return calculateCdiMonth({
    openingBalance: position.openingQuantity.toString(),
    startDate: start,
    asOf: asOf < start ? start : asOf,
    maturityDate: position.asset.maturityDate ? toDateKey(position.asset.maturityDate) : null,
    cdiPercent: position.asset.cdiPercent!.toString(),
    movements,
    rates,
    verifiedCoverage: windows,
  });
}

function nextDay(day: string) {
  return addDays(day, 1);
}

function addDays(day: string, amount: number) {
  const value = new Date(`${day}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function minDay(left: string, right: string) {
  return left < right ? left : right;
}

/**
 * Passo do job agendado (spec 053): busca o CDI que falta e recalcula as
 * posições configuradas na competência mais recente de cada usuário, quando
 * ela é a do mês corrente.
 */
export async function syncCdi(
  prisma: PrismaClient,
  { now = new Date(), fetchRates = fetchCdiDaily }: { now?: Date; fetchRates?: CdiRatesFetcher } = {},
): Promise<CdiReport> {
  const currentMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const latest = await prisma.portfolioMonth.findMany({
    distinct: ["userId"],
    orderBy: [{ userId: "asc" }, { referenceDate: "desc" }],
    select: { id: true, referenceDate: true },
  });
  const monthIds = latest.filter((month) => month.referenceDate.getTime() === currentMonth.getTime()).map((month) => month.id);

  if (monthIds.length === 0) {
    return { rates: { state: "skipped", inserted: 0, through: null }, valued: 0, failed: [] };
  }

  const rates = await syncCdiRates(prisma, { now, fetchRates, monthIds });
  const results = rates.state === "skipped" ? [] : await valueCdiPositions(prisma, { where: { portfolioMonthId: { in: monthIds } }, now });

  return {
    rates,
    valued: results.filter((result) => result.state === "calculated").length,
    failed: results.flatMap((result) => (result.state === "unavailable" ? [{ positionId: result.positionId, message: result.message ?? "" }] : [])),
  };
}
