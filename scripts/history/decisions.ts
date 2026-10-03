// Decisões do passo pré-produção (.ai/context/pre-deploy.md e spec 041): como
// cada linha da planilha vira ativo, instituição, posição e rateio no modelo do
// aplicativo. Cada escolha cita a pergunta feita ao usuário em 2026-10-03; as
// respostas dele, do mesmo dia, estão confirmadas. Sem resposta, vale o padrão
// e `confirmed` fica falso; o relatório da montagem lista as pendentes.

export type Allocation = { assetClass: string; subclass: string; duration: string; weight: string };

type Answer<T> = { confirmed: boolean; value: T };

function pending<T>(value: T): Answer<T> {
  return { confirmed: false, value };
}

function answered<T>(value: T): Answer<T> {
  return { confirmed: true, value };
}

export const ANSWERS = {
  // A: unificações de alta confiança, apresentadas em bloco. O usuário só
  // contestou a A4 e condicionou a A7 aos valores, que batem (uma aplicação só,
  // de 9.594,66 em abr/26 a 10.093,00 em set/26).
  A1_bancoInterIsInter: answered(true),
  A2_carteiraCriptoIsLedger: answered(true),
  A3_bitcoinIsNumbered: answered(true),
  A4_c6PrefixedCdbs: answered(false),
  A5_dolarWithoutAccent: answered(true),
  A6_tesouroRendaIsIpca: answered(true),
  A7_lciBrbIsSet26: answered(true),
  A8_previdenciaSplitIsOnePosition: answered(true),
  A9_usdAmountsAreTickers: answered(true),
  // P: perguntas numeradas.
  // "Só tive uma única previdência até hoje, essa da Grão."
  P1_graoFimIsPrevidenciaPrivada: answered(true),
  P2_interUsdBalancesAreOne: answered(true),
  // "Na época acabei migrando de um para o outro."
  P3_chainlessIsAave: answered(true),
  // "Considere esses casos como conta corrente."
  P4_c6ParadoIsContaBancaria: answered(true),
  // Decidir pelo valor: os R$ 20.277 de jul/23 não batem com 975 nem 2.500.
  P5_cdb110Is: answered<null | "cdb-diario-105" | "cdb-cartao-100">(null),
  // Conferir pelo valor: R$ 4.238 em jul/23 e R$ 1.612 em jul/25 não batem.
  P6_liquidezDiariaIsConfrinho: answered(false),
  // Sem resposta.
  P7_interIsPorquinho: pending(false),
  P8_lciXpIsLciXp2025: answered(false),
  P9_bitcoinJune2023Quantity: answered<string | null>("0.179195"),
  P10_january2024PreciseBitcoin: answered(true),
  P11_etfKnownShares: answered(true),
  // Quantidade informada pelo usuário por ativo e mês (AAAA-MM), no lugar do
  // valor em dólar ÷ fechamento do mês. O usuário não sabe as quantidades.
  P12_knownQuantities: answered<Record<string, Record<string, string>>>({}),
  P13_dropExactDuplicates: answered(true),
  // Posições que faltaram na planilha e devem repetir as do mês anterior.
  P14_fillBitcoin02March2024: answered(false),
  P15_fillTimeDepositJune2026: answered(false),
  P16_preciseQuantitiesFromOctober: answered(true),
  // "Desconsidere outubro/26 inteiro, faça uma cópia de setembro/26 nas
  // posições, pois outubro ainda não mexi."
  P17_openMonthCopiesSeptember: answered(true),
  P18_standardizeClassification: answered(true),
  P19_redemptionDaysToLiquidity: answered(true),
  P20_fixCashSubclassCurto: answered(true),
  // Vencimento (AAAA-MM-DD) por ativo. "Não vamos nos preocupar com posições
  // antigas; quando eu mexer em outubro eu coloco."
  P21_maturities: answered<Record<string, string>>({}),
  P22_usdIsPtax: answered(true),
  P23_ethereumName: answered("Ethereum"),
} as const;

const a = <K extends keyof typeof ANSWERS>(key: K): (typeof ANSWERS)[K]["value"] => ANSWERS[key].value;

