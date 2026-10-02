// Histórico de preço de um símbolo para a página da posição (spec 016).
//
// Gráficos e valorização usam a cotação de fechamento de cada mês, a mais
// recente daquele mês (decisão do usuário em 2026-10-02, spec 028): um ponto
// por mês. Vale a cotação da competência, que é a usada pela carteira; nos
// meses sem ela, a cotação diária mais recente do mês, como as de fechamento
// buscadas ao incluir um ativo novo (spec 029). Cotações repetidas de outra
// competência (`carried_from`) não são observações e ficam de fora.
//
// O ponto fica no dia da cotação quando ele é conhecido e, nas importadas do
// Excel e nas editadas à mão, no último dia do mês, nunca depois de hoje.

export type MonthlyQuoteInput = {
  /** AAAA-MM */
  month: string;
  valueBrl: number;
  /** AAAA-MM-DD */
  quoteDate: string | null;
  carriedFrom: string | null;
};

export type DailyQuoteInput = {
  /** AAAA-MM-DD */
  day: string;
  valueBrl: number;
};

export type PricePoint = {
  /** Meia-noite UTC do dia, em milissegundos, para o eixo de tempo. */
  t: number;
  day: string;
  month: string;
  /** Mês ainda em curso: a cotação é a mais recente, não o fechamento. */
  open: boolean;
  valueBrl: number;
  /** Em dólar pelo câmbio de fechamento do mesmo mês. */
  valueUsd: number | null;
};

export type PriceHistory = {
  points: PricePoint[];
  /** Competências cuja cotação é repetida de outra e ficou fora do gráfico. */
  carriedMonths: string[];
};

type Closing = { day: string; valueBrl: number };

/** Fechamento de cada mês: a competência quando própria, senão o diário mais recente. */
export function monthlyClosings(monthly: MonthlyQuoteInput[], daily: DailyQuoteInput[], today: string) {
  const closings = new Map<string, Closing>();
  const carried = new Set<string>();

  for (const quote of daily) {
    const month = quote.day.slice(0, 7);
    const current = closings.get(month);

    if (!current || quote.day > current.day) {
      closings.set(month, { day: quote.day, valueBrl: quote.valueBrl });
    }
  }

  for (const quote of monthly) {
    if (quote.carriedFrom) {
      if (!closings.has(quote.month)) {
        carried.add(quote.month);
      }

      continue;
    }

    const lastDay = lastDayKey(quote.month);
    closings.set(quote.month, {
      day: quote.quoteDate ?? (lastDay < today ? lastDay : today),
      valueBrl: quote.valueBrl,
    });
  }

  return { closings, carried };
}

export function buildPriceHistory({
  symbol,
  monthly,
  daily,
  usdMonthly,
  usdDaily,
  today,
}: {
  symbol: string;
  monthly: MonthlyQuoteInput[];
  daily: DailyQuoteInput[];
  usdMonthly: MonthlyQuoteInput[];
  usdDaily: DailyQuoteInput[];
  /** AAAA-MM-DD */
  today: string;
}): PriceHistory {
  const inUsd = symbol !== "USD";
  const { closings, carried } = monthlyClosings(monthly, daily, today);
  const usd = inUsd ? monthlyClosings(usdMonthly, usdDaily, today).closings : new Map<string, Closing>();
  const currentMonth = today.slice(0, 7);

  const points: PricePoint[] = [...closings.entries()]
    .map(([month, closing]) => {
      const rate = usd.get(month)?.valueBrl;

      return {
        t: dayTime(closing.day),
        day: closing.day,
        month,
        open: month >= currentMonth,
        valueBrl: closing.valueBrl,
        valueUsd: inUsd && rate ? closing.valueBrl / rate : null,
      };
    })
    .sort((left, right) => left.t - right.t);

  return { points, carriedMonths: [...carried].sort() };
}

export function dayTime(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date);
}

function lastDayKey(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}
