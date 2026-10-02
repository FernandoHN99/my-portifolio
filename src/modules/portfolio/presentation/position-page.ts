import { monthFromKey } from "@/modules/portfolio/domain/position-history";
import { formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";

// Endereços e textos da página da posição (spec 016).

/** Parâmetros que só a página da posição usa e que não voltam para a tabela. */
const POSITION_PAGE_PARAMS = ["contas"];

/**
 * A posição é aberta pela conta e pelo ativo, os identificadores que a
 * definem em todas as competências. A query da tabela (mês, filtros, ordem e
 * agrupamento) vai junto para a volta reabrir a tabela como estava.
 */
export function positionHref(accountId: string, assetId: string, search: string | URLSearchParams) {
  return `/posicoes/${accountId}/${assetId}${queryOf(search)}`;
}

export function positionsTableHref(search: string | URLSearchParams) {
  return `/posicoes${queryOf(search)}`;
}

function queryOf(search: string | URLSearchParams) {
  const params = new URLSearchParams(search);

  for (const key of POSITION_PAGE_PARAMS) {
    params.delete(key);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Competência AAAA-MM como "Set/26". */
export function monthLabel(month: string) {
  return formatMonthCompact(monthFromKey(month));
}

/** Intervalo de competências, como "Mar/24 a Jul/25" ou só "Jul/24". */
export function monthRangeLabel(first: string, last: string) {
  return first === last ? monthLabel(first) : `${monthLabel(first)} a ${monthLabel(last)}`;
}

/** Unidade da quantidade de um ativo cotado: o ticker, sem o sufixo da B3. */
export function quantityUnit(quoteSymbol: string | null, ticker: string | null) {
  return (ticker ?? quoteSymbol ?? "").replace(/\.SAO$/, "");
}

/** Quantidade de um ativo cotado; saldos em dólar aparecem em US$. */
export function formatQuantity(quantity: number, quoteSymbol: string | null, ticker: string | null) {
  if (quoteSymbol === "USD") {
    return `US$ ${formatUsd(quantity)}`;
  }

  return `${quantity.toLocaleString("pt-BR", { maximumFractionDigits: 8 })} ${quantityUnit(quoteSymbol, ticker)}`;
}

export function formatUsd(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Valor com sinal, como "+R$ 1.234,56" ou "−R$ 12,00". */
export function formatSignedBrl(value: number) {
  const formatted = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  }).format(value);

  return formatted;
}

/** Pontos percentuais com sinal, como "+2,7 p.p.". */
export function formatPoints(value: number) {
  const formatted = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  }).format(value);

  return `${formatted} p.p.`;
}

/**
 * Preço médio estimado: centavos a partir de R$ 100, quatro casas entre R$ 1 e
 * R$ 100, como o câmbio, e até oito abaixo disso. É uma estimativa e não
 * precisa da precisão guardada nas cotações.
 */
export function formatEstimatedPrice(value: number) {
  const digits = Math.abs(value) >= 100 ? 2 : Math.abs(value) >= 1 ? 4 : 8;

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  }).format(value);
}
