import { Prisma } from "@/generated/prisma/client";

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
export type CdiValuation =
  | { state: "calculated"; balance: string; income: string; lastRateDate: string | null; rateDays: number }
  | { state: "unavailable"; message: string };

export function calculateCdiMonth(input: {
  openingBalance: string;
  startDate: string;
  asOf: string;
  maturityDate?: string | null;
  cdiPercent: string;
  movements: CdiMovement[];
  rates: CdiRate[];
  verifiedCoverage: RateWindow[];
}): CdiValuation {
  if (!validDate(input.startDate) || !validDate(input.asOf) || input.startDate > input.asOf) {
    return { state: "unavailable", message: "Confira a data financeira da base do cálculo." };
  }
  const percentage = decimal(input.cdiPercent);
  let balance = decimal(input.openingBalance);
  if (!percentage?.greaterThan(0) || !balance || balance.isNegative()) {
    return { state: "unavailable", message: "Confira o saldo da base e o percentual do CDI." };
  }
  const startingBalance = balance;
  const end = input.maturityDate && input.maturityDate < input.asOf ? input.maturityDate : input.asOf;
  if (!validDate(end)) {
    return { state: "unavailable", message: "Confira o vencimento do ativo." };
  }
  const movements = [...input.movements].sort((left, right) => left.date.localeCompare(right.date));
  const rateMap = new Map(input.rates.map((rate) => [rate.date, rate.dailyPercent]));
  let netMovements = new Decimal(0);
  let lastRateDate: string | null = null;
  let rateDays = 0;
  let cursor = input.startDate;

  const accrueUntil = (until: string): string | null => {
    for (; cursor < until && cursor < end; cursor = nextDay(cursor)) {
      if (balance!.isZero()) {
        continue;
      }
      const rateText = rateMap.get(cursor);
      // CDI é de dias úteis; para os demais dias, só a resposta integral da
      // fonte informa se houve observação. Nunca repetir a taxa anterior.
      if (!weekend(cursor) && !input.verifiedCoverage.some((window) => window.from <= cursor && cursor <= window.through)) {
        return `O histórico do CDI ainda não foi conferido para ${cursor}. O saldo conhecido foi preservado.`;
      }
      if (rateText === undefined) {
        continue;
      }
      const rate = decimal(rateText);
      if (!rate || rate.isNegative() || weekend(cursor)) {
        return `A taxa do CDI de ${cursor} não é válida.`;
      }
      const factor = new Decimal(1).plus(rate.div(100).mul(percentage.div(100)));
      balance = balance!.mul(factor);
      lastRateDate = cursor;
      rateDays += 1;
    }
    return null;
  };

  for (const entry of movements) {
    if (!validDate(entry.date) || entry.date > input.asOf) {
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
      return { state: "unavailable", message: "A retirada é maior que o saldo disponível naquela data." };
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
