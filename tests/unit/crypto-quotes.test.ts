import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { fetchCurrentQuotes } from "@/modules/quotes/application/fetch-current-quotes";
import { fetchJson } from "@/modules/quotes/infrastructure/http";

// Cotação de cripto no job do Neon (região dos EUA): a CoinGecko às vezes não
// responde e a Binance recusa a região com HTTP 451. A cadeia agora é
// CoinGecko (duas tentativas) → Coinbase → Yahoo → Binance. A rede é simulada
// por endereço, sem consultar provedor nenhum.

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

type Reply = { status: number; body?: unknown } | "timeout";
type Routes = Record<string, Reply | Reply[]>;

/** Responde pelo trecho do endereço; uma lista entrega uma resposta por chamada. */
function stubNetwork(routes: Routes) {
  const calls: string[] = [];

  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).find((fragment) => url.includes(fragment));
    const entry = key ? routes[key] : { status: 404 };
    const reply = Array.isArray(entry) ? (entry.length > 1 ? entry.shift()! : entry[0]) : entry;

    if (reply === "timeout") {
      throw new DOMException("The operation timed out.", "TimeoutError");
    }

    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status });
  }) as typeof fetch;

  return calls;
}

const dollar = { "economia.awesomeapi.com.br": { status: 200, body: { USDBRL: { bid: "5.00" } } } };
const request = [{ symbol: "BTC", instrumentType: "CRIPTO", baseCurrency: "BTC" }];
const run = (symbols = request) => fetchCurrentQuotes(symbols, {}, "2026-10-07");

test("CoinGecko que não responde na primeira vez é recuperada na segunda, sem usar reserva", async () => {
  const calls = stubNetwork({
    ...dollar,
    "api.coingecko.com/api/v3/simple/price": [
      "timeout",
      { status: 200, body: { bitcoin: { brl: 415000 } } },
    ],
  });
  const [btc] = await run();

  assert.deepEqual(btc, { symbol: "BTC", provider: "coingecko", status: "SUCCESS", valueBrl: 415000 });
  assert.equal(calls.filter((url) => url.includes("coingecko")).length, 2);
  assert.equal(calls.some((url) => url.includes("coinbase") || url.includes("binance")), false);
});

test("CoinGecko fora do ar nas duas tentativas cai na Coinbase, em reais", async () => {
  const calls = stubNetwork({
    ...dollar,
    "api.coingecko.com": "timeout",
    "api.coinbase.com/v2/prices/BTC-BRL": { status: 200, body: { data: { amount: "416000.5", base: "BTC", currency: "BRL" } } },
  });
  const [btc] = await run();

  assert.deepEqual(btc, { symbol: "BTC", provider: "coinbase", status: "SUCCESS", valueBrl: 416000.5 });
  assert.equal(calls.filter((url) => url.includes("coingecko")).length, 2);
  assert.equal(calls.some((url) => url.includes("binance")), false);
});

test("sem Coinbase, o Yahoo cota o par em dólar e converte pelo dólar do dia", async () => {
  stubNetwork({
    ...dollar,
    "api.coingecko.com": "timeout",
    "api.coinbase.com": { status: 404, body: { message: "not found" } },
    "finance/chart/BTC-USD": {
      status: 200,
      body: { chart: { result: [{ meta: { currency: "USD", regularMarketPrice: 83000 }, indicators: { quote: [{}] } }], error: null } },
    },
  });
  const [btc] = await run();

  assert.deepEqual(btc, { symbol: "BTC", provider: "yahoo", status: "SUCCESS", valueBrl: 415000 });
});

test("Binance só é tentada por último, e o 451 vai ao espelho de dados de mercado", async () => {
  const calls = stubNetwork({
    ...dollar,
    "api.coingecko.com": "timeout",
    "api.coinbase.com": { status: 404 },
    "finance.yahoo.com": { status: 404 },
    "api.binance.com": { status: 451 },
    "data-api.binance.vision": { status: 200, body: { symbol: "BTCBRL", price: "417000.00" } },
  });
  const [btc] = await run();

  assert.deepEqual(btc, { symbol: "BTC", provider: "binance", status: "SUCCESS", valueBrl: 417000 });
  const order = ["coingecko", "coinbase", "yahoo", "binance.com", "binance.vision"].map((name) => calls.findIndex((url) => url.includes(name)));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.equal(order.every((index) => index >= 0), true);
});

test("quando tudo falha, a mensagem lista cada provedor e explica o 451", async () => {
  stubNetwork({
    ...dollar,
    "api.coingecko.com": "timeout",
    "api.coinbase.com": { status: 404 },
    "finance.yahoo.com": { status: 404 },
    "binance": { status: 451 },
  });
  const [btc] = await run();

  assert.equal(btc.status, "FAILED");
  if (btc.status === "FAILED") {
    assert.match(btc.errorMessage, /CoinGecko: O provedor excedeu o tempo limite\./);
    assert.match(btc.errorMessage, /Coinbase: A Coinbase não negocia BTC em reais\./);
    assert.match(btc.errorMessage, /Binance: O provedor bloqueia a região do servidor \(HTTP 451\)\./);
    assert.equal(btc.errorCode, "REGION_BLOCKED");
  }
});

test("recusa do provedor (4xx) não repete; falha de servidor (5xx) repete", async () => {
  const limited = stubNetwork({ "provedor.test": { status: 429 } });
  await assert.rejects(fetchJson(new URL("https://provedor.test/x"), undefined, { attempts: 3 }));
  assert.equal(limited.length, 1);

  const flaky = stubNetwork({ "provedor.test": [{ status: 503 }, { status: 200, body: { ok: true } }] });
  assert.deepEqual(await fetchJson(new URL("https://provedor.test/x"), undefined, { attempts: 3 }), { ok: true });
  assert.equal(flaky.length, 2);
});
