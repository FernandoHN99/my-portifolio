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
import { fetchPtaxUsdPeriod } from "@/modules/quotes/infrastructure/bcb";
import { fetchBinanceMonthlyCloses } from "@/modules/quotes/infrastructure/binance";
import { fetchCoinGeckoDailyHistory, resolveCoinGeckoCoin } from "@/modules/quotes/infrastructure/coingecko";
import { describeProviderError } from "@/modules/quotes/infrastructure/http";
import { fetchYahooDailyHistory } from "@/modules/quotes/infrastructure/yahoo";

// Histórico de fechamento mensal dos ativos novos (spec 029). Depois de uma
// inclusão de posição no mês corrente, cada símbolo da competência corrente sem
// nenhuma cotação anterior ao mês recebe o fechamento dos últimos 36 meses, ou
// do que o provedor oferece, guardado no histórico diário no último pregão de
// cada mês. Uma consulta por ativo, com reserva (spec 037):
//
// - ações e ETFs, dos EUA ou da B3: Yahoo Finance, três anos de fechamento
//   diário sem chave; reserva no TIME_SERIES_MONTHLY do Alpha Vantage. O
//   Finnhub gratuito não tem histórico (HTTP 403);
// - cripto: velas mensais da Binance, com todo o histórico; reserva na
//   CoinGecko, limitada a 365 dias no plano gratuito;
// - os preços em dólar viram reais pelo fechamento do dólar no mesmo mês: o da
//   competência ou do histórico diário e, nos meses sem nenhum, a PTAX do Banco
//   Central, com a AwesomeAPI de reserva. O dólar buscado fica guardado e serve
//   aos próximos ativos.
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
      const usdRatesFor = async () =>
        (usdRates ??= await usdMonthEndRates(prisma, fromMonth, toMonth, configuration.awesomeApiKey, now));
      const inBrl = async (closes: Map<string, DayValue>, currency: string | null) => {
        if (currency !== "USD") {
          return closes;
        }

        const rates = await usdRatesFor();
        const converted = new Map<string, DayValue>();

        for (const [key, close] of closes) {
          const rate = rates.get(key);

          if (rate) {
            converted.set(key, { day: close.day, value: close.value * rate });
          }
        }

        return converted;
      };

      let points: Map<string, DayValue>;
      let source: string;

      if (provider === "coingecko") {
        // Binance: todo o histórico mensal numa consulta; CoinGecko: 365 dias.
        try {
          const binance = await fetchBinanceMonthlyCloses(symbol, HISTORY_BACKFILL_MONTHS + 2);
          points = await inBrl(monthEndPoints(binance.points, fromMonth, toMonth), binance.currency);
          source = "binance";
        } catch {
          const coinId = providerId ?? (await resolveCoinGeckoCoin(symbol, configuration.coinGeckoApiKey))?.id;

          if (!coinId) {
            throw new Error(`Nem a Binance nem a CoinGecko encontraram ${symbol}.`);
          }

          points = monthEndPoints(await fetchCoinGeckoDailyHistory(coinId, configuration.coinGeckoApiKey), fromMonth, toMonth);
          source = "coingecko";
        }
      } else if (provider === "finnhub" || provider === "yahoo" || provider === "alpha-vantage") {
        // Yahoo Finance: três anos de fechamento diário numa consulta, sem chave;
        // Alpha Vantage, reserva, com o histórico mensal e 25 consultas por dia.
        try {
          const yahoo = await fetchYahooDailyHistory(symbol, 3);
          points = await inBrl(monthEndPoints(yahoo.points, fromMonth, toMonth), yahoo.currency);
          source = "yahoo";
        } catch (yahooError) {
          if (!configuration.alphaVantageApiKey) {
            throw yahooError;
          }

          const closes = monthEndPoints(
            await fetchAlphaVantageMonthlyCloses(symbol, configuration.alphaVantageApiKey),
            fromMonth,
            toMonth,
          );
          points = await inBrl(closes, quote.baseCurrency === "USD" ? "USD" : "BRL");
          source = "alpha-vantage";
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

  // PTAX do Banco Central: o período inteiro numa consulta. Na falta dela, a
  // AwesomeAPI, do mês faltante mais recente para o mais antigo, em janelas de
  // até 360 dias, enquanto devolver dias novos.
  const start = `${missing[0]}-01`;
  const lastMissingDay = toDateKey(lastDayOf(new Date(`${missing.at(-1)}-01T00:00:00.000Z`)));
  let fetched: DayValue[] = [];
  let source = "bcb";

  try {
    fetched = await fetchPtaxUsdPeriod(start, lastMissingDay);
  } catch {
    source = "awesome-api";
    let end = lastMissingDay;

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
  }

  const closings = [...monthEndPoints(fetched, fromMonth, toMonth)].filter(([key]) => missing.includes(key));

  await prisma.dailyQuote.createMany({
    data: closings.map(([, point]) => ({
      symbol: "USD",
      quoteDate: new Date(`${point.day}T00:00:00.000Z`),
      instrumentType: "FIAT",
      baseCurrency: "USD",
      valueBrl: new Prisma.Decimal(point.value).toDecimalPlaces(8),
      provider: source,
      fetchedAt: now,
    })),
    skipDuplicates: true,
  });

  for (const [key, point] of closings) {
    rates.set(key, point.value);
  }

  return rates;
}