/** Instituição da planilha → instituição do aplicativo. */
export const INSTITUTION_ALIASES: Record<string, string> = {
  ...(a("A1_bancoInterIsInter") ? { "Banco Inter": "Inter" } : {}),
  ...(a("A2_carteiraCriptoIsLedger") ? { "Carteira Cripto": "Ledger" } : {}),
  ...(a("P3_chainlessIsAave") ? { Chainless: "AAVE" } : {}),
};

/**
 * Linha da planilha (nome limpo | ticker | instituição original) → ativo do
 * catálogo. Nomes com espaço inseparável ou repetido são limpos antes.
 */
export const SOURCE_ASSETS: Record<string, string> = {
  "Bitcoin|BTC|Ledger": a("A3_bitcoinIsNumbered") ? "bitcoin-01" : "bitcoin",
  "Bitcoin|BTC|Carteira Cripto": a("A3_bitcoinIsNumbered") ? "bitcoin-01" : "bitcoin",
  "Bitcoin|BTC|Binance": a("A3_bitcoinIsNumbered") ? "bitcoin-02" : "bitcoin",
  "Bitcoin 01|BTC|Ledger": "bitcoin-01",
  "Bitcoin 01|BTC|Carteira Cripto": "bitcoin-01",
  "Bitcoin 02|BTC|Binance": "bitcoin-02",
  "Bitcoin 03|BTC|Binance": "bitcoin-03",
  "Bitcoin 03 - Viagem|BTC|Binance": "bitcoin-03-viagem",
  "Solana|USD|Binance": "solana",
  "Solana|SOL|Binance": "solana",
  "Etherium|USD|Binance": "ethereum",
  "USDT|USD|Binance": "usdt",
  "BUSD|USD|Binance": "busd",
  "USDC|USD|Binance": "usdc",
  "USDC|USD|Chainless": "usdc",
  "USDC|USD|AAVE": "usdc",
  "USDC - Viagem|USD|Binance": "usdc-viagem",
  "Dolar|USD|Inter": a("A5_dolarWithoutAccent") ? "dolar" : "dolar-sem-acento",
  "Dólar|USD|Inter": "dolar",
  "Conta Global|USD|Inter": a("P2_interUsdBalancesAreOne") ? "dolar" : "conta-global",
  "Dolar Inter|USD|Inter": a("P2_interUsdBalancesAreOne") ? "dolar" : "dolar-inter",
  "Time Deposit|USD|Inter": "time-deposit",
  "Flexible Account|USD|Revolut": "flexible-account",
  "ETF - VOO|USD|Banco Inter": "etf-voo",
  "ETF - VOO|USD|Inter": "etf-voo",
  "ETF - VOO|VOO|Inter": "etf-voo",
  "ETF - VTI|USD|Banco Inter": "etf-vti",
  "ETF - VTI|USD|Inter": "etf-vti",
  "ETF - ARGT|USD|Banco Inter": "etf-argt",
  "ETF - ARGT|USD|Inter": "etf-argt",
  "ETF - ARGT|ARGT|Inter": "etf-argt",
  "ETF - GLDM|USD|Inter": "etf-gldm",
  "ETF - GLDM|GLDM|Inter": "etf-gldm",
  "ETF - SIVR|SIVR|Inter": "etf-sivr",
  "ETF - IAUM|IAUM|Inter": "etf-iaum",
  "ETF - XLE|XLE|Inter": "etf-xle",
  "ETF - VXUS|VXUS|Inter": "etf-vxus",
  "ETF - GPCA11|GPCA11.SAO|Inter": "etf-gpca11",
  "Liquidez Diaria||PicPay": a("P6_liquidezDiariaIsConfrinho") ? "picpay-confrinho" : "liquidez-diaria",
  "Picpay - Confrinho||PicPay": "picpay-confrinho",
  "CDB - 110%||C6": a("P5_cdb110Is") ?? "cdb-110",
  "C6 - CDB Diario 105%||C6": a("A4_c6PrefixedCdbs") ? "cdb-diario-105" : "c6-cdb-diario-105",
  "C6 - CDB Cartao 100%||C6": a("A4_c6PrefixedCdbs") ? "cdb-cartao-100" : "c6-cdb-cartao-100",
  "CDB Diario 105%||C6": "cdb-diario-105",
  "CDB Cartao 100%||C6": "cdb-cartao-100",
  "C6- Parado||C6": a("P4_c6ParadoIsContaBancaria") ? "conta-bancaria-c6" : "c6-parado",
  "Conta Bancária||C6": "conta-bancaria-c6",
  "Conta Bancária||Itaú": "conta-bancaria-itau",
  "CDB Itaú 100%||Itaú": "cdb-itau-100",
  "Fundo Itaú||Itaú": "fundo-itau",
  "Extra XP||XP": "extra-xp",
  "LCI XP||XP": "lci-xp",
  "LCI - XP||XP": a("P8_lciXpIsLciXp2025") ? "lci-xp" : "lci-xp-2025",
  "Inter||Inter": a("P7_interIsPorquinho") ? "porquinho" : "inter",
  "Porquinho||Inter": "porquinho",
  "LCI DI 180||Inter": "lci-di-180",
  "LCA BOCOM||Inter": "lca-bocom",
  "LIG LIQUIDEZ 01||Inter": "lig-liquidez-01",
  "LIG LIQUIDEZ 02||Inter": "lig-liquidez-02",
  "LCD BNDES LIQUIDEZ||Inter": "lcd-bndes-liquidez",
  "LCD BDMG LIQUIDEZ - 05/32||Inter": "lcd-bdmg-liquidez",
  "LCI BRB||Inter": a("A7_lciBrbIsSet26") ? "lci-brb-set-26" : "lci-brb",
  "LCI BRB - Set/26||Inter": "lci-brb-set-26",
  "LCI BRB - Jun/27||Inter": "lci-brb-jun-27",
  "Tesouro Renda+ 2065||Inter": a("A6_tesouroRendaIsIpca") ? "tesouro-ipca-renda-2065" : "tesouro-renda-2065",
  "Tesouro IPCA Renda+ 2065||Inter": "tesouro-ipca-renda-2065",
  "Tesouro IPCA+ 2032||Inter": "tesouro-ipca-2032",
  "Previdência Privada||Inter": "previdencia-privada",
  "Previdência - RV - 54%||Inter": a("A8_previdenciaSplitIsOnePosition") ? "previdencia-privada" : "previdencia-rv-54",
  "Previdência Privada - RF - 46%||Inter": a("A8_previdenciaSplitIsOnePosition")
    ? "previdencia-privada"
    : "previdencia-privada-rf-46",
  "Previdência - RF - 46%||Inter": a("A8_previdenciaSplitIsOnePosition") ? "previdencia-privada" : "previdencia-rf-46",
  "Previdência - Grão FIM||Inter": a("P1_graoFimIsPrevidenciaPrivada") ? "previdencia-privada" : "previdencia-grao-fim",
};

