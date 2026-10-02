import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { providerForQuote } from "@/modules/portfolio/domain/asset-kinds";
import { getQuoteProviderConfiguration } from "@/modules/quotes/application/fetch-current-quotes";
import { addMonths, currentReferenceMonth, lastDayOf, toDateKey } from "@/modules/quotes/domain/calendar";
import {
  HISTORY_BACKFILL_MONTHS,
  monthEndPoints,
  monthsBetween,
  type DayValue,
} from "@/modules/quotes/domain/history-backfill";
import { fetchAlphaVantageMonthlyCloses } from "@/modules/quotes/infrastructure/alpha-vantage";
import { fetchUsdBrlDaily } from "@/modules/quotes/infrastructure/awesome-api";
import { fetchCoinGeckoDailyHistory, resolveCoinGeckoCoin } from "@/modules/quotes/infrastructure/coingecko";
import { describeProviderError } from "@/modules/quotes/infrastructure/http";

// Histórico de fechamento mensal dos ativos novos (spec 029). Depois de uma
// inclusão de posição no mês corrente, cada símbolo da competência corrente sem
// nenhuma cotação anterior ao mês recebe o fechamento dos últimos 36 meses, ou
// do que o provedor oferece, guardado no histórico diário no último pregão de
// cada mês. Uma consulta por ativo:
//
// - ações e ETFs, dos EUA ou da B3: TIME_SERIES_MONTHLY do Alpha Vantage, com
//   todo o histórico mensal; o Finnhub gratuito não tem histórico (HTTP 403);
// - cripto: market_chart da CoinGecko, limitado a 365 dias no plano gratuito;
// - os preços em dólar viram reais pelo fechamento do dólar no mesmo mês: o da
//   competência ou do histórico diário e, nos meses sem nenhum, a AwesomeAPI,
//   até 360 dias por consulta. O fechamento do dólar buscado fica guardado e
//   serve aos próximos ativos.
//
// Idempotente: um símbolo com qualquer cotação anterior ao mês não é buscado
// de novo. Nada é apagado nem sobrescrito.

export type BackfillReport = {
  symbol: string;
  provider: string;
  status: "SUCCESS" | "FAILED";
  months: number;
  message?: string;
};

type Prisma_ = NonNullable<ReturnType<typeof getPrismaClient>>;

export async function backfillNewAssetHistories(now = new Date()): Promise<BackfillReport[]> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return [];
  }

  const current = currentReferenceMonth(now);
  const toMonth = toDateKey(current).slice(0, 7);
  const fromMonth = toDateKey(addMonths(current, -HISTORY_BACKFILL_MONTHS)).slice(0, 7);
  const month = await prisma.portfolioMonth.findUnique({
    where: { referenceDate: current },
    select: {
      positions: { select: { asset: { select: { quoteSymbol: true, quoteProviderId: true } } } },
    },
  });

  if (!month) {
    return [];
  }

  const providerIds = new Map<string, string | null>();

  for (const { asset } of month.positions) {
    if (asset.quoteSymbol && asset.quoteSymbol !== "USD" && asset.quoteSymbol !== "BRL") {
      providerIds.set(asset.quoteSymbol, asset.quoteProviderId ?? providerIds.get(asset.quoteSymbol) ?? null);
    }
  }

  const reports: BackfillReport[] = [];
  const configuration = getQuoteProviderConfiguration();
  let usdRates: Map<string, number> | null = null;

  for (const [symbol, providerId] of providerIds) {
    const [earlierMonthly, earlierDaily, quote] = await Promise.all([
      prisma.marketQuote.count({ where: { symbol, referenceDate: { lt: current } } }),
      prisma.dailyQuote.count({ where: { symbol, quoteDate: { lt: current } } }),
      prisma.marketQuote.findUnique({
        where: { referenceDate_symbol: { referenceDate: current, symbol } },
        select: { instrumentType: true, baseCurrency: true },
      }),
    ]);

    if (earlierMonthly + earlierDaily > 0 || !quote) {
      continue;
    }

    const provider = providerForQuote(quote.instrumentType, quote.baseCurrency);

    try {
      let points: Map<string, DayValue>;
      let source: string;

      if (provider === "coingecko") {
        const coinId = providerId ?? (await resolveCoinGeckoCoin(symbol, configuration.coinGeckoApiKey))?.id;

        if (!coinId) {
          throw new Error(`A CoinGecko não encontrou ${symbol}.`);
        }

        points = monthEndPoints(await fetchCoinGeckoDailyHistory(coinId, configuration.coinGeckoApiKey), fromMonth, toMonth);
        source = "coingecko";
      } else if (provider === "finnhub" || provider === "alpha-vantage") {
        if (!configuration.alphaVantageApiKey) {
          throw new Error("Configure ALPHA_VANTAGE_API_KEY para buscar o histórico mensal.");
        }

        const closes = monthEndPoints(
          await fetchAlphaVantageMonthlyCloses(symbol, configuration.alphaVantageApiKey),
          fromMonth,
          toMonth,
        );
        source = "alpha-vantage";

        if (quote.baseCurrency === "USD") {
          usdRates ??= await usdMonthEndRates(prisma, fromMonth, toMonth, configuration.awesomeApiKey, now);
          points = new Map();

          for (const [key, close] of closes) {
            const rate = usdRates.get(key);

            if (rate) {
              points.set(key, { day: close.day, value: close.value * rate });
            }
          }
        } else {
          points = closes;
        }
      } else {
        continue;
      }

      const created = await prisma.dailyQuote.createMany({
        data: [...points.values()].map((point) => ({
          symbol,
          quoteDate: new Date(`${point.day}T00:00:00.000Z`),
          instrumentType: quote.instrumentType,
          baseCurrency: quote.baseCurrency,
          valueBrl: new Prisma.Decimal(point.value).toDecimalPlaces(8),
          provider: source,
          fetchedAt: now,
        })),
        skipDuplicates: true,
      });

      reports.push({ symbol, provider: source, status: "SUCCESS", months: created.count });
    } catch (error) {
      reports.push({ symbol, provider, status: "FAILED", months: 0, message: describeProviderError(error).message });
    }
  }

  for (const report of reports) {
    console.info(
      `Histórico de ${report.symbol} (${report.provider}): ${
        report.status === "SUCCESS" ? `${report.months} meses guardados` : `falhou: ${report.message}`
      }`,
    );
  }

  return reports;
}

