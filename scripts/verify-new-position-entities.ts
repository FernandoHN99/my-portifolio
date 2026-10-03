// Verificação do servidor da inclusão de posição com cadastros novos (spec 026).
//
// Roda contra um banco DESCARTÁVEL, criado pelas migrações e carregado com a
// importação e as normalizações do Excel: o roteiro cria a competência do mês
// corrente, se faltar, grava inclusões, desfaz e deixa execuções de cotação no
// banco. Os provedores são substituídos por respostas simuladas; nenhuma
// chamada sai para a rede.
//
//   createdb my_portifolio_s026 && DATABASE_URL=... pnpm prisma migrate deploy
//   DATABASE_URL=... pnpm import:excel && pnpm normalize:portfolio && pnpm normalize:allocations
//   VERIFY_DISPOSABLE_DATABASE=my_portifolio_s026 DATABASE_URL=... pnpm verify:new-position
//
// `VERIFY_DISPOSABLE_DATABASE` precisa repetir o nome do banco de
// `DATABASE_URL`, para o roteiro nunca rodar por engano no banco do dia a dia.

import { buildAssetKey } from "../src/modules/portfolio/domain/asset-kinds";

const databaseUrl = process.env.DATABASE_URL;
const databaseName = databaseUrl ? new URL(databaseUrl).pathname.replace(/^\//, "") : null;

if (!databaseName || process.env.VERIFY_DISPOSABLE_DATABASE !== databaseName) {
  console.error(
    "Defina DATABASE_URL para um banco descartável e VERIFY_DISPOSABLE_DATABASE com o mesmo nome de banco.",
  );
  process.exit(1);
}

const CONFIGURATION = { awesomeApiKey: "x", coinGeckoApiKey: "x", finnhubApiKey: "x", alphaVantageApiKey: "x" };
const calls: string[] = [];
// A busca da CoinGecko devolve, por padrão, uma moeda falsa de baixa
// capitalização antes do Ethereum; trocar a ordem simula a busca mudando de
// moeda com o tempo.
let fakeEthRank = 900;

globalThis.fetch = (async (input: string | URL | Request) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  calls.push(url.href);
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

  if (url.hostname === "api.coingecko.com" && url.pathname.endsWith("/search")) {
    return json(
      url.searchParams.get("query") === "ETH"
        ? {
            coins: [
              { id: "fake-eth", symbol: "eth", name: "Fake ETH", market_cap_rank: fakeEthRank },
              { id: "ethereum", symbol: "eth", name: "Ethereum", market_cap_rank: 2 },
              { id: "ethos", symbol: "ethos", name: "Ethos", market_cap_rank: 3 },
            ],
          }
        : { coins: [] },
    );
  }

  if (url.hostname === "api.coingecko.com") {
    const prices: Record<string, number> = { ethereum: 13456.78, bitcoin: 400000, "fake-eth": 1 };
    const ids = (url.searchParams.get("ids") ?? "").split(",");
    return json(Object.fromEntries(ids.filter((id) => id in prices).map((id) => [id, { brl: prices[id] }])));
  }

  if (url.hostname === "finnhub.io") {
    const symbol = url.searchParams.get("symbol");
    if (symbol === "FAIL") {
      throw new TypeError("fetch failed");
    }
    return json(
      symbol === "QQQ" || symbol === "VOO"
        ? { c: 500, d: 1, t: 1 }
        : { c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 },
    );
  }

  if (url.hostname === "economia.awesomeapi.com.br") {
    return json({ USDBRL: { bid: "5.10" } });
  }

  if (url.hostname === "www.alphavantage.co") {
    const symbol = url.searchParams.get("symbol");
    if (symbol === "BOVA11.SAO") {
      return json({ "Global Quote": { "01. symbol": "BOVA11.SAO", "05. price": "130.5000" } });
    }
    if (symbol === "LIMT11.SAO") {
      return json({ Information: "Our standard API rate limit is 25 requests per day." });
    }
    return json({ "Global Quote": {} });
  }

  return new Response("not found", { status: 404 });
}) as typeof fetch;

const results: string[] = [];