export type CatalogAsset = {
  name: string;
  /** Ticker e símbolo de cotação; nulo nos saldos em reais. */
  ticker: string | null;
  baseCurrency: "BRL" | "USD" | "BTC" | "Altcoins";
  instrumentType: "CRIPTO" | "ETF" | "FIAT" | null;
  /** Instituição dos ativos sem ticker, que faz parte da chave do ativo. */
  institution?: string;
  /** Prazo de liquidez (spec 039), vindo do D+0 e D+1 da planilha (P19). */
  liquidity: string | null;
  quoteProviderId?: string;
  /**
   * Rateio padronizado (P18) ou "source", quando a composição muda de verdade
   * entre os meses e vale a de cada mês, como na previdência.
   */
  allocation: Allocation[] | "source";
};

const one = (assetClass: string, subclass: string, duration: string): Allocation[] => [
  { assetClass, subclass, duration, weight: "1" },
];
const BTC = one("Cripto", "BTC", "-");
const ALTCOIN = one("Cripto", "Altcoin", "-");
const STABLE = one("Caixa", "Stablecoin", "Curto");
const CASH = one("Caixa", "Pós-fixado", "Curto");
const D0 = a("P19_redemptionDaysToLiquidity") ? "D+0" : null;
const D1 = a("P19_redemptionDaysToLiquidity") ? "D+1" : null;