/**
 * Fechamento do dólar em cada mês da janela: o da competência, senão o mais
 * recente do histórico diário e, nos meses sem nenhum, a AwesomeAPI, guardada
 * no histórico diário para os próximos ativos.
 */
async function usdMonthEndRates(prisma: Prisma_, fromMonth: string, toMonth: string, apiKey: string | undefined, now: Date) {
  const from = new Date(`${fromMonth}-01T00:00:00.000Z`);
  const to = new Date(`${toMonth}-01T00:00:00.000Z`);
  const [monthly, daily] = await Promise.all([
    prisma.marketQuote.findMany({
      where: { symbol: "USD", carriedFrom: null, referenceDate: { gte: from, lt: to } },
      select: { referenceDate: true, valueBrl: true },
    }),
    prisma.dailyQuote.findMany({
      where: { symbol: "USD", quoteDate: { gte: from, lt: to } },
      select: { quoteDate: true, valueBrl: true },
    }),
  ]);

  const rates = new Map<string, number>();

  for (const [key, point] of monthEndPoints(
    daily.map((quote) => ({ day: toDateKey(quote.quoteDate), value: quote.valueBrl.toNumber() })),
    fromMonth,
    toMonth,
  )) {
    rates.set(key, point.value);
  }

  for (const quote of monthly) {
    rates.set(toDateKey(quote.referenceDate).slice(0, 7), quote.valueBrl.toNumber());
  }

  const missing = monthsBetween(fromMonth, toMonth).filter((key) => !rates.has(key));

  if (missing.length === 0) {
    return rates;
  }

  // Do mês faltante mais recente para o mais antigo, em janelas de até 360
  // dias, enquanto a AwesomeAPI devolver dias novos.
  const fetched: DayValue[] = [];
  let end = toDateKey(lastDayOf(new Date(`${missing.at(-1)}-01T00:00:00.000Z`)));
  const start = `${missing[0]}-01`;

  for (let page = 0; page < 6 && end >= start; page += 1) {
    const days = await fetchUsdBrlDaily(start, end, apiKey);

    if (days.length === 0) {
      break;
    }

    fetched.push(...days);
    const earliest = days.reduce((min, day) => (day.day < min ? day.day : min), days[0].day);
    const previous = new Date(`${earliest}T00:00:00.000Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    end = toDateKey(previous);
  }

  const closings = [...monthEndPoints(fetched, fromMonth, toMonth)].filter(([key]) => missing.includes(key));

  await prisma.dailyQuote.createMany({
    data: closings.map(([, point]) => ({
      symbol: "USD",
      quoteDate: new Date(`${point.day}T00:00:00.000Z`),
      instrumentType: "FIAT",
      baseCurrency: "USD",
      valueBrl: new Prisma.Decimal(point.value).toDecimalPlaces(8),
      provider: "awesome-api",
      fetchedAt: now,
    })),
    skipDuplicates: true,
  });

  for (const [key, point] of closings) {
    rates.set(key, point.value);
  }

  return rates;
}
