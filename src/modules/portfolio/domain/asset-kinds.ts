// Tipos de ativo que a inclusão de posição sabe cadastrar (spec 026). Cada tipo
// decide se o ativo tem ticker, qual provedor confere e cota esse ticker, a
// moeda base e o rateio inicial. Sem dependências de banco, para servir ao
// servidor e à interface.
//
// O roteamento segue o da atualização de cotações (`fetchCurrentQuotes`): o
// provedor indicado é o primeiro da cadeia de cada grupo (spec 037), câmbio na
// AwesomeAPI, cripto na CoinGecko, ativos com base USD no Finnhub e os da B3 no
// Yahoo Finance; os seguintes da cadeia são reservas.

export const ASSET_KINDS = [
  "us-etf",
  "us-stock",
  "br-etf",
  "br-stock",
  "crypto",
  "fixed-income",
  "brl-cash",
  "usd-balance",
] as const;

export type AssetKind = (typeof ASSET_KINDS)[number];

export type QuoteProvider = "finnhub" | "alpha-vantage" | "yahoo" | "coingecko" | "awesome-api";

export type AllocationSeed = { assetClass: string; subclass: string; duration: string };

export type AssetKindDefinition = {
  kind: AssetKind;
  label: string;
  /** Resumo mostrado ao lado do tipo na lista. */
  hint: string;
  /**
   * `market`: ticker digitado e conferido no provedor; `usd`: cotado pelo
   * dólar do mês, como Time Deposit e USDC; `null`: sem ticker, o valor
   * informado já é o saldo em reais.
   */
  ticker: "market" | "usd" | null;
  provider: QuoteProvider | null;
  instrumentType: string | null;
  /** Vencimento opcional, para ativos sem ticker de mercado. */
  allowsMaturity: boolean;
};

export const ASSET_KIND_DEFINITIONS: Record<AssetKind, AssetKindDefinition> = {
  "us-etf": {
    kind: "us-etf",
    label: "ETF dos EUA",
    hint: "Finnhub · USD",
    ticker: "market",
    provider: "finnhub",
    instrumentType: "ETF",
    allowsMaturity: false,
  },
  "us-stock": {
    kind: "us-stock",
    label: "Ação dos EUA",
    hint: "Finnhub · USD",
    ticker: "market",
    provider: "finnhub",
    instrumentType: "ACAO",
    allowsMaturity: false,
  },
  "br-etf": {
    kind: "br-etf",
    label: "ETF da B3",
    hint: "Yahoo Finance · BRL",
    ticker: "market",
    provider: "yahoo",
    instrumentType: "ETF",
    allowsMaturity: false,
  },
  "br-stock": {
    kind: "br-stock",
    label: "Ação ou FII da B3",
    hint: "Yahoo Finance · BRL",
    ticker: "market",
    provider: "yahoo",
    instrumentType: "ACAO",
    allowsMaturity: false,
  },
  crypto: {
    kind: "crypto",
    label: "Cripto",
    hint: "CoinGecko",
    ticker: "market",
    provider: "coingecko",
    instrumentType: "CRIPTO",
    allowsMaturity: false,
  },
  "fixed-income": {
    kind: "fixed-income",
    label: "Renda fixa",
    hint: "Saldo em R$",
    ticker: null,
    provider: null,
    instrumentType: null,
    allowsMaturity: true,
  },
  "brl-cash": {
    kind: "brl-cash",
    label: "Caixa em reais",
    hint: "Saldo em R$",
    ticker: null,
    provider: null,
    instrumentType: null,
    allowsMaturity: true,
  },
  "usd-balance": {
    kind: "usd-balance",
    label: "Saldo em dólar",
    hint: "Cotado pelo USD",
    ticker: "usd",
    provider: null,
    instrumentType: "FIAT",
    allowsMaturity: true,
  },
};

export const USD_SYMBOL = "USD";
/** Moeda base das criptos que não são o BTC (spec 036). */
export const ALTCOINS = "Altcoins";
const RESERVED_SYMBOLS = new Set(["USD", "BRL"]);
const B3_SUFFIX = ".SAO";

/**
 * Símbolo de cotação a partir do ticker digitado, ou `null` quando o texto não
 * serve como ticker do tipo. Na B3 o símbolo guardado leva o sufixo `.SAO`, como
 * o `GPCA11.SAO` importado da planilha (formato do Alpha Vantage, convertido
 * para `.SA` no Yahoo Finance); o sufixo é acrescentado quando falta. O ticker
 * da B3 só vale completo, com quatro caracteres e um ou dois dígitos (PETR4,
 * B3SA3, GPCA11): "PETR" a meio da digitação não chega a consultar o provedor.
 */
export function normalizeTicker(kind: AssetKind, raw: string): string | null {
  const definition = ASSET_KIND_DEFINITIONS[kind];

  if (definition.ticker === "usd") {
    return USD_SYMBOL;
  }

  if (definition.ticker !== "market") {
    return null;
  }

  const text = raw.trim().toUpperCase();

  if (definition.provider === "yahoo") {
    const base = text.replace(/\.(SAO|SA)$/, "");
    return /^[A-Z0-9]{4}\d{1,2}$/.test(base) ? `${base}${B3_SUFFIX}` : null;
  }

  if (RESERVED_SYMBOLS.has(text)) {
    return null;
  }

  if (definition.provider === "coingecko") {
    return /^[A-Z0-9]{2,10}$/.test(text) ? text : null;
  }

  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(text) ? text : null;
}