const crypto = (name: string, ticker: string, extra: Partial<CatalogAsset> = {}): CatalogAsset => ({
  name,
  ticker,
  baseCurrency: ticker === "BTC" ? "BTC" : "Altcoins",
  instrumentType: "CRIPTO",
  liquidity: null,
  allocation: ticker === "BTC" ? BTC : ALTCOIN,
  ...extra,
});
const usd = (name: string, allocation: Allocation[], liquidity: string | null): CatalogAsset => ({
  name,
  ticker: "USD",
  baseCurrency: "USD",
  instrumentType: "FIAT",
  liquidity,
  allocation,
});
const etf = (name: string, ticker: string, allocation: Allocation[], baseCurrency: "USD" | "BRL" = "USD"): CatalogAsset => ({
  name,
  ticker,
  baseCurrency,
  instrumentType: "ETF",
  liquidity: null,
  allocation,
});
const brl = (
  name: string,
  institution: string,
  allocation: Allocation[] | "source",
  liquidity: string | null,
): CatalogAsset => ({ name, ticker: null, baseCurrency: "BRL", instrumentType: null, institution, liquidity, allocation });

const CASH_OR_FIXED = (fixed: boolean) => (fixed ? one("Renda Fixa", "Pós-fixado", "Curto") : CASH);

/**
 * Catálogo de ativos. A classificação padronizada (P18) é a mais recente de
 * cada ativo na planilha, com D+0 e D+1 trocados por Curto (P19) e a
 * subclasse "Curto" do caixa trocada por Pós-fixado (P20). Entradas que só
 * existem quando uma unificação é recusada ficam de fora do arquivo se nenhuma
 * linha as usar.
 */