function check(label: string, ok: boolean, detail?: unknown) {
  results.push(`${ok ? "PASS" : "FAIL"} ${label}${ok || detail === undefined ? "" : ` :: ${JSON.stringify(detail)}`}`);
}

async function expectError(label: string, run: () => Promise<unknown>, pattern: RegExp) {
  try {
    await run();
    check(label, false, "sem erro");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check(label, pattern.test(message), message);
  }
}

function callsTo(host: string, since: number) {
  return calls.slice(since).filter((call) => new URL(call).hostname === host).length;
}

async function main() {
  // Importados depois do substituto de `fetch` e da trava do banco.
  const { getPrismaClient } = await import("../src/lib/prisma");
  const { applyPositionChanges, cloneLatestMonth, setMonthOpen, undoChange } = await import(
    "../src/modules/portfolio/application/month-editing"
  );
  const { checkTicker } = await import("../src/modules/quotes/application/check-ticker");
  const { refreshQuotes } = await import("../src/modules/quotes/application/refresh-quotes");
  const { calendarDay, currentReferenceMonth, toDateKey } = await import("../src/modules/quotes/domain/calendar");
  const { fetchCryptoQuotes } = await import("../src/modules/quotes/infrastructure/coingecko");

  const prisma = getPrismaClient()!;
  const startedAt = new Date();
  const counts = async () => ({
    institutions: await prisma.institution.count(),
    accounts: await prisma.account.count(),
    assets: await prisma.asset.count(),
    marketQuotes: await prisma.marketQuote.count(),
    dailyQuotes: await prisma.dailyQuote.count(),
    pinnedCoins: await prisma.asset.count({ where: { quoteProviderId: { not: null } } }),
    positions: await prisma.position.count(),
    allocations: await prisma.positionAllocation.count(),
  });
  const clearLookupCache = () =>
    (globalThis as unknown as { tickerLookupCache?: Map<string, unknown> }).tickerLookupCache?.clear();

  // Chaves dos ativos novos.
  const timeDeposit = (institutionName: string, maturityDate: string | null) =>
    buildAssetKey({ name: "Time Deposit", ticker: "USD", institutionName, maturityDate });
  check("saldo em dólar sem vencimento tem a chave da importação", timeDeposit("Revolut", null) === "market:time-deposit:USD");
  check(
    "saldo em dólar com vencimento leva a data na chave",
    timeDeposit("Revolut", "2027-01-15") === "market:time-deposit:USD:2027-01-15" &&
      timeDeposit("Nubank", "2027-06-15") !== timeDeposit("Revolut", "2027-01-15"),
  );
  check(
    "renda fixa com vencimento leva a data na chave",
    buildAssetKey({ name: "LCI BRB", ticker: null, institutionName: "Inter", maturityDate: "2027-06-15" }) ===
      "private:inter:lci-brb:2027-06-15",
  );

  // Competências: a do mês corrente, criada pelo clone se faltar, e a anterior.
  const current = currentReferenceMonth();
  for (let guard = 0; guard < 24; guard += 1) {
    const latest = await prisma.portfolioMonth.findFirstOrThrow({ orderBy: { referenceDate: "desc" } });
    if (latest.referenceDate.getTime() >= current.getTime()) {
      break;
    }
    await cloneLatestMonth();
  }
  const oct = await prisma.portfolioMonth.findUniqueOrThrow({ where: { referenceDate: current } });
  const sep = await prisma.portfolioMonth.findFirstOrThrow({
    where: { referenceDate: { lt: current } },
    orderBy: { referenceDate: "desc" },
  });
  check("competências corrente e anterior existem", oct.id !== sep.id);

  // Checagem de ticker na competência anterior.
  let mark = calls.length;
  const ethSep = await checkTicker({ monthId: sep.id, kind: "crypto", ticker: "eth" }, { configuration: CONFIGURATION });
  check(
    "ETH encontrado pela maior capitalização",
    ethSep.status === "found" && ethSep.name === "Ethereum" && ethSep.priceBrl === 13456.78,
    ethSep,
  );
  const ethAgain = await checkTicker({ monthId: sep.id, kind: "crypto", ticker: "ETH" }, { configuration: CONFIGURATION });
  check(
    "a segunda checagem de ETH reaproveita a consulta",
    ethAgain.status === "found" && callsTo("api.coingecko.com", mark) === 2,
    calls.slice(mark),
  );
  const zzz = await checkTicker({ monthId: sep.id, kind: "crypto", ticker: "ZZZ" }, { configuration: CONFIGURATION });
  check("ZZZ não encontrado e sem token", zzz.status === "not-found" && !("token" in zzz), zzz);
  const nope = await checkTicker({ monthId: sep.id, kind: "us-etf", ticker: "NOPE" }, { configuration: CONFIGURATION });
  check("Finnhub com preço zero é não encontrado", nope.status === "not-found", nope);
  const qqq = await checkTicker({ monthId: sep.id, kind: "us-etf", ticker: "qqq" }, { configuration: CONFIGURATION });
  check("QQQ convertido pelo câmbio", qqq.status === "found" && Math.abs(qqq.priceBrl - 2550) < 1e-9, qqq);
  mark = calls.length;
  const fail = await checkTicker({ monthId: sep.id, kind: "us-stock", ticker: "FAIL" }, { configuration: CONFIGURATION });
  check(
    "erro de rede é indisponível com token",
    fail.status === "unavailable" && fail.code === "NETWORK_ERROR" && Boolean(fail.token),
    fail,
  );
  await checkTicker({ monthId: sep.id, kind: "us-stock", ticker: "FAIL" }, { configuration: CONFIGURATION });
  check("indisponível não fica guardado", callsTo("finnhub.io", mark) === 2, calls.slice(mark));
  const noKey = await checkTicker(
    { monthId: sep.id, kind: "us-stock", ticker: "AAPL" },
    { configuration: { ...CONFIGURATION, finnhubApiKey: undefined } },
  );
  check("chave ausente é indisponível", noKey.status === "unavailable" && noKey.code === "MISSING_API_KEY", noKey);
  mark = calls.length;
  const bova = await checkTicker({ monthId: sep.id, kind: "br-etf", ticker: "bova11" }, { configuration: CONFIGURATION });
  check(
    "BOVA11 recebe .SAO e é encontrado",
    bova.status === "found" && bova.symbol === "BOVA11.SAO" && bova.priceBrl === 130.5,
    bova,
  );
  const bovaStock = await checkTicker({ monthId: sep.id, kind: "br-stock", ticker: "BOVA11" }, { configuration: CONFIGURATION });
  check(
    "trocar ETF por ação da B3 não gasta outra consulta do Alpha Vantage",
    bovaStock.status === "found" && callsTo("www.alphavantage.co", mark) === 1,
    calls.slice(mark),
  );
  mark = calls.length;
  const partial = await checkTicker({ monthId: sep.id, kind: "br-stock", ticker: "PETR" }, { configuration: CONFIGURATION });
  check(
    "ticker da B3 incompleto é inválido sem consulta",
    partial.status === "invalid" && calls.length === mark,
    partial,
  );
  const xxxx = await checkTicker({ monthId: sep.id, kind: "br-stock", ticker: "XXXX11" }, { configuration: CONFIGURATION });
  check("Global Quote vazio é não encontrado", xxxx.status === "not-found", xxxx);
  const limit = await checkTicker({ monthId: sep.id, kind: "br-stock", ticker: "LIMT11" }, { configuration: CONFIGURATION });
  check("aviso de limite do Alpha Vantage é indisponível", limit.status === "unavailable" && limit.code === "RATE_LIMITED", limit);
  const voo = await checkTicker({ monthId: sep.id, kind: "us-stock", ticker: "VOO" }, { configuration: CONFIGURATION });
  check("VOO já cotado na competência", voo.status === "known" && voo.priceBrl > 0, voo);
  mark = calls.length;
  const btcConflict = await checkTicker({ monthId: sep.id, kind: "us-etf", ticker: "BTC" }, { configuration: CONFIGURATION });
  check("BTC como ETF é conflito sem consulta", btcConflict.status === "conflict" && calls.length === mark, btcConflict);
  const usd = await checkTicker({ monthId: sep.id, kind: "crypto", ticker: "USD" }, { configuration: CONFIGURATION });
  check("USD não é ticker de cripto", usd.status === "invalid", usd);

  // Atualização de cotações: moeda guardada sem busca; sem ela, pela busca.
  mark = calls.length;
  const refreshed = await fetchCryptoQuotes([{ symbol: "ETH" }, { symbol: "BTC" }, { symbol: "ZZZ" }], "x");
  check(
    "sem moeda guardada, ETH é resolvido pela busca e ZZZ falha",
    refreshed.some((result) => result.symbol === "ETH" && result.status === "SUCCESS" && result.valueBrl === 13456.78) &&
      refreshed.some((result) => result.symbol === "ZZZ" && result.status === "FAILED" && result.errorCode === "NOT_FOUND"),
    refreshed,
  );
  mark = calls.length;
  const pinned = await fetchCryptoQuotes([{ symbol: "ETH", coinId: "ethereum" }], "x");
  check(
    "com moeda guardada, a atualização não busca",
    pinned[0]?.status === "SUCCESS" && calls.slice(mark).every((call) => !call.includes("/search")),
    calls.slice(mark),
  );

  const inter = await prisma.account.findFirstOrThrow({
    where: { institution: { name: "Inter" } },
    select: { id: true, institutionId: true },
  });
  const plain = { maturityDate: null, quoteCheckToken: null, manualPriceBrl: null };
  const cryptoAllocation = { assetClass: "Cripto", subclass: "Altcoin", duration: "-" };
  const usAllocation = { assetClass: "Renda Variável", subclass: "Ações EUA", duration: "-" };
  const cashAllocation = { assetClass: "Caixa", subclass: "Pós-fixado", duration: "D+0" };
  const tokenOf = (response: Awaited<ReturnType<typeof checkTicker>>) =>
    response.status === "found" || response.status === "unavailable" ? response.token : null;

  // Competência anterior: só aceita edição aberta (spec 034); encontrado exige
  // a cotação digitada.
  await setMonthOpen({ monthId: sep.id, open: true });
  const beforePast = await counts();
  await expectError(
    "competência passada exige a cotação digitada",
    () =>
      applyPositionChanges({
        monthId: sep.id,
        updates: [],
        removals: [],
        additions: [
          {
            accountId: inter.id,
            newAsset: { ...plain, name: "Ethereum", kind: "crypto", ticker: "ETH", allocation: cryptoAllocation, quoteCheckToken: tokenOf(ethSep) },
            value: "1",
            strategy: null,
          },
        ],
      }),
    /Informe a cotação de ETH/,
  );
  check("salvamento recusado não muda nada", JSON.stringify(await counts()) === JSON.stringify(beforePast));
  const pastSave = await applyPositionChanges({
    monthId: sep.id,
    updates: [],
    removals: [],
    additions: [
      {
        accountId: inter.id,
        newAsset: {
          ...plain,
          name: "Ethereum",
          kind: "crypto",
          ticker: "ETH",
          allocation: cryptoAllocation,
          quoteCheckToken: tokenOf(ethSep),
          manualPriceBrl: "12000,50",
        },
        value: "2",
        strategy: "Satellite",
      },
    ],
  });
  const ethQuoteSep = await prisma.marketQuote.findUnique({
    where: { referenceDate_symbol: { referenceDate: sep.referenceDate, symbol: "ETH" } },
  });
  const ethDaily = await prisma.dailyQuote.findMany({ where: { symbol: "ETH" } });
  const ethPosition = await prisma.position.findFirst({
    where: { portfolioMonthId: sep.id, asset: { quoteSymbol: "ETH" } },
    include: { allocations: true, asset: true },
  });
  check(
    "competência passada usa a cotação digitada, sem dia",
    ethQuoteSep?.valueBrl.toString() === "12000.5" &&
      ethQuoteSep.quoteDate === null &&
      ethQuoteSep.instrumentType === "CRIPTO" &&
      ethQuoteSep.baseCurrency === "Altcoins",
    ethQuoteSep,
  );
  check(
    "o histórico diário recebe a cotação de hoje",
    ethDaily.length === 1 && ethDaily[0].valueBrl.toString() === "13456.78" && ethDaily[0].provider === "coingecko",
  );
  check(
    "posição da competência passada pela cotação digitada",
    ethPosition?.totalBrl.toString() === "24001" &&
      ethPosition.allocations.length === 1 &&
      ethPosition.allocations[0].subclass === "Altcoin" &&
      ethPosition.allocations[0].weight.toString() === "1" &&
      ethPosition.asset.baseCurrency === "Altcoins",
  );
  check(
    "a moeda conferida fica guardada no ativo",
    ethPosition?.asset.quoteProviderId === "ethereum",
    ethPosition?.asset,
  );

  // Com a moeda guardada, a checagem não busca de novo, mesmo se a busca mudar.
  clearLookupCache();
  fakeEthRank = 1;
  mark = calls.length;
  const ethPinned = await checkTicker({ monthId: oct.id, kind: "crypto", ticker: "ETH" }, { configuration: CONFIGURATION });
  check(
    "a checagem usa a moeda guardada sem buscar",
    ethPinned.status === "found" &&
      ethPinned.name === null &&
      ethPinned.priceBrl === 13456.78 &&
      calls.slice(mark).every((call) => !call.includes("/search")),
    { ethPinned, calls: calls.slice(mark) },
  );
  fakeEthRank = 900;
  clearLookupCache();

  await undoChange(pastSave.undoToken);
  check("desfazer na competência passada devolve as contagens", JSON.stringify(await counts()) === JSON.stringify(beforePast), {
    beforePast,
    after: await counts(),
  });
  check(
    "desfazer remove o ativo e a moeda guardada nele",
    (await prisma.asset.count({ where: { quoteSymbol: "ETH" } })) === 0,
  );

  // Competência corrente: recusas.
  const ethOct = await checkTicker({ monthId: oct.id, kind: "crypto", ticker: "ETH" }, { configuration: CONFIGURATION });
  const qqqOct = await checkTicker({ monthId: oct.id, kind: "us-etf", ticker: "QQQ" }, { configuration: CONFIGURATION });
  const failOct = await checkTicker({ monthId: oct.id, kind: "us-stock", ticker: "FAIL" }, { configuration: CONFIGURATION });
  const anyAsset = await prisma.asset.findFirstOrThrow({ where: { quoteSymbol: null }, select: { id: true } });
  const refuse = (label: string, addition: Parameters<typeof applyPositionChanges>[0]["additions"], pattern: RegExp) =>
    expectError(
      label,
      () => applyPositionChanges({ monthId: oct.id, updates: [], removals: [], additions: addition }),
      pattern,
    );

  await refuse(
    "instituição repetida com outra caixa e acento",
    [{ newAccount: { institutionId: null, institutionName: "itau", name: "Principal" }, assetId: anyAsset.id, value: "1", strategy: null }],
    /instituição "Itaú" já existe/,
  );
  await refuse(
    "conta repetida na instituição",
    [{ newAccount: { institutionId: inter.institutionId, institutionName: null, name: "principal" }, assetId: anyAsset.id, value: "1", strategy: null }],
    /conta "Principal" já existe/,
  );
  await refuse(
    "ativo repetido por nome e ticker",
    [{ accountId: inter.id, newAsset: { ...plain, name: "ETF - VOO", kind: "us-etf", ticker: "VOO", allocation: usAllocation }, value: "1", strategy: null }],
    /"ETF - VOO" com o ticker VOO já existe/,
  );
  await refuse(
    "renda fixa repetida na instituição sem vencimento",
    [
      {
        accountId: inter.id,
        newAsset: { ...plain, name: "LCI BRB", kind: "fixed-income", ticker: null, allocation: { assetClass: "Renda Fixa", subclass: "IPCA", duration: "Curto" } },
        value: "1",
        strategy: null,
      },
    ],
    /"LCI BRB" já existe nesta instituição\. Escolha-o na lista ou informe um vencimento/,
  );
  await refuse(
    "saldo em dólar repetido sem vencimento",
    [{ accountId: inter.id, newAsset: { ...plain, name: "time deposit", kind: "usd-balance", ticker: null, allocation: cashAllocation }, value: "1", strategy: null }],
    /"Time Deposit" cotado pelo USD já existe\. Escolha-o na lista ou informe um vencimento/,
  );
  await refuse(
    "o mesmo ativo novo com dados diferentes",
    [
      { accountId: inter.id, newAsset: { ...plain, name: "Time Deposit", kind: "usd-balance", ticker: null, maturityDate: "2027-01-15", allocation: cashAllocation }, value: "1", strategy: null },
      {
        newAccount: { institutionId: inter.institutionId, institutionName: null, name: "Outra" },
        newAsset: { ...plain, name: "Time Deposit", kind: "usd-balance", ticker: null, maturityDate: "2027-01-15", allocation: { ...cashAllocation, duration: "D+1" } },
        value: "1",
        strategy: null,
      },
    ],
    /com dados diferentes/,
  );
  await refuse(
    "vencimento em cripto",
    [{ accountId: inter.id, newAsset: { ...plain, name: "Ethereum X", kind: "crypto", ticker: "ETH", maturityDate: "2027-01-01", allocation: cryptoAllocation, quoteCheckToken: tokenOf(ethOct) }, value: "1", strategy: null }],
    /vencimento/,
  );
  await refuse(
    "token falso",
    [{ accountId: inter.id, newAsset: { ...plain, name: "Zzz coin", kind: "crypto", ticker: "ZZZ", allocation: cryptoAllocation, quoteCheckToken: "00000000-0000-4000-8000-000000000000", manualPriceBrl: "1" }, value: "1", strategy: null }],
    /expirou/,
  );
  await refuse(
    "token de outro símbolo",
    [{ accountId: inter.id, newAsset: { ...plain, name: "Zzz coin", kind: "crypto", ticker: "ZZZ", allocation: cryptoAllocation, quoteCheckToken: tokenOf(ethOct) }, value: "1", strategy: null }],
    /expirou/,
  );
  await refuse(
    "indisponível exige a cotação digitada",
    [{ accountId: inter.id, newAsset: { ...plain, name: "Fail Inc", kind: "us-stock", ticker: "FAIL", allocation: usAllocation, quoteCheckToken: tokenOf(failOct) }, value: "1", strategy: null }],
    /Informe a cotação de FAIL/,
  );
  await refuse(
    "VOO como cripto conflita",
    [{ accountId: inter.id, newAsset: { ...plain, name: "Voo coin", kind: "crypto", ticker: "VOO", allocation: cryptoAllocation }, value: "1", strategy: null }],
    /outro provedor/,
  );
  await refuse(
    "renda fixa sem subclasse",
    [{ accountId: inter.id, newAsset: { ...plain, name: "CDB X", kind: "fixed-income", ticker: null, allocation: { assetClass: "Renda Fixa", subclass: " ", duration: "Curto" } }, value: "1", strategy: null }],
    /subclasse/,
  );

  // Competência corrente: um salvamento com nove posições novas.
  const before = await counts();
  const save = await applyPositionChanges({
    monthId: oct.id,
    updates: [],
    removals: [],
    additions: [
      {
        newAccount: { institutionId: null, institutionName: "Nubank", name: "Principal" },
        newAsset: { ...plain, name: "Ethereum", kind: "crypto", ticker: "eth", allocation: cryptoAllocation, quoteCheckToken: tokenOf(ethOct) },
        value: "0,5",
        strategy: "Satellite",
      },
      {
        // Outro ativo novo do mesmo símbolo usa a cotação e a moeda do primeiro.
        accountId: inter.id,
        newAsset: { ...plain, name: "Ethereum Staking", kind: "crypto", ticker: "ETH", allocation: cryptoAllocation },
        value: "1",
        strategy: null,
      },
      {
        newAccount: { institutionId: null, institutionName: "nubank", name: "principal" },
        newAsset: { ...plain, name: "LCI Nubank", kind: "fixed-income", ticker: null, maturityDate: "2027-06-15", allocation: { assetClass: "Renda Fixa", subclass: "IPCA", duration: "Curto" } },
        value: "1000,10",
        strategy: "Core",
      },
      {
        newAccount: { institutionId: inter.institutionId, institutionName: null, name: "Corretora" },
        newAsset: { ...plain, name: "Invesco QQQ", kind: "us-etf", ticker: "QQQ", allocation: usAllocation, quoteCheckToken: tokenOf(qqqOct) },
        value: "2",
        strategy: null,
      },
      {
        accountId: inter.id,
        newAsset: { ...plain, name: "Fail Inc", kind: "us-stock", ticker: "FAIL", allocation: usAllocation, quoteCheckToken: tokenOf(failOct), manualPriceBrl: "100" },
        value: "3",
        strategy: null,
      },
      {
        accountId: inter.id,
        newAsset: { ...plain, name: "Vanguard S&P", kind: "us-stock", ticker: "VOO", allocation: usAllocation },
        value: "1",
        strategy: "Core",
      },
      {
        accountId: inter.id,
        newAsset: { ...plain, name: "Dólar Wise", kind: "usd-balance", ticker: null, maturityDate: "2026-10-20", allocation: cashAllocation },
        value: "100",
        strategy: null,
      },
      {
        accountId: inter.id,
        newAsset: { ...plain, name: "Time Deposit", kind: "usd-balance", ticker: null, maturityDate: "2027-01-15", allocation: cashAllocation },
        value: "1000",
        strategy: null,
      },
      {
        newAccount: { institutionId: null, institutionName: "Nubank", name: "Principal" },
        newAsset: { ...plain, name: "Time Deposit", kind: "usd-balance", ticker: null, maturityDate: "2027-06-15", allocation: cashAllocation },
        value: "2000",
        strategy: null,
      },
    ],
  });
  const after = await counts();
  check(
    "contagens depois de salvar",
    after.institutions === before.institutions + 1 &&
      after.accounts === before.accounts + 2 &&
      after.assets === before.assets + 9 &&
      after.positions === before.positions + 9 &&
      after.marketQuotes === before.marketQuotes + 3 &&
      after.dailyQuotes === before.dailyQuotes + 2 &&
      after.pinnedCoins === before.pinnedCoins + 2 &&
      after.allocations === before.allocations + 9,
    { before, after },
  );
  const nubank = await prisma.institution.findUnique({ where: { normalizedName: "nubank" }, include: { accounts: true } });
  check(
    "Nubank criado uma vez com uma conta Principal",
    nubank?.name === "Nubank" && nubank.accounts.length === 1 && nubank.accounts[0].name === "Principal",
  );
  const octQuotes = await prisma.marketQuote.findMany({
    where: { referenceDate: oct.referenceDate, symbol: { in: ["ETH", "QQQ", "FAIL", "VOO"] } },
  });
  const quote = Object.fromEntries(octQuotes.map((entry) => [entry.symbol, entry]));
  const todayKey = toDateKey(calendarDay(new Date()));
  check(
    "ETH do mês pelo preço conferido, com o dia",
    quote.ETH?.valueBrl.toString() === "13456.78" &&
      quote.ETH.quoteDate?.toISOString().startsWith(todayKey) === true &&
      quote.ETH.carriedFrom === null,
    quote.ETH,
  );
  check(
    "QQQ do mês convertido, ETF em USD",
    quote.QQQ?.valueBrl.toString() === "2550" && quote.QQQ.instrumentType === "ETF" && quote.QQQ.baseCurrency === "USD",
  );
  check(
    "FAIL do mês digitado, ACAO, sem dia",
    quote.FAIL?.valueBrl.toString() === "100" && quote.FAIL.instrumentType === "ACAO" && quote.FAIL.quoteDate === null,
  );
  const positions = await prisma.position.findMany({
    where: { portfolioMonthId: oct.id, asset: { createdAt: { gte: startedAt } } },
    include: { asset: true, allocations: true, account: { include: { institution: true } } },
  });
  const byKey = Object.fromEntries(positions.map((position) => [position.asset.normalizedKey, position]));
  const eth = byKey["market:ethereum:ETH"];
  check(
    "ETH 0,5 pelo preço",
    eth?.totalBrl.toString() === "6728.39" && eth.strategy === "Satellite" && eth.account.institution.name === "Nubank",
  );
  const lci = byKey["private:nubank:lci-nubank:2027-06-15"];
  check(
    "LCI com vencimento e rateio",
    lci?.asset.maturityDate?.toISOString().startsWith("2027-06-15") === true &&
      lci.totalBrl.toString() === "1000.1" &&
      lci.allocations[0].subclass === "IPCA" &&
      lci.allocations[0].duration === "Curto",
  );
  const qqqPosition = byKey["market:invesco-qqq:QQQ"];
  check(
    "QQQ na conta nova Corretora do Inter",
    qqqPosition?.account.name === "Corretora" &&
      qqqPosition.totalBrl.toString() === "5100" &&
      qqqPosition.asset.ticker === "QQQ" &&
      qqqPosition.exchangeRateBrl !== null,
  );
  const vooQuote = await prisma.marketQuote.findUnique({
    where: { referenceDate_symbol: { referenceDate: oct.referenceDate, symbol: "VOO" } },
  });
  check(
    "VOO usa a cotação do mês",
    byKey["market:vanguard-s-p:VOO"]?.unitPriceBrl?.toString() === vooQuote?.valueBrl.toString(),
  );
  const wise = byKey["market:dolar-wise:USD:2026-10-20"];
  check(
    "saldo em dólar cotado pelo USD, com vencimento",
    wise?.asset.quoteSymbol === "USD" && wise.asset.baseCurrency === "USD" && wise.unitPriceBrl !== null,
  );
  check(
    "dois Time Deposit novos com vencimentos diferentes são ativos distintos",
    byKey["market:time-deposit:USD:2027-01-15"]?.account.institution.name === "Inter" &&
      byKey["market:time-deposit:USD:2027-06-15"]?.account.institution.name === "Nubank",
    Object.keys(byKey),
  );
  const daily = await prisma.dailyQuote.findMany({ where: { symbol: { in: ["ETH", "QQQ", "FAIL"] } } });
  check(
    "cotações diárias só de ETH e QQQ",
    daily.map((entry) => entry.symbol).sort().join(",") === "ETH,QQQ",
  );

  check(
    "a moeda de ETH fica nos dois ativos novos do símbolo",
    eth?.asset.quoteProviderId === "ethereum" && byKey["market:ethereum-staking:ETH"]?.asset.quoteProviderId === "ethereum",
  );
  check(
    "ativos sem CoinGecko não guardam moeda",
    positions
      .filter((position) => position.asset.quoteSymbol !== "ETH")
      .every((position) => position.asset.quoteProviderId === null),
  );

  // A atualização de cotações pede ETH pela moeda guardada. O buscador simulado
  // não devolve nada, então nenhuma cotação muda e o desfazer continua valendo.
  let requested: { symbol: string; providerId?: string }[] = [];
  const refresh = await refreshQuotes({
    trigger: "MANUAL",
    fetchQuotes: async (requests) => {
      requested = requests;
      return [];
    },
  });
  check(
    "a atualização pede ETH pela moeda guardada",
    refresh.state === "done" &&
      requested.some((request) => request.symbol === "ETH" && request.providerId === "ethereum") &&
      requested.every((request) => request.symbol === "ETH" || request.providerId === undefined),
    requested,
  );

  // Desfazer remove os cadastros criados.
  await undoChange(save.undoToken);
  const undone = await counts();
  check("desfazer devolve as contagens", JSON.stringify(undone) === JSON.stringify(before), { before, undone });
  check("Nubank removido", (await prisma.institution.findUnique({ where: { normalizedName: "nubank" } })) === null);
  check("Corretora removida", (await prisma.account.count({ where: { name: "Corretora" } })) === 0);
  check("ativos de ETH removidos", (await prisma.asset.count({ where: { quoteSymbol: "ETH" } })) === 0);

  await prisma.$disconnect();
}

main()
  .then(() => {
    console.log(results.join("\n"));
    const passed = results.filter((result) => result.startsWith("PASS")).length;
    console.log(`${passed}/${results.length} conferências passaram.`);
    process.exit(passed === results.length ? 0 : 1);
  })
  .catch((error) => {
    console.error(results.join("\n"));
    console.error(error);
    process.exit(1);
  });
