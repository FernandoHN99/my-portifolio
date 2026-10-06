import { Prisma, type PortfolioMonthStatus } from "@/generated/prisma/client";
import { getUserDb } from "@/lib/user-db";
import { readMonthQuoteValues, readQuoteSeries } from "@/modules/quotes/application/month-quote-values";
import type { PortfolioMonthSummary } from "@/modules/portfolio/application/get-portfolio-months";
import {
  buildHistorySlots,
  monthKey,
  summarizeHistory,
  type HistorySlot,
  type PositionObservation,
  type PositionSummary,
} from "@/modules/portfolio/domain/position-history";
import { calendarDay, lastDayOf, toDateKey } from "@/modules/quotes/domain/calendar";
import { buildPriceHistory, type PriceHistory } from "@/modules/quotes/domain/price-history";
import { emptyRecordedMonth, recordedByMonth } from "@/modules/portfolio/domain/position-transactions";
import { autoIncomeParts, indexerOfSubclass, type AutoIncomeIndexer } from "@/modules/portfolio/domain/fixed-income-policy";
import { businessDaysBetween } from "@/modules/portfolio/domain/business-days";

// Dados da página de uma posição (spec 016): a posição é a combinação de conta
// e ativo, pelos identificadores, em todas as competências. O ativo em outras
// contas entra para o recorte "Todas as contas" e para dizer onde ele estava
// quando a posição falta na conta.

export type PositionScopeView = {
  slots: HistorySlot[];
  summary: PositionSummary;
  transactions: PositionTransactionView[];
};

export type OtherAccountHolding = {
  accountId: string;
  label: string;
  firstMonth: string;
  lastMonth: string;
  months: number;
};

export type PositionHistoryView = {
  accountId: string;
  assetId: string;
  assetName: string;
  ticker: string | null;
  quoteSymbol: string | null;
  baseCurrency: string;
  /** AAAA-MM-DD, quando informado na inclusão (spec 026). */
  maturityDate: string | null;
  /** Prazo de liquidez do ativo, opcional (spec 039). */
  liquidity: string | null;
  institutionName: string;
  accountName: string;
  selectedMonth: string;
  monthStatus: PortfolioMonthStatus;
  /** Dia de referência do aviso de vencimento, como na tabela de Posições. */
  referenceDay: string;
  /** Câmbio da competência selecionada. */
  usdRate: number | null;
  /** Total de cada classe na competência selecionada, para a parcela da posição. */
  classTotals: Record<string, number>;
  otherAccounts: OtherAccountHolding[];
  account: PositionScopeView;
  /** Nulo quando o ativo nunca esteve em outra conta. */
  all: PositionScopeView | null;
  prices: PriceHistory | null;
  /**
   * Histórico de cotações do símbolo (spec 053): `pending` enquanto o job
   * agendado não o carregou, `failed` quando a última tentativa falhou.
   */
  history: { state: "ready" | "pending" | "failed"; error: string | null } | null;
  /** Movimentações da posição nesta conta (spec 056), da mais recente para a mais antiga. */
  transactions: PositionTransactionView[];
  /** Rendimento automático na competência selecionada (specs 060 e 079). */
  cdi: CdiView | null;
  /** Rentabilidade das classificações, com ou sem o cálculo automático (spec 079). */
  rate: { parts: RatePart[]; automatic: boolean } | null;
};

/** Rentabilidade de uma classificação: % do CDI no pós-fixado, taxa ao ano no prefixado. */
export type RatePart = { indexer: AutoIncomeIndexer; percent: number; weight: number };

export type CdiView = {
  parts: RatePart[];
  /** AAAA-MM-DD do início do cálculo no mês. */
  start: string;
  baseBrl: number;
  /** Rendimento bruto calculado no mês, sem virar transação. */
  incomeBrl: number;
  balanceBrl: number;
  /** Última taxa usada; nulo antes da primeira. */
  through: string | null;
  error: string | null;
  /** Projeção bruta: no CDI, a última taxa diária mantida; no prefixado, a própria taxa. */
  projection: { until: string; businessDays: number; balanceBrl: number; dailyPercent: number; toMaturity: boolean } | null;
};