export const CATALOG: Record<string, CatalogAsset> = {
  bitcoin: crypto("Bitcoin", "BTC"),
  "bitcoin-01": crypto("Bitcoin 01", "BTC"),
  "bitcoin-02": crypto("Bitcoin 02", "BTC"),
  "bitcoin-03": crypto("Bitcoin 03", "BTC"),
  "bitcoin-03-viagem": crypto("Bitcoin 03 - Viagem", "BTC"),
  solana: crypto("Solana", "SOL"),
  ethereum: crypto(a("P23_ethereumName"), "ETH", { quoteProviderId: "ethereum" }),
  usdt: usd("USDT", STABLE, D0),
  busd: usd("BUSD", STABLE, D0),
  usdc: usd("USDC", STABLE, D0),
  "usdc-viagem": usd("USDC - Viagem", STABLE, D0),
  // Unificado com Conta Global e Dolar Inter (P2): vale o nome mais recente.
  dolar: usd(a("P2_interUsdBalancesAreOne") ? "Dolar Inter" : "Dólar", CASH, D0),
  "dolar-sem-acento": usd("Dolar", CASH, D0),
  "conta-global": usd("Conta Global", CASH, D0),
  "dolar-inter": usd("Dolar Inter", CASH, D0),
  "time-deposit": usd("Time Deposit", CASH, D1),
  "flexible-account": usd("Flexible Account", CASH, D0),
  "etf-voo": etf("ETF - VOO", "VOO", one("Renda Variável", "Ações EUA", "-")),
  "etf-vti": etf("ETF - VTI", "VTI", one("Renda Variável", "Ações EUA", "-")),
  "etf-xle": etf("ETF - XLE", "XLE", one("Renda Variável", "Ações EUA", "-")),
  "etf-argt": etf("ETF - ARGT", "ARGT", one("Renda Variável", "Ações - Ex: USA", "-")),
  "etf-vxus": etf("ETF - VXUS", "VXUS", one("Renda Variável", "Ações - Ex: USA", "-")),
  "etf-sivr": etf("ETF - SIVR", "SIVR", one("Renda Variável", "Commoditie", "-")),
  "etf-gldm": etf("ETF - GLDM", "GLDM", one("Reserva", "Commoditie", "-")),
  "etf-iaum": etf("ETF - IAUM", "IAUM", one("Reserva", "Commoditie", "-")),
  "etf-gpca11": etf(
    "ETF - GPCA11",
    "GPCA11.SAO",
    [
      { assetClass: "Renda Fixa", subclass: "IPCA", duration: "Curto", weight: "0.6" },
      { assetClass: "Renda Fixa", subclass: "IPCA", duration: "Médio", weight: "0.4" },
    ],
    "BRL",
  ),
  "liquidez-diaria": brl("Liquidez Diaria", "PicPay", CASH, D0),
  "picpay-confrinho": brl("Picpay - Confrinho", "PicPay", CASH, D0),
  "cdb-110": brl("CDB - 110%", "C6", CASH_OR_FIXED(true), D0),
  "cdb-diario-105": brl("CDB Diario 105%", "C6", CASH, D0),
  "cdb-cartao-100": brl("CDB Cartao 100%", "C6", CASH, D0),
  "c6-cdb-diario-105": brl("C6 - CDB Diario 105%", "C6", CASH, D0),
  "c6-cdb-cartao-100": brl("C6 - CDB Cartao 100%", "C6", CASH, D0),
  "c6-parado": brl("C6- Parado", "C6", CASH, D0),
  "conta-bancaria-c6": brl("Conta Bancária", "C6", CASH, D0),
  "conta-bancaria-itau": brl("Conta Bancária", "Itaú", CASH, D0),
  "cdb-itau-100": brl("CDB Itaú 100%", "Itaú", CASH, D0),
  "fundo-itau": brl("Fundo Itaú", "Itaú", CASH, D0),
  "extra-xp": brl("Extra XP", "XP", CASH_OR_FIXED(true), D0),
  // Unificada (P8), vale o nome e a classificação mais recentes, de jan/25.
  "lci-xp": a("P8_lciXpIsLciXp2025")
    ? brl("LCI - XP", "XP", CASH, null)
    : brl("LCI XP", "XP", one("Renda Fixa", "Pós-fixado", "Curto"), null),
  // "LCI XP" e "LCI - XP" geram a mesma chave; separadas (P8), a de jan/25
  // leva o ano no nome. O usuário pode renomear pelo lápis (spec 040).
  "lci-xp-2025": brl("LCI - XP (2025)", "XP", CASH, null),
  inter: brl("Inter", "Inter", CASH, D0),
  porquinho: brl("Porquinho", "Inter", CASH, D0),
  "lci-di-180": brl("LCI DI 180", "Inter", one("Renda Fixa", "Pós-fixado", "Médio"), null),
  "lca-bocom": brl("LCA BOCOM", "Inter", CASH, null),
  "lig-liquidez-01": brl("LIG LIQUIDEZ 01", "Inter", CASH, D1),
  "lig-liquidez-02": brl("LIG LIQUIDEZ 02", "Inter", CASH, D1),
  "lcd-bndes-liquidez": brl("LCD BNDES LIQUIDEZ", "Inter", CASH, D1),
  "lcd-bdmg-liquidez": brl("LCD BDMG LIQUIDEZ - 05/32", "Inter", CASH, D1),
  "lci-brb": brl("LCI BRB", "Inter", one("Renda Fixa", "Pós-fixado", "Médio"), null),
  "lci-brb-set-26": brl("LCI BRB - Set/26", "Inter", one("Renda Fixa", "Pós-fixado", "Médio"), null),
  "lci-brb-jun-27": brl("LCI BRB - Jun/27", "Inter", one("Renda Fixa", "Pós-fixado", "Curto"), null),
  "tesouro-renda-2065": brl("Tesouro Renda+ 2065", "Inter", one("Renda Fixa", "IPCA", "Longo"), null),
  "tesouro-ipca-renda-2065": brl("Tesouro IPCA Renda+ 2065", "Inter", one("Renda Fixa", "IPCA", "Longo"), null),
  "tesouro-ipca-2032": brl("Tesouro IPCA+ 2032", "Inter", one("Renda Fixa", "IPCA", "Médio"), null),
  // Uma previdência só (P1): vale o nome mais recente.
  "previdencia-privada": brl(
    a("P1_graoFimIsPrevidenciaPrivada") ? "Previdência - Grão FIM" : "Previdência Privada",
    "Inter",
    "source",
    null,
  ),
  "previdencia-rv-54": brl("Previdência - RV - 54%", "Inter", "source", null),
  "previdencia-privada-rf-46": brl("Previdência Privada - RF - 46%", "Inter", "source", null),
  "previdencia-rf-46": brl("Previdência - RF - 46%", "Inter", "source", null),
  "previdencia-grao-fim": brl("Previdência - Grão FIM", "Inter", "source", null),
};