export function tickerHint(kind: AssetKind) {
  switch (ASSET_KIND_DEFINITIONS[kind].provider) {
    case "yahoo":
      return "Como GPCA11 ou PETR4.";
    case "coingecko":
      return "Como ETH ou ADA.";
    case "finnhub":
      return "Como VOO ou AAPL.";
    default:
      return "";
  }
}

/**
 * Moeda base: a moeda de exposição do ativo. No cripto, o bitcoin tem a própria
 * moeda, como na planilha; as demais moedas ficam em USD, como a Solana, que é
 * o que a meta "Cripto em USD" acompanha.
 */
export function baseCurrencyOf(kind: AssetKind, symbol: string | null) {
  switch (kind) {
    case "us-etf":
    case "us-stock":
    case "usd-balance":
      return "USD";
    case "crypto":
      // Fora o BTC, as criptos contam como altcoins no recorte por moeda (spec 036).
      return symbol === "BTC" ? "BTC" : ALTCOINS;
    default:
      return "BRL";
  }
}

/** Rateio inicial do ativo novo, a 100%, ajustável no diálogo e depois no painel. */
export function defaultAllocation(kind: AssetKind, symbol: string | null): AllocationSeed {
  switch (kind) {
    case "us-etf":
    case "us-stock":
      return { assetClass: "Renda Variável", subclass: "Ações EUA", duration: "-" };
    case "br-etf":
    case "br-stock":
      return { assetClass: "Renda Variável", subclass: "Ações BR", duration: "-" };
    case "crypto":
      return { assetClass: "Cripto", subclass: symbol === "BTC" ? "BTC" : "Altcoin", duration: "-" };
    case "fixed-income":
      // Subclasse e prazo da renda fixa variam por título e são escolhidos.
      return { assetClass: "Renda Fixa", subclass: "", duration: "" };
    case "brl-cash":
    case "usd-balance":
      return { assetClass: "Caixa", subclass: "Pós-fixado", duration: "Curto" };
  }
}

/**
 * Tipo de um ativo já cadastrado, para leitura no formulário da posição (spec
 * 043). O cadastro guarda o símbolo e a moeda, não o tipo escolhido na inclusão.
 */
export function describeAsset(asset: { quoteSymbol: string | null; baseCurrency: string }) {
  if (!asset.quoteSymbol) {
    return "Saldo em reais";
  }

  if (asset.quoteSymbol === USD_SYMBOL) {
    return "Saldo em dólar";
  }

  if (asset.baseCurrency === "BTC" || asset.baseCurrency === ALTCOINS) {
    return "Cripto";
  }

  return asset.quoteSymbol.endsWith(B3_SUFFIX) ? "Ativo da B3" : "Ativo dos EUA";
}

/** Provedor que a atualização de cotações usa para um símbolo já cadastrado. */
export function providerForQuote(instrumentType: string, baseCurrency: string): QuoteProvider {
  if (instrumentType === "FIAT") {
    return "awesome-api";
  }

  if (instrumentType === "CRIPTO") {
    return "coingecko";
  }

  return baseCurrency === "USD" ? "finnhub" : "yahoo";
}

/** Chave sem acentos, maiúsculas nem pontuação, como a da importação. */
export function normalizeKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Identidade do ativo, no formato da importação: ativos com ticker por nome e
 * ticker, inclusive os saldos em dólar, de ticker USD; os demais por
 * instituição e nome. O vencimento vai no fim da chave, para que dois títulos
 * de mesmo nome e prazos diferentes sejam ativos distintos, como dois Time
 * Deposit ou duas LCI BRB.
 */
export function buildAssetKey({
  name,
  ticker,
  institutionName,
  maturityDate,
}: {
  name: string;
  ticker: string | null;
  institutionName: string;
  maturityDate: string | null;
}) {
  const normalizedName = normalizeKey(name);
  const base = ticker
    ? `market:${normalizedName}:${ticker.toUpperCase()}`
    : `private:${normalizeKey(institutionName)}:${normalizedName}`;

  return maturityDate ? `${base}:${maturityDate}` : base;
}

/**
 * Aviso de um ativo novo cuja chave já existe, no diálogo e no servidor. Sem
 * vencimento, informar um é o caminho para um título de mesmo nome com outro
 * prazo.
 */
export function duplicateAssetMessage({
  name,
  kind,
  symbol,
  maturityDate,
  pending = false,
}: {
  name: string;
  kind: AssetKind;
  symbol: string | null;
  maturityDate: string | null;
  /** O ativo igual é novo, de outra posição ainda não salva. */
  pending?: boolean;
}) {
  const definition = ASSET_KIND_DEFINITIONS[kind];
  const quotedBy =
    definition.ticker === "market" ? ` com o ticker ${symbol}` : definition.ticker === "usd" ? " cotado pelo USD" : "";
  // Sem ticker, o ativo é da instituição em que foi criado.
  const scope = `${definition.ticker === null ? " nesta instituição" : ""}${maturityDate ? " com este vencimento" : ""}`;
  const alternative = definition.allowsMaturity && !maturityDate ? " ou informe um vencimento" : "";
  const subject = pending
    ? `"${name}"${quotedBy} já é o ativo novo de outra posição${scope}`
    : `O ativo "${name}"${quotedBy} já existe${scope}`;

  return `${subject}. Escolha-o na lista${alternative}.`;
}

/** Texto curto e limpo para nomes digitados: sem espaços repetidos. */
export function cleanName(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}