export type PositionTransactionView = {
  id: string;
  accountId: string;
  accountLabel: string;
  kind: "OPENING" | "CONTRIBUTION" | "WITHDRAWAL" | "INCOME";
  /** Perna de uma transferência interna, como a liquidação de um título (spec 059). */
  transferId: string | null;
  /** AAAA-MM-DD */
  occurredOn: string;
  quantity: number;
  unitPriceBrl: number | null;
  amountBrl: number;
  note: string | null;
  /** Competência em que foi registrada. */
  monthId: string;
  /** AAAA-MM */
  month: string;
  /**
   * Rendimento calculado pela taxa (spec 079): uma linha por mês, até o
   * último dia que rendeu, só de leitura.
   */
  automatic?: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getPositionHistory({
  accountId,
  assetId,
  months,
  selected,
}: {
  accountId: string;
  assetId: string;
  months: PortfolioMonthSummary[];
  selected: PortfolioMonthSummary | null;
}): Promise<PositionHistoryView | null> {
  const prisma = await getUserDb();

  if (!prisma || !selected || !UUID.test(accountId) || !UUID.test(assetId)) {
    return null;
  }

  try {
    const [asset, account, positions, classRows] = await Promise.all([
      prisma.asset.findUnique({
        where: { id: assetId },
        select: {
          name: true,
          ticker: true,
          quoteSymbol: true,
          baseCurrency: true,
          maturityDate: true,
          liquidity: true,
          autoIncome: true,
        },
      }),
      prisma.account.findUnique({
        where: { id: accountId },
        select: { name: true, institution: { select: { name: true } } },
      }),
      prisma.position.findMany({
        where: { assetId },
        select: {
          id: true,
          accountId: true,
          portfolioMonthId: true,
          openingQuantity: true,
          calculationStartDate: true,
          calculatedIncomeBrl: true,
          incomeCalculatedThrough: true,
          quantity: true,
          unitPriceBrl: true,
          totalBrl: true,
          strategy: true,
          portfolioMonth: { select: { referenceDate: true } },
          account: { select: { name: true, institution: { select: { name: true } } } },
          allocations: { select: { assetClass: true, subclass: true, duration: true, weight: true, ratePercent: true } },
        },
      }),
      prisma.positionAllocation.findMany({
        where: { position: { portfolioMonthId: selected.id } },
        select: { assetClass: true, weight: true, position: { select: { totalBrl: true } } },
      }),
    ]);

    if (!asset || !account || !positions.some((position) => position.accountId === accountId)) {
      return null;
    }

    // O rendimento calculado de cada mês (specs 060 e 079) entra como uma
    // movimentação de rendimento, só de leitura, no último dia que rendeu.
    const transactions = [...(await readTransactions(assetId)), ...automaticIncome(positions)].sort(
      (left, right) => right.occurredOn.localeCompare(left.occurredOn) || Number(Boolean(right.automatic)) - Number(Boolean(left.automatic)),
    );
    const recordedByAccount = new Map(
      [...new Set(positions.map((position) => position.accountId))].map((id) => [
        id,
        recordedByMonth(transactions.filter((entry) => entry.accountId === id).reverse()),
      ]),
    );
    // O acompanhamento começa na primeira movimentação da conta: depois dela, um
    // mês sem movimentações é um mês em que nada aconteceu, não uma fotografia
    // estimada (spec 073).
    const trackedSince = new Map(
      [...recordedByAccount].map(([id, byMonth]) => [id, [...byMonth.keys()].sort()[0] ?? null]),
    );
    const observations: PositionObservation[] = positions.map((position) => {
      const month = monthKey(position.portfolioMonth.referenceDate);
      const movements = recordedByAccount.get(position.accountId)?.get(month) ?? null;
      const since = trackedSince.get(position.accountId) ?? null;
      const tracked = since !== null && month >= since;
      const recorded = movements ?? (position.calculationStartDate || tracked ? emptyRecordedMonth() : null);
      return {
      month: monthKey(position.portfolioMonth.referenceDate),
      accountId: position.accountId,
      // Só a instituição: a conta saiu da interface (spec 040).
      accountLabel: position.account.institution.name,
      quantity: position.quantity.toNumber(),
      openingQuantity: position.openingQuantity.toNumber(),
      // A migração inicializou a base de todo o legado. Ter uma base não
      // significa conhecer as operações daquele mês (spec 058).
      recorded,
      unitPriceBrl: position.unitPriceBrl?.toNumber() ?? null,
      totalBrl: position.totalBrl.toNumber(),
      strategy: position.strategy,
      allocations: position.allocations.map((allocation) => ({
        assetClass: allocation.assetClass,
        subclass: allocation.subclass,
        duration: allocation.duration,
        weight: allocation.weight.mul(100).toNumber(),
      })),
    }; });

    const quoted = Boolean(asset.quoteSymbol);
    const monthTotals = months.map((month) => ({ month: month.month, totalBrl: month.totalBrl }));
    const selectedMonth = selected.month;
    const scope = (scopeAccountId: string | null): PositionScopeView => {
      const slots = buildHistorySlots({ months: monthTotals, observations, scopeAccountId, quoted });
      return {
        slots,
        summary: summarizeHistory(slots, selectedMonth, quoted),
        transactions: transactions.filter((entry) => scopeAccountId === null || entry.accountId === scopeAccountId),
      };
    };

    const others = new Map<string, OtherAccountHolding>();

    for (const observation of [...observations].sort((left, right) => left.month.localeCompare(right.month))) {
      if (observation.accountId === accountId) {
        continue;
      }

      const current = others.get(observation.accountId);

      if (current) {
        current.lastMonth = observation.month;
        current.months += 1;
      } else {
        others.set(observation.accountId, {
          accountId: observation.accountId,
          label: observation.accountLabel,
          firstMonth: observation.month,
          lastMonth: observation.month,
          months: 1,
        });
      }
    }

    const classTotals: Record<string, number> = {};

    for (const row of classRows) {
      classTotals[row.assetClass] =
        (classTotals[row.assetClass] ?? 0) + row.position.totalBrl.mul(row.weight).toNumber();
    }

    const today = calendarDay(new Date());
    const lastDay = lastDayOf(selected.referenceDate);
    const usdQuote = (await readMonthQuoteValues(prisma, selected.referenceDate, ["USD"])).get("USD");

    return {
      accountId,
      assetId,
      assetName: asset.name,
      ticker: asset.ticker,
      quoteSymbol: asset.quoteSymbol,
      baseCurrency: asset.baseCurrency,
      maturityDate: asset.maturityDate ? toDateKey(asset.maturityDate) : null,
      liquidity: asset.liquidity,
      institutionName: account.institution.name,
      accountName: account.name,
      selectedMonth,
      monthStatus: selected.status,
      referenceDay: toDateKey(today.getTime() < lastDay.getTime() ? today : lastDay),
      usdRate: usdQuote?.valueBrl.toNumber() ?? null,
      classTotals,
      otherAccounts: [...others.values()],
      account: scope(accountId),
      all: others.size > 0 ? scope(null) : null,
      prices: asset.quoteSymbol ? await getPriceHistory(asset.quoteSymbol, toDateKey(today)) : null,
      history: asset.quoteSymbol ? await readHistoryState(asset.quoteSymbol) : null,
      transactions: transactions.filter((entry) => entry.accountId === accountId),
      cdi: asset.autoIncome && !asset.quoteSymbol ? await readCdi(accountId, assetId, selected.id, asset.maturityDate) : null,
      rate: rateOf(positions, accountId, selected.id, asset.autoIncome),
    };
  } catch {
    return null;
  }
}

/**
 * Rentabilidade das classificações da posição na competência (spec 079) ou,
 * fora dela, na última em que a posição aparece. Classificações iguais somam
 * os pesos.
 */
function rateOf(
  positions: {
    accountId: string;
    portfolioMonthId: string;
    portfolioMonth: { referenceDate: Date };
    allocations: { subclass: string; weight: Prisma.Decimal; ratePercent: Prisma.Decimal | null }[];
  }[],
  accountId: string,
  monthId: string,
  automatic: boolean,
): PositionHistoryView["rate"] {
  const inAccount = positions.filter((position) => position.accountId === accountId);
  const current =
    inAccount.find((position) => position.portfolioMonthId === monthId) ??
    [...inAccount].sort((left, right) => right.portfolioMonth.referenceDate.getTime() - left.portfolioMonth.referenceDate.getTime())[0];
  const parts = current ? rateParts(current.allocations) : [];

  return parts.length > 0 ? { parts, automatic } : null;
}

function rateParts(allocations: { subclass: string; weight: Prisma.Decimal | string; ratePercent: Prisma.Decimal | string | null }[]) {
  const parts: RatePart[] = [];

  for (const allocation of allocations) {
    const indexer = indexerOfSubclass(allocation.subclass);

    if (!indexer || allocation.ratePercent === null) {
      continue;
    }

    const percent = Number(allocation.ratePercent);
    const weight = Number(allocation.weight);
    const same = parts.find((part) => part.indexer === indexer && part.percent === percent);

    if (same) {
      same.weight += weight;
    } else {
      parts.push({ indexer, percent, weight });
    }
  }

  return parts;
}

/**
 * Quadro do rendimento automático da posição na competência (specs 060 e
 * 079): o saldo bruto até o último dia que rendeu e, separada, a projeção até
 * o vencimento (ou por 12 meses), com a última taxa diária do CDI mantida e a
 * taxa prefixada, em dias úteis com os feriados nacionais.
 */
async function readCdi(accountId: string, assetId: string, monthId: string, maturity: Date | null): Promise<CdiView | null> {
  const prisma = (await getUserDb())!;
  const position = await prisma.position.findFirst({
    where: { accountId, assetId, portfolioMonthId: monthId, calculationStartDate: { not: null } },
    select: {
      openingQuantity: true,
      totalBrl: true,
      calculationStartDate: true,
      calculatedIncomeBrl: true,
      incomeCalculatedThrough: true,
      incomeCalculationError: true,
      asset: { select: { autoIncome: true, quoteSymbol: true } },
      allocations: { select: { subclass: true, weight: true, ratePercent: true } },
    },
  });
  const parts = position ? autoIncomeParts(position.asset, position.allocations) : null;

  if (!position?.calculationStartDate || !parts) {
    return null;
  }

  const from = position.incomeCalculatedThrough ? addDay(toDateKey(position.incomeCalculatedThrough)) : toDateKey(calendarDay(new Date()));
  const twelve = new Date(`${from}T00:00:00.000Z`);
  twelve.setUTCFullYear(twelve.getUTCFullYear() + 1);
  const maturityKey = maturity ? toDateKey(maturity) : null;
  const until = maturityKey && maturityKey > from ? maturityKey : maturityKey ? null : toDateKey(twelve);
  const latest = parts.some((part) => part.indexer === "CDI")
    ? await prisma.rateObservation.findFirst({ where: { indexer: "CDI" }, orderBy: { date: "desc" }, select: { dailyPercent: true } })
    : null;
  let projection: CdiView["projection"] = null;

  if (until && (latest || parts.every((part) => part.indexer === "PRE"))) {
    // Fator diário da posição: a média dos fatores das classificações pelos
    // pesos, em dias úteis com os feriados nacionais, como os bancos (spec 079).
    const total = parts.reduce((sum, part) => sum.plus(part.weight), new Prisma.Decimal(0));
    const daily = parts.reduce((sum, part) => {
      const rate = new Prisma.Decimal(part.ratePercent).div(100);
      const factor =
        part.indexer === "PRE"
          ? new Prisma.Decimal(1).plus(rate).pow(new Prisma.Decimal(1).div(252))
          : new Prisma.Decimal(1).plus(latest!.dailyPercent.div(100).mul(rate));
      return sum.plus(factor.mul(part.weight).div(total));
    }, new Prisma.Decimal(0));
    const businessDays = businessDaysBetween(from, until);
    projection = {
      until,
      businessDays,
      dailyPercent: daily.minus(1).mul(100).toNumber(),
      toMaturity: Boolean(maturityKey),
      balanceBrl: position.totalBrl.mul(daily.pow(businessDays)).toDecimalPlaces(2).toNumber(),
    };
  }

  return {
    parts: rateParts(position.allocations),
    start: toDateKey(position.calculationStartDate),
    baseBrl: position.openingQuantity.toNumber(),
    incomeBrl: position.calculatedIncomeBrl.toNumber(),
    balanceBrl: position.totalBrl.toNumber(),
    through: position.incomeCalculatedThrough ? toDateKey(position.incomeCalculatedThrough) : null,
    error: position.incomeCalculationError,
    projection,
  };
}

/**
 * Rendimento calculado de cada mês (specs 060 e 079) como uma movimentação de
 * rendimento, só de leitura: a soma do mês até o último dia que rendeu.
 */
function automaticIncome(
  positions: {
    id: string;
    accountId: string;
    portfolioMonthId: string;
    calculatedIncomeBrl: Prisma.Decimal;
    incomeCalculatedThrough: Date | null;
    portfolioMonth: { referenceDate: Date };
    account: { institution: { name: string } };
  }[],
): PositionTransactionView[] {
  return positions.flatMap((position) => {
    const income = position.calculatedIncomeBrl.toDecimalPlaces(2);

    if (income.isZero()) {
      return [];
    }

    const day = position.incomeCalculatedThrough ?? position.portfolioMonth.referenceDate;
    return [
      {
        id: `auto-${position.id}`,
        accountId: position.accountId,
        accountLabel: position.account.institution.name,
        kind: "INCOME" as const,
        transferId: null,
        occurredOn: toDateKey(day),
        quantity: income.abs().toNumber(),
        unitPriceBrl: null,
        amountBrl: income.toNumber(),
        note: `Rendimento automático até ${toDateKey(day).split("-").reverse().join("/")}`,
        monthId: position.portfolioMonthId,
        month: monthKey(position.portfolioMonth.referenceDate),
        automatic: true,
      },
    ];
  });
}

function addDay(day: string) {
  const value = new Date(`${day}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

async function readTransactions(assetId: string): Promise<PositionTransactionView[]> {
  const rows = await (await getUserDb())!.positionTransaction.findMany({
    where: { position: { assetId } },
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      kind: true,
      occurredOn: true,
      quantity: true,
      unitPriceBrl: true,
      amountBrl: true,
      note: true,
      transferId: true,
      position: {
        select: {
          accountId: true,
          account: { select: { institution: { select: { name: true } } } },
          portfolioMonthId: true,
          portfolioMonth: { select: { referenceDate: true } },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    accountId: row.position.accountId,
    accountLabel: row.position.account.institution.name,
    kind: row.kind,
    occurredOn: toDateKey(row.occurredOn),
    quantity: row.quantity.toNumber(),
    unitPriceBrl: row.unitPriceBrl?.toNumber() ?? null,
    amountBrl: row.amountBrl.toNumber(),
    note: row.note,
    transferId: row.transferId,
    monthId: row.position.portfolioMonthId,
    month: monthKey(row.position.portfolioMonth.referenceDate),
  }));
}

async function readHistoryState(symbol: string): Promise<PositionHistoryView["history"]> {
  // O cadastro dos símbolos é compartilhado; o cliente com escopo o lê sem filtro.
  const registry = await (await getUserDb())!.quoteSymbol.findUnique({
    where: { symbol },
    select: { historySyncedUntil: true, historyError: true },
  });

  if (!registry || registry.historySyncedUntil) {
    return { state: "ready", error: null };
  }

  return registry.historyError
    ? { state: "failed", error: registry.historyError }
    : { state: "pending", error: null };
}

async function getPriceHistory(symbol: string, today: string): Promise<PriceHistory> {
  const prisma = (await getUserDb())!;
  const symbols = symbol === "USD" ? ["USD"] : [symbol, "USD"];
  // Uma cotação digitada pelo usuário vale por cima da compartilhada (spec 051).
  const [monthly, daily] = await Promise.all([
    readQuoteSeries(prisma, symbols),
    prisma.dailyQuote.findMany({
      where: { symbol: { in: symbols } },
      orderBy: { quoteDate: "asc" },
      select: { symbol: true, quoteDate: true, valueBrl: true },
    }),
  ]);

  const toMonthly = (quote: (typeof monthly)[number]) => ({
    month: monthKey(quote.referenceDate),
    valueBrl: quote.valueBrl.toNumber(),
    quoteDate: quote.quoteDate ? toDateKey(quote.quoteDate) : null,
    carriedFrom: quote.carriedFrom ? monthKey(quote.carriedFrom) : null,
  });
  const toDaily = (quote: (typeof daily)[number]) => ({
    day: toDateKey(quote.quoteDate),
    valueBrl: quote.valueBrl.toNumber(),
  });

  return buildPriceHistory({
    symbol,
    monthly: monthly.filter((quote) => quote.symbol === symbol).map(toMonthly),
    daily: daily.filter((quote) => quote.symbol === symbol).map(toDaily),
    usdMonthly: monthly.filter((quote) => quote.symbol === "USD").map(toMonthly),
    usdDaily: daily.filter((quote) => quote.symbol === "USD").map(toDaily),
    today,
  });
}
