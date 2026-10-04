// Classificação fixa do rateio (spec 068): as classes, subclasses e prazos de
// resgate da planilha, dependentes entre si. As metas de alocação e o comprar
// e vender agrupam por esses valores, por isso o usuário escolhe numa lista e
// não digita texto livre. Sem dependências de banco, para o servidor e a tela.

import { NO_REDEMPTION } from "@/modules/portfolio/domain/redemption";

export const ASSET_CLASSES = ["Caixa", "Cripto", "Renda Fixa", "Renda Variável", "Reserva"] as const;

export type AssetClass = (typeof ASSET_CLASSES)[number];

/** Subclasses de cada classe, na ordem da planilha. */
export const SUBCLASSES_BY_CLASS: Record<AssetClass, readonly string[]> = {
  Caixa: ["Pós-fixado", "Stablecoin"],
  Cripto: ["BTC", "Altcoin", "Stablecoin"],
  "Renda Fixa": ["Pós-fixado", "IPCA"],
  "Renda Variável": ["Ações EUA", "Ações - Ex: USA", "Ações BR", "Imobiliário BR", "Commoditie"],
  Reserva: ["Commoditie"],
};

/**
 * Prazos de resgate de cada classe: a renda fixa escolhe entre curto, médio e
 * longo (as metas de renda fixa são por subclasse e prazo); o caixa é sempre
 * curto; as demais não têm prazo.
 */
export const REDEMPTIONS_BY_CLASS: Record<AssetClass, readonly string[]> = {
  Caixa: ["Curto"],
  Cripto: [NO_REDEMPTION],
  "Renda Fixa": ["Curto", "Médio", "Longo"],
  "Renda Variável": [NO_REDEMPTION],
  Reserva: [NO_REDEMPTION],
};

export function isAssetClass(value: string): value is AssetClass {
  return (ASSET_CLASSES as readonly string[]).includes(value);
}

export function subclassesOf(assetClass: string): readonly string[] {
  return isAssetClass(assetClass) ? SUBCLASSES_BY_CLASS[assetClass] : [];
}

export function redemptionsOf(assetClass: string): readonly string[] {
  return isAssetClass(assetClass) ? REDEMPTIONS_BY_CLASS[assetClass] : [];
}

/**
 * Classificação ajustada à classe escolhida: mantém subclasse e resgate quando
 * valem na classe nova e, quando só há uma opção, já a escolhe.
 */
export function fitClassification(row: { assetClass: string; subclass: string; duration: string }) {
  const subclasses = subclassesOf(row.assetClass);
  const redemptions = redemptionsOf(row.assetClass);

  return {
    assetClass: row.assetClass,
    subclass: subclasses.includes(row.subclass) ? row.subclass : subclasses.length === 1 ? subclasses[0] : "",
    duration: redemptions.includes(row.duration) ? row.duration : redemptions.length === 1 ? redemptions[0] : "",
  };
}

/** Mensagem para uma classificação fora da lista, ou `null` quando vale. */
export function classificationIssue(row: { assetClass: string; subclass: string; duration: string }) {
  if (!isAssetClass(row.assetClass)) {
    return `A classe "${row.assetClass}" não está na lista.`;
  }

  if (!SUBCLASSES_BY_CLASS[row.assetClass].includes(row.subclass)) {
    return `A subclasse "${row.subclass}" não pertence a ${row.assetClass}.`;
  }

  if (!REDEMPTIONS_BY_CLASS[row.assetClass].includes(row.duration)) {
    return `O resgate "${row.duration}" não vale para ${row.assetClass}.`;
  }

  return null;
}

// Tipo do ativo (spec 068): a visão macro da carteira, como "X% em Tesouro
// Direto" ou "Y% em ETF dos EUA". Independe da classificação do rateio. Os
// tipos da inclusão de posição são os mesmos, mais a previdência.

export const ASSET_TYPES = [
  "us-etf",
  "us-stock",
  "br-etf",
  "br-stock",
  "crypto",
  "treasury",
  "fixed-income",
  "pension",
  "brl-cash",
  "usd-balance",
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  "us-etf": "ETF dos EUA",
  "us-stock": "Ação dos EUA",
  "br-etf": "ETF da B3",
  "br-stock": "Ação ou FII da B3",
  crypto: "Cripto",
  treasury: "Tesouro Direto",
  "fixed-income": "Renda fixa",
  pension: "Previdência",
  "brl-cash": "Caixa em reais",
  "usd-balance": "Caixa em dólar",
};

export function isAssetType(value: string | null | undefined): value is AssetType {
  return value !== null && value !== undefined && (ASSET_TYPES as readonly string[]).includes(value);
}

/**
 * Tipo do ativo: o escolhido, ou, nos ativos antigos ainda sem tipo, o
 * deduzido do símbolo, da moeda e do nome.
 */
export function assetTypeOf(asset: {
  assetType: string | null;
  quoteSymbol: string | null;
  baseCurrency: string;
  name: string;
  cashAccount?: boolean;
}): AssetType {
  if (isAssetType(asset.assetType)) {
    return asset.assetType;
  }

  const name = asset.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const symbol = asset.quoteSymbol;

  if (symbol === null) {
    if (/tesouro/.test(name)) return "treasury";
    if (/previd/.test(name)) return "pension";
    if (asset.cashAccount || /\b(conta|porquinho|cofrinho|confrinho|carteira)\b/.test(name)) return "brl-cash";
    return "fixed-income";
  }

  if (symbol === "USD") return "usd-balance";
  if (symbol.startsWith("TD:")) return "treasury";
  if (asset.baseCurrency === "BTC" || asset.baseCurrency === "Altcoins") return "crypto";
  if (symbol.endsWith(".SAO")) return /\betf\b/.test(name) ? "br-etf" : "br-stock";
  return /\betf\b/.test(name) ? "us-etf" : "us-stock";
}
