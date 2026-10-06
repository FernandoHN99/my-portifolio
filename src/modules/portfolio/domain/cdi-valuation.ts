import { Prisma } from "@/generated/prisma/client";
import { isBusinessDay } from "@/modules/portfolio/domain/business-days";

// SGS12 é percentual ao dia. Convenção B3: [aplicação, atualização/vencimento),
// início inclusive e fim exclusive. Datas sem CDI publicado não recebem taxa
// inventada. Decimais de alta precisão; arredondamento monetário só no saldo.
const Decimal = Prisma.Decimal.clone({ precision: 40, rounding: Prisma.Decimal.ROUND_HALF_UP });

export type CdiRate = { date: string; dailyPercent: string };
export type RateWindow = { from: string; through: string };
export type CdiMovement = {
  date: string;
  kind: "OPENING" | "CONTRIBUTION" | "WITHDRAWAL" | "INCOME";
  amount: string;
};
/** Retirada acima do saldo do dia: a movimentação é recusada, não só registrada. */
export const WITHDRAWAL_ABOVE_BALANCE = "A retirada é maior que o saldo disponível naquela data.";
export type CdiValuation =
  | { state: "calculated"; balance: string; income: string; lastRateDate: string | null; rateDays: number }
  | { state: "unavailable"; message: string };

type MonthInput = {
  openingBalance: string;
  startDate: string;
  asOf: string;
  maturityDate?: string | null;
  movements: CdiMovement[];
};

/**
 * Parte do rendimento (spec 079): uma classificação do rateio, com o peso dela
 * na posição e a taxa do indexador da subclasse (% do CDI no pós-fixado, % ao
 * ano no prefixado).
 */
export type IncomeMonthPart = { indexer: "CDI" | "PRE"; weight: string; ratePercent: string };

/** Fator de um dia: o multiplicador, nada (dia sem rendimento) ou um erro. */
type DailyFactor = (day: string) => { factor: InstanceType<typeof Decimal> } | { skip: true } | { error: string };

export function calculateCdiMonth(input: MonthInput & {
  cdiPercent: string;
  rates: CdiRate[];
  verifiedCoverage: RateWindow[];
}): CdiValuation {
  return calculateIncomeMonth({ ...input, parts: [{ indexer: "CDI", weight: "1", ratePercent: input.cdiPercent }] });
}

/**
 * Prefixado (spec 079), como os bancos: (1 + taxa ao ano) elevado a dias
 * úteis sobre 252, um dia útil por vez, com os feriados nacionais. O rendimento
 * de um dia útil entra no saldo do dia seguinte, como no CDI.
 */
export function calculatePrefixedMonth(input: MonthInput & { annualPercent: string }): CdiValuation {
  return calculateIncomeMonth({
    ...input,
    parts: [{ indexer: "PRE", weight: "1", ratePercent: input.annualPercent }],
    rates: [],
    verifiedCoverage: [],
  });
}

/**
 * Rendimento do mês pelas classificações (spec 079). A posição fica sempre
 * dividida pelos pesos do rateio, então o fator de cada dia é a média dos
 * fatores das partes, ponderada pelos pesos; uma parte sem rendimento no dia
 * entra com fator 1. Com uma parte só, é o cálculo do CDI ou do prefixado.
 */
export function calculateIncomeMonth(input: MonthInput & {
  parts: IncomeMonthPart[];
  rates: CdiRate[];
  verifiedCoverage: RateWindow[];
}): CdiValuation {
  const parts = input.parts.map((part) => ({ ...part, weight: decimal(part.weight), rate: decimal(part.ratePercent) }));

  if (parts.length === 0 || parts.some((part) => !part.weight?.greaterThan(0) || !part.rate?.greaterThan(0))) {
    return {
      state: "unavailable",
      message: parts.some((part) => part.indexer === "CDI")
        ? "Confira o saldo da base e o percentual do CDI."
        : "Confira o saldo da base e a taxa ao ano.",
    };
  }

  const total = parts.reduce((sum, part) => sum.plus(part.weight!), new Decimal(0));
  const rateMap = new Map(input.rates.map((rate) => [rate.date, rate.dailyPercent]));
  const factors = parts.map((part) => {
    const weight = part.weight!.div(total);

    if (part.indexer === "PRE") {
      const daily = new Decimal(1).plus(part.rate!.div(100)).pow(new Decimal(1).div(252));
      return { weight, factor: (day: string) => (isBusinessDay(day) ? { factor: daily } : { skip: true as const }) };
    }

    const percentage = part.rate!.div(100);
    return {
      weight,
      factor: (day: string): ReturnType<DailyFactor> => {
        const rateText = rateMap.get(day);
        // CDI é de dias úteis; para os demais dias, só a resposta integral da
        // fonte informa se houve observação. Nunca repetir a taxa anterior.
        if (!weekend(day) && !input.verifiedCoverage.some((window) => window.from <= day && day <= window.through)) {
          return { error: `O histórico do CDI ainda não foi conferido para ${day}. O saldo conhecido foi preservado.` };
        }
        if (rateText === undefined) {
          return { skip: true };
        }
        const rate = decimal(rateText);
        if (!rate || rate.isNegative() || weekend(day)) {
          return { error: `A taxa do CDI de ${day} não é válida.` };
        }
        return { factor: new Decimal(1).plus(rate.div(100).mul(percentage)) };
      },
    };
  });

  return accrueMonth(input, (day) => {
    let combined = new Decimal(0);
    let accrued = false;

    for (const part of factors) {
      const result = part.factor(day);
      if ("error" in result) {
        return result;
      }
      if ("factor" in result) {
        accrued = true;
      }
      combined = combined.plus(part.weight.mul("factor" in result ? result.factor : 1));
    }

    return accrued ? { factor: combined } : { skip: true };
  });
}