/**
 * Ativos registrados em dólar em parte do histórico (ticker USD e quantidade
 * em US$), que passam a ser cotados pelo próprio ticker (A9). A quantidade é a
 * conhecida depois, se não houve compra nem venda no intervalo (P11), a
 * informada pelo usuário (P12) ou o valor em dólar ÷ fechamento do mês.
 */
export const USD_AMOUNT_ASSETS = new Set(["etf-voo", "etf-vti", "etf-argt", "etf-gldm", "ethereum", "solana"]);

export const KNOWN_SHARES: Record<string, string> = a("P11_etfKnownShares")
  ? { "etf-voo": "1.74155", "etf-argt": "6.09534", "etf-gldm": "13.87541817" }
  : {};

export const KNOWN_QUANTITIES = a("P12_knownQuantities");

/** Correções de linhas da planilha: mês, nome limpo e instituição original. */
export const ROW_FIXES: { month: string; name: string; institution: string; quantity: string | null; ref: string }[] = [
  { month: "2023-06", name: "Bitcoin", institution: "Ledger", quantity: a("P9_bitcoinJune2023Quantity"), ref: "P9" },
  ...(a("P10_january2024PreciseBitcoin")
    ? [
        { month: "2024-01", name: "Bitcoin", institution: "Binance", quantity: "0.01745788", ref: "P10" },
        { month: "2024-01", name: "Bitcoin", institution: "Carteira Cripto", quantity: "0.179195", ref: "P10" },
      ]
    : []),
];

/** Posições ausentes num mês da planilha que repetem as do mês anterior. */
export const FILL_POSITIONS: { month: string; asset: string; institution: string; ref: string }[] = [
  ...(a("P14_fillBitcoin02March2024") ? [{ month: "2024-03", asset: "bitcoin-02", institution: "Binance", ref: "P14" }] : []),
  ...(a("P15_fillTimeDepositJune2026")
    ? [{ month: "2026-06", asset: "time-deposit", institution: "Inter", ref: "P15" }]
    : []),
];

/**
 * Quantidades arredondadas na planilha que outubro de 2026 trouxe com mais
 * casas no aplicativo (P16): vale para os meses com o mesmo valor arredondado.
 */
export const PRECISE_QUANTITIES: { asset: string; rounded: string; precise: string }[] = a(
  "P16_preciseQuantitiesFromOctober",
)
  ? [
      { asset: "etf-voo", rounded: "2.806", precise: "2.80601273" },
      { asset: "etf-iaum", rounded: "22.437", precise: "22.43714219" },
      { asset: "etf-sivr", rounded: "3.19249", precise: "3.19249442" },
      { asset: "etf-vxus", rounded: "4.609", precise: "4.60935122" },
    ]
  : [];

/**
 * Mês aberto depois da planilha (P17): out/26 repete as posições de set/26,
 * com as cotações de set/26 marcadas como repetidas, como na virada de mês sem
 * histórico diário; a atualização do aplicativo reprecifica ao abrir.
 */
export const OPEN_MONTH = a("P17_openMonthCopiesSeptember") ? "2026-10" : null;

export const MATURITIES = a("P21_maturities");
export const STANDARDIZE_CLASSIFICATION = a("P18_standardizeClassification");
export const REDEMPTION_DAYS_TO_LIQUIDITY = a("P19_redemptionDaysToLiquidity");
export const FIX_CASH_SUBCLASS = a("P20_fixCashSubclassCurto");
export const DROP_EXACT_DUPLICATES = a("P13_dropExactDuplicates");
export const MERGE_SAME_POSITION = a("A8_previdenciaSplitIsOnePosition");

export function pendingAnswers() {
  return Object.entries(ANSWERS)
    .filter(([, answer]) => !answer.confirmed)
    .map(([key]) => key);
}
