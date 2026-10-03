import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Passo pré-produção (.ai/context/pre-deploy.md): baixa, uma única vez, as
// séries brutas de que o histórico precisa e as guarda em
// `data/history/raw/`, para que a montagem do arquivo de importação seja
// reproduzível sem rede e auditável. Nada é gravado no banco.
//
// Fontes principais e de conferência, por grupo:
// - dólar: PTAX de venda do Banco Central (dia útil); conferência no BRL=X do
//   Yahoo Finance;
// - cripto: velas mensais da Binance no par em reais; conferência no par em
//   USDT convertido pela PTAX;
// - ETFs dos EUA e da B3: fechamento diário do Yahoo Finance, com eventos de
//   desdobramento; conferência no TIME_SERIES_MONTHLY do Alpha Vantage, quando
//   houver chave.

const OUT = path.join(process.cwd(), "data/history/raw");
const START = "2023-05-01";
const END = "2026-10-01";
const YAHOO_SYMBOLS = ["VOO", "VTI", "ARGT", "GLDM", "SIVR", "IAUM", "XLE", "VXUS", "GPCA11.SA", "BRL=X"];
const ALPHA_SYMBOLS = ["VOO", "VTI", "ARGT", "GLDM", "SIVR", "IAUM", "XLE", "VXUS", "GPCA11.SAO"];
const BINANCE_PAIRS = ["BTCBRL", "SOLBRL", "ETHBRL", "BTCUSDT", "SOLUSDT", "ETHUSDT"];

async function getJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} em ${url}`);
  }

  return response.json() as Promise<unknown>;
}

async function save(name: string, payload: unknown) {
  await writeFile(path.join(OUT, name), `${JSON.stringify(payload, null, 1)}\n`);
  console.info(`guardado ${name}`);
}

function olinda(day: string) {
  const [year, month, date] = day.split("-");
  return `'${month}-${date}-${year}'`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const period1 = Date.parse(`${START}T00:00:00Z`) / 1000;
  const period2 = Date.parse(`${END}T00:00:00Z`) / 1000;

  const ptax = new URL(
    "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)",
  );
  ptax.searchParams.set("@dataInicial", olinda(START));
  ptax.searchParams.set("@dataFinalCotacao", olinda("2026-09-30"));
  ptax.searchParams.set("$format", "json");
  await save("ptax-usd.json", await getJson(ptax.toString()));

  for (const symbol of YAHOO_SYMBOLS) {
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
    url.searchParams.set("period1", String(period1));
    url.searchParams.set("period2", String(period2));
    url.searchParams.set("interval", "1d");
    url.searchParams.set("events", "split,div");
    await save(`yahoo-${symbol}.json`, await getJson(url.toString(), { headers: { "user-agent": "Mozilla/5.0" } }));
  }

  for (const pair of BINANCE_PAIRS) {
    const url = new URL("https://api.binance.com/api/v3/klines");
    url.searchParams.set("symbol", pair);
    url.searchParams.set("interval", "1M");
    url.searchParams.set("startTime", String(period1 * 1000));
    url.searchParams.set("endTime", String(period2 * 1000 - 1));
    await save(`binance-${pair}.json`, await getJson(url.toString()));
  }

  const alphaKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!alphaKey) {
    console.warn("ALPHA_VANTAGE_API_KEY ausente: conferência dos ETFs pelo Alpha Vantage não foi feita.");
    return;
  }

  for (const symbol of ALPHA_SYMBOLS) {
    const url = new URL("https://www.alphavantage.co/query");
    url.searchParams.set("function", "TIME_SERIES_MONTHLY");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("apikey", alphaKey);
    const payload = (await getJson(url.toString())) as Record<string, unknown>;

    if (payload.Note || payload.Information) {
      console.warn(`Alpha Vantage recusou ${symbol}: limite diário ou chave sem acesso.`);
      continue;
    }

    await save(`alpha-${symbol}.json`, payload);
    // O plano gratuito aceita 5 consultas por minuto.
    await new Promise((resolve) => setTimeout(resolve, 13_000));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