function accrueMonth(input: MonthInput, dailyFactor: DailyFactor): CdiValuation {
  if (!validDate(input.startDate) || !validDate(input.asOf) || input.startDate > input.asOf) {
    return { state: "unavailable", message: "Confira a data financeira da base do cálculo." };
  }
  let balance = decimal(input.openingBalance);
  if (!balance || balance.isNegative()) {
    return { state: "unavailable", message: "Confira o saldo da base do cálculo." };
  }
  const startingBalance = balance;
  const end = input.maturityDate && input.maturityDate < input.asOf ? input.maturityDate : input.asOf;
  if (!validDate(end)) {
    return { state: "unavailable", message: "Confira o vencimento do ativo." };
  }
  const movements = [...input.movements].sort((left, right) => left.date.localeCompare(right.date));
  let netMovements = new Decimal(0);
  let lastRateDate: string | null = null;
  let rateDays = 0;
  let cursor = input.startDate;

  const accrueUntil = (until: string): string | null => {
    for (; cursor < until && cursor < end; cursor = nextDay(cursor)) {
      if (balance!.isZero()) {
        continue;
      }
      const result = dailyFactor(cursor);
      if ("error" in result) {
        return result.error;
      }
      if ("skip" in result) {
        continue;
      }
      balance = balance!.mul(result.factor);
      lastRateDate = cursor;
      rateDays += 1;
    }
    return null;
  };

  for (const entry of movements) {
    // Uma movimentação depois do último dia com taxa (o CDI sai no dia
    // seguinte) entra no saldo e rende quando a taxa chegar.
    if (!validDate(entry.date)) {
      return { state: "unavailable", message: "Uma movimentação está fora da data de avaliação." };
    }
    const error = accrueUntil(entry.date);
    if (error) {
      return { state: "unavailable", message: error };
    }
    const amount = decimal(entry.amount);
    if (!amount || (entry.kind !== "INCOME" && amount.isNegative())) {
      return { state: "unavailable", message: "Uma movimentação tem valor inválido." };
    }
    const change = entry.kind === "WITHDRAWAL" ? amount.negated() : amount;
    balance = balance.plus(change);
    netMovements = netMovements.plus(change);
    if (balance.isNegative()) {
      return { state: "unavailable", message: WITHDRAWAL_ABOVE_BALANCE };
    }
  }
  const error = accrueUntil(input.asOf);
  if (error) {
    return { state: "unavailable", message: error };
  }
  return {
    state: "calculated",
    balance: balance.toDecimalPlaces(2).toFixed(2),
    income: balance.minus(startingBalance).minus(netMovements).toDecimalPlaces(8).toFixed(8),
    lastRateDate,
    rateDays,
  };
}

/** Projeção bruta: mesma taxa diária futura, quantidade de dias úteis explícita. */
export function projectCdiBalance(input: { balance: string; dailyPercent: string; cdiPercent: string; businessDays: number }) {
  const balance = new Decimal(input.balance);
  const factor = new Decimal(1).plus(new Decimal(input.dailyPercent).div(100).mul(new Decimal(input.cdiPercent).div(100)));
  if (!Number.isInteger(input.businessDays) || input.businessDays < 0 || balance.isNegative() || factor.lessThan(1)) {
    throw new Error("Confira os dados da projeção do CDI.");
  }
  return balance.mul(factor.pow(input.businessDays)).toDecimalPlaces(2).toFixed(2);
}

function decimal(value: string) {
  try {
    const result = new Decimal(value);
    return result.isFinite() ? result : null;
  } catch {
    return null;
  }
}
function validDate(day: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day)) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
}
function nextDay(day: string) {
  const value = new Date(`${day}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}
function weekend(day: string) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}
