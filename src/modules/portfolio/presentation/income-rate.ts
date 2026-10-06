import type { AutoIncomeIndexer } from "@/modules/portfolio/domain/fixed-income-policy";

const PERCENT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });

/** Rentabilidade de uma classificação (spec 079), como "105% do CDI" ou "12,5% ao ano". */
export function rateLabel(part: { indexer: AutoIncomeIndexer; percent: number }) {
  return `${PERCENT.format(part.percent)}% ${part.indexer === "PRE" ? "ao ano" : "do CDI"}`;
}

/** As taxas das classificações, na ordem do rateio. */
export function ratesLabel(parts: readonly { indexer: AutoIncomeIndexer; percent: number }[]) {
  return parts.map(rateLabel).join(" · ");
}
