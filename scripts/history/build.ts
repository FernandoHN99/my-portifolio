import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { Prisma } from "../../src/generated/prisma/client";
import {
  CATALOG,
  DROP_EXACT_DUPLICATES,
  FILL_POSITIONS,
  FIX_CASH_SUBCLASS,
  INSTITUTION_ALIASES,
  KNOWN_QUANTITIES,
  KNOWN_SHARES,
  MATURITIES,
  MERGE_SAME_POSITION,
  OPEN_MONTH,
  PRECISE_QUANTITIES,
  REDEMPTION_DAYS_TO_LIQUIDITY,
  ROW_FIXES,
  SOURCE_ASSETS,
  STANDARDIZE_CLASSIFICATION,
  USD_AMOUNT_ASSETS,
  pendingAnswers,
  type CatalogAsset,
} from "./decisions";

// Passo pré-produção (.ai/context/pre-deploy.md): monta, sem rede e sem banco,
// o histórico completo para importação a partir de
// - `data/history/source/`: as duas tabelas da planilha exportadas pelo
//   usuário;
// - `data/history/raw/`: as séries baixadas por `fetch-quotes.ts`;
// - `decisions.ts`: as respostas do usuário e as propostas pendentes.
// Grava os CSVs em `data/history/output/`, com ponto e vírgula e vírgula
// decimal, como a planilha.

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, "data/history/source");
const RAW = path.join(ROOT, "data/history/raw");
const OUTPUT = path.join(ROOT, "data/history/output");
const FIRST_MONTH = "2023-06";
const LAST_SHEET_MONTH = "2026-09";

// ---------------------------------------------------------------- utilidades

function cleanText(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function parseDecimal(value: string | undefined) {
  const text = value?.trim().replace(/\./g, "").replace(",", ".");
  return text && /^-?\d+(\.\d+)?$/.test(text) ? new Decimal(text) : null;
}

function excelMonth(serial: string) {
  const date = new Date(Date.UTC(1899, 11, 30) + Number(serial) * 86_400_000);
  return date.toISOString().slice(0, 7);
}

function nextMonth(month: string) {
  const [year, number] = month.split("-").map(Number);
  return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, "0")}`;
}

function lastDay(month: string) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
}

function monthsFrom(first: string, last: string) {
  const months: string[] = [];
  for (let month = first; month <= last; month = nextMonth(month)) {
    months.push(month);
  }
  return months;
}

function normalizeKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Mesma chave de `buildAssetKey` (src/modules/portfolio/domain/asset-kinds.ts). */
function assetKey(asset: CatalogAsset, maturity: string | null) {
  const base = asset.ticker
    ? `market:${normalizeKey(asset.name)}:${asset.ticker.toUpperCase()}`
    : `private:${normalizeKey(asset.institution ?? "")}:${normalizeKey(asset.name)}`;
  return maturity ? `${base}:${maturity}` : base;
}

function fmt(value: Decimal | null | undefined, places?: number) {
  if (value === null || value === undefined) {
    return "";
  }
  const text = places === undefined ? value.toFixed() : value.toFixed(places);
  return text.replace(".", ",");
}

async function readCsv(file: string) {
  const text = (await readFile(file, "utf8")).replace(/^﻿/, "");
  const [header, ...lines] = text.split(/\r?\n/).filter((line) => line.length > 0);
  const columns = header.split(";");
  return lines.map((line, index) => {
    const cells = line.split(";");
    const row: Record<string, string> = { __line: String(index + 2) };
    columns.forEach((column, position) => {
      row[column] = cells[position] ?? "";
    });
    return row;
  });
}

function csv(rows: (string | number | null | undefined)[][]) {
  return `${rows
    .map((row) =>
      row
        .map((cell) => {
          const text = cell === null || cell === undefined ? "" : String(cell);
          return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(";"),
    )
    .join("\n")}\n`;
}

// ------------------------------------------------------------------ cotações

type Close = { day: string; value: Decimal };

type MonthQuote = {
  symbol: string;
  month: string;
  instrumentType: string;
  baseCurrency: string;
  valueBrl: Decimal;
  day: string;
  close: Decimal;
  currency: string;
  usdRate: Decimal | null;
  provider: string;
  check: Decimal | null;
  checkSource: string;
  /** Competência (AAAA-MM) cuja cotação foi repetida, no mês aberto. */
  carriedFrom?: string;
};

function lastByMonth(points: Close[]) {
  const months = new Map<string, Close>();
  for (const point of points) {
    const month = point.day.slice(0, 7);
    const current = months.get(month);
    if (!current || point.day > current.day) {
      months.set(month, point);
    }
  }
  return months;
}

async function readJson<T>(name: string) {
  return JSON.parse(await readFile(path.join(RAW, name), "utf8")) as T;
}

type YahooChart = {
  chart: {
    result: {
      meta: { gmtoffset: number; currency: string };
      timestamp: number[];
      indicators: { quote: { close: (number | null)[] }[] };
    }[];
  };
};

async function yahooCloses(symbol: string) {
  const result = (await readJson<YahooChart>(`yahoo-${symbol}.json`)).chart.result[0];
  const offset = result.meta.gmtoffset * 1000;
  const closes = result.indicators.quote[0].close;
  return lastByMonth(
    result.timestamp.flatMap((time, index) => {
      const close = closes[index];
      return close && close > 0
        ? [{ day: new Date(time * 1000 + offset).toISOString().slice(0, 10), value: new Decimal(close.toFixed(4)) }]
        : [];
    }),
  );
}

async function alphaCloses(symbol: string) {
  try {
    const payload = await readJson<{ "Monthly Time Series": Record<string, Record<string, string>> }>(
      `alpha-${symbol}.json`,
    );
    return lastByMonth(
      Object.entries(payload["Monthly Time Series"]).map(([day, values]) => ({
        day,
        value: new Decimal(values["4. close"]),
      })),
    );
  } catch {
    return new Map<string, Close>();
  }
}

async function binanceCloses(pair: string) {
  const klines = await readJson<[number, string, string, string, string][]>(`binance-${pair}.json`);
  return new Map(
    klines.map(([openTime, , , , close]) => {
      const month = new Date(openTime).toISOString().slice(0, 7);
      return [month, { day: lastDay(month), value: new Decimal(close) }] as const;
    }),
  );
}

const US_ETFS = ["VOO", "VTI", "ARGT", "GLDM", "SIVR", "IAUM", "XLE", "VXUS"];
const CRYPTOS: Record<string, string> = { BTC: "BTC", SOL: "Altcoins", ETH: "Altcoins" };

async function loadQuotes(months: string[]) {
  const ptax = lastByMonth(
    (await readJson<{ value: { cotacaoVenda: number; dataHoraCotacao: string }[] }>("ptax-usd.json")).value.map(
      (quote) => ({ day: quote.dataHoraCotacao.slice(0, 10), value: new Decimal(String(quote.cotacaoVenda)) }),
    ),
  );
  const yahooUsd = await yahooCloses("BRL=X");
  const quotes = new Map<string, MonthQuote>();
  const put = (quote: MonthQuote) => quotes.set(`${quote.month}|${quote.symbol}`, quote);
  const pct = (value: Decimal, check: Decimal | null) =>
    check && !check.isZero() ? value.div(check).minus(1).mul(100) : null;

  for (const month of months) {
    const usd = ptax.get(month);
    if (!usd) {
      throw new Error(`Sem PTAX em ${month}.`);
    }
    const check = yahooUsd.get(month)?.value ?? null;
    put({
      symbol: "USD",
      month,
      instrumentType: "FIAT",
      baseCurrency: "USD",
      valueBrl: usd.value,
      day: usd.day,
      close: usd.value,
      currency: "BRL",
      usdRate: null,
      provider: "ptax-bcb",
      check,
      checkSource: "yahoo BRL=X",
    });
  }

  for (const [symbol, baseCurrency] of Object.entries(CRYPTOS)) {
    const brl = await binanceCloses(`${symbol}BRL`);
    const usdt = await binanceCloses(`${symbol}USDT`);
    for (const month of months) {
      const close = brl.get(month);
      if (!close) {
        continue;
      }
      const usdRate = quotes.get(`${month}|USD`)!.valueBrl;
      const alt = usdt.get(month);
      put({
        symbol,
        month,
        instrumentType: "CRIPTO",
        baseCurrency,
        valueBrl: close.value,
        day: close.day,
        close: close.value,
        currency: "BRL",
        usdRate: null,
        provider: `binance ${symbol}BRL`,
        check: alt ? alt.value.mul(usdRate).toDecimalPlaces(8) : null,
        checkSource: `binance ${symbol}USDT × PTAX`,
      });
    }
  }

  for (const symbol of [...US_ETFS, "GPCA11.SAO"]) {
    const brazilian = symbol.endsWith(".SAO");
    const yahoo = await yahooCloses(brazilian ? symbol.replace(/\.SAO$/, ".SA") : symbol);
    const alpha = await alphaCloses(symbol);
    for (const month of months) {
      const close = yahoo.get(month);
      if (!close) {
        continue;
      }
      // O XLE teve desdobramento de 2 para 1 em 2025-12-05: antes disso o Yahoo
      // devolve o preço ajustado. As posições de XLE começam em 2026-04.
      if (symbol === "XLE" && month < "2025-12") {
        continue;
      }
      const usdRate = brazilian ? null : quotes.get(`${month}|USD`)!.valueBrl;
      const alt = alpha.get(month);
      put({
        symbol,
        month,
        instrumentType: "ETF",
        baseCurrency: brazilian ? "BRL" : "USD",
        valueBrl: usdRate ? close.value.mul(usdRate).toDecimalPlaces(8) : close.value,
        day: close.day,
        close: close.value,
        currency: brazilian ? "BRL" : "USD",
        usdRate,
        provider: `yahoo ${brazilian ? symbol.replace(/\.SAO$/, ".SA") : symbol}${usdRate ? " × PTAX" : ""}`,
        check: alt ? (usdRate ? alt.value.mul(usdRate).toDecimalPlaces(8) : alt.value) : null,
        checkSource: `alpha vantage ${symbol}${usdRate ? " × PTAX" : ""}`,
      });
    }
  }

  return { quotes, pct };
}

// ------------------------------------------------------------------ montagem

type SourceAllocation = { assetClass: string; subclass: string; duration: string; weight: Decimal };

type Position = {
  month: string;
  institution: string;
  asset: string;
  quantity: Decimal;
  strategy: string | null;
  origin: string;
  notes: string[];
  sheet: { quantity: string; price: string; total: string } | null;
  allocations: SourceAllocation[];
};

function normalizeAllocation(allocation: SourceAllocation, liquidity: Set<string>): SourceAllocation {
  let { subclass, duration } = allocation;
  if (REDEMPTION_DAYS_TO_LIQUIDITY && /^D\+\d+$/.test(duration)) {
    liquidity.add(duration);
    duration = "Curto";
  }
  if (FIX_CASH_SUBCLASS && allocation.assetClass === "Caixa" && subclass === "Curto") {
    subclass = "Pós-fixado";
  }
  return { ...allocation, subclass, duration };
}

function positionId(position: Pick<Position, "month" | "institution" | "asset">) {
  return `${position.month}|${position.institution}|${position.asset}`;
}

async function main() {
  const warnings: string[] = [];
  const sheetMonths = monthsFrom(FIRST_MONTH, LAST_SHEET_MONTH);
  const { quotes, pct } = await loadQuotes(sheetMonths);
  const quoteOf = (month: string, symbol: string) => {
    const quote = quotes.get(`${month}|${symbol}`);
    if (!quote) {
      throw new Error(`Sem cotação de ${symbol} em ${month}.`);
    }
    return quote;
  };

  const main = await readCsv(path.join(SOURCE, "02-INVESTIMENTOS_MAIN.csv"));
  const porcent = await readCsv(path.join(SOURCE, "03-INVESTIMENTOS_PORCENT.csv"));

  // Rateio de cada linha principal: as linhas de classificação do mesmo mês e
  // nome, na mesma ordem quando há uma por posição, ou todas da única posição
  // quando o nome se divide em várias classificações (GPCA11, previdência).
  const allocationsByLine = new Map<string, SourceAllocation[]>();
  const groups = new Map<string, { main: Record<string, string>[]; porcent: Record<string, string>[] }>();
  for (const row of main) {
    const key = `${excelMonth(row.Data)}|${cleanText(row.Nome)}`;
    const group = groups.get(key) ?? { main: [], porcent: [] };
    group.main.push(row);
    groups.set(key, group);
  }
  for (const row of porcent) {
    const key = `${excelMonth(row.Data)}|${cleanText(row.Nome)}`;
    const group = groups.get(key);
    if (!group) {
      throw new Error(`Classificação sem posição: ${key} (linha ${row.__line}).`);
    }
    group.porcent.push(row);
  }
  for (const [key, group] of groups) {
    const parsed = group.porcent.map((row) => ({
      assetClass: cleanText(row.Classe),
      subclass: cleanText(row.Subclasse),
      duration: cleanText(row["Duração"]),
      weight: parseDecimal(row.Porcentagem) ?? new Decimal(1),
    }));
    if (group.main.length === parsed.length && parsed.every((allocation) => allocation.weight.equals(1))) {
      group.main.forEach((row, index) => allocationsByLine.set(row.__line, [parsed[index]]));
    } else if (group.main.length === 1) {
      const sum = parsed.reduce((total, allocation) => total.plus(allocation.weight), new Decimal(0));
      if (!sum.equals(1)) {
        throw new Error(`Rateio de ${key} soma ${sum.toFixed()}.`);
      }
      allocationsByLine.set(group.main[0].__line, parsed);
    } else {
      throw new Error(`Não foi possível parear as classificações de ${key}.`);
    }
  }

  // Posições da planilha, mês a mês.
  const liquidityFound = new Map<string, Set<string>>();
  const byMonth = new Map<string, Map<string, Position>>();
  const seenRows = new Map<string, Record<string, string>>();
  const unusedFixes = new Set(ROW_FIXES.map((fix) => `${fix.month}|${fix.name}|${fix.institution}`));

  for (const row of main) {
    const month = excelMonth(row.Data);
    const name = cleanText(row.Nome);
    const ticker = cleanText(row.Ticker);
    const sourceInstitution = cleanText(row["Instituição"]);
    const sourceKey = `${name}|${ticker}|${sourceInstitution}`;
    const asset = SOURCE_ASSETS[sourceKey];
    if (!asset || !CATALOG[asset]) {
      throw new Error(`Linha ${row.__line} sem ativo no catálogo: ${sourceKey}.`);
    }
    const institution = INSTITUTION_ALIASES[sourceInstitution] ?? sourceInstitution;
    const notes: string[] = [];
    let quantity = parseDecimal(row.Quantidade);

    const fix = ROW_FIXES.find(
      (candidate) => candidate.month === month && candidate.name === name && candidate.institution === sourceInstitution,
    );
    if (fix) {
      unusedFixes.delete(`${fix.month}|${fix.name}|${fix.institution}`);
      if (fix.quantity === null) {
        warnings.push(`Linha ${row.__line} (${month} ${name}) descartada (${fix.ref}).`);
        continue;
      }
      notes.push(`quantidade ${row.Quantidade} → ${fmt(new Decimal(fix.quantity))} (${fix.ref})`);
      quantity = new Decimal(fix.quantity);
    }
    if (!quantity) {
      throw new Error(`Linha ${row.__line} sem quantidade: ${row.Quantidade}.`);
    }

    const duplicateKey = `${month}|${sourceKey}|${row.Quantidade}|${row["Total (R$)"]}`;
    const duplicate = seenRows.get(duplicateKey);
    if (duplicate && DROP_EXACT_DUPLICATES) {
      warnings.push(`Linha ${row.__line} repete a linha ${duplicate.__line} (${month} ${name}) e foi descartada (P13).`);
      continue;
    }
    seenRows.set(duplicateKey, row);

    const catalog = CATALOG[asset];
    if (ticker === "USD" && USD_AMOUNT_ASSETS.has(asset)) {
      // Valor em dólar registrado como quantidade (A9).
      const known = KNOWN_QUANTITIES[asset]?.[month] ?? KNOWN_SHARES[asset];
      const price = quoteOf(month, catalog.ticker!).valueBrl;
      const usdRate = quoteOf(month, "USD").valueBrl;
      const converted = known
        ? new Decimal(known)
        : quantity.mul(usdRate).div(price).toDecimalPlaces(8);
      notes.push(
        known
          ? `US$ ${fmt(quantity)} na planilha; ${fmt(converted)} ${catalog.ticker} (quantidade conhecida, P11/P12)`
          : `US$ ${fmt(quantity)} na planilha; ${fmt(converted)} ${catalog.ticker} = valor ÷ fechamento do mês (P12)`,
      );
      quantity = converted;
    }

    const precise = PRECISE_QUANTITIES.find((item) => item.asset === asset && quantity!.equals(item.rounded));
    if (precise) {
      notes.push(`quantidade ${fmt(quantity)} → ${fmt(new Decimal(precise.precise))} (P16)`);
      quantity = new Decimal(precise.precise);
    }

    const found = liquidityFound.get(asset) ?? new Set<string>();
    liquidityFound.set(asset, found);
    const allocations = (allocationsByLine.get(row.__line) ?? []).map((allocation) =>
      normalizeAllocation(allocation, found),
    );
    const position: Position = {
      month,
      institution,
      asset,
      quantity,
      strategy: cleanText(row["Estratégia"]) || null,
      origin: `planilha linha ${row.__line}`,
      notes,
      sheet: { quantity: row.Quantidade, price: row["Cotação Ativo"], total: row["Total (R$)"] },
      allocations,
    };

    const positions = byMonth.get(month) ?? new Map<string, Position>();
    byMonth.set(month, positions);
    const id = positionId(position);
    const existing = positions.get(id);
    if (!existing) {
      positions.set(id, position);
      continue;
    }
    if (!MERGE_SAME_POSITION || catalog.ticker) {
      throw new Error(`Duas linhas para a mesma posição: ${id} (linhas ${existing.origin} e ${row.__line}).`);
    }
    // Duas linhas da mesma posição em reais (A8): somam o saldo e o rateio
    // passa a ser proporcional ao saldo de cada linha.
    const total = existing.quantity.plus(quantity);
    const scale = (list: SourceAllocation[], amount: Decimal) =>
      list.map((allocation) => ({ ...allocation, weight: allocation.weight.mul(amount).div(total) }));
    existing.allocations = [...scale(existing.allocations, existing.quantity), ...scale(allocations, quantity)];
    existing.quantity = total;
    existing.origin = `${existing.origin} + ${row.__line}`;
    existing.notes.push(`somada à linha ${row.__line} (${name}) (A8)`);
    existing.sheet = {
      quantity: `${existing.sheet!.quantity} + ${row.Quantidade}`,
      price: "",
      total: fmt(parseDecimal(existing.sheet!.total)!.plus(parseDecimal(row["Total (R$)"])!)),
    };
  }
  for (const fix of unusedFixes) {
    warnings.push(`Correção sem linha correspondente: ${fix}.`);
  }

  // Meses que faltam: repetem as posições do mês anterior.
  const monthOrigin = new Map<string, string>();
  for (const month of sheetMonths) {
    if (byMonth.has(month)) {
      monthOrigin.set(month, "planilha");
      continue;
    }
    const previousMonth = sheetMonths[sheetMonths.indexOf(month) - 1];
    const previous = byMonth.get(previousMonth)!;
    byMonth.set(
      month,
      new Map(
        [...previous.values()].map((position) => {
          const copy: Position = {
            ...position,
            month,
            origin: `copiado de ${previousMonth}`,
            notes: [],
            sheet: null,
            allocations: position.allocations.map((allocation) => ({ ...allocation })),
          };
          return [positionId(copy), copy];
        }),
      ),
    );
    monthOrigin.set(month, `copiado de ${previousMonth}`);
  }
  for (const fill of FILL_POSITIONS) {
    const positions = byMonth.get(fill.month)!;
    const previousMonth = sheetMonths[sheetMonths.indexOf(fill.month) - 1];
    const source = byMonth.get(previousMonth)!.get(`${previousMonth}|${fill.institution}|${fill.asset}`);
    if (!source || positions.has(`${fill.month}|${fill.institution}|${fill.asset}`)) {
      throw new Error(`Não foi possível repetir ${fill.asset} em ${fill.month}.`);
    }
    const copy: Position = {
      ...source,
      month: fill.month,
      origin: `copiado de ${previousMonth} (${fill.ref})`,
      notes: [],
      sheet: null,
      allocations: source.allocations.map((allocation) => ({ ...allocation })),
    };
    positions.set(positionId(copy), copy);
  }

  // Mês aberto (P17): repete as posições e as cotações de set/26, marcadas
  // como repetidas, como a virada de mês do aplicativo sem histórico diário.
  const monthStatus = new Map(sheetMonths.map((month) => [month, "IMPORTED"]));
  if (OPEN_MONTH) {
    const openMonth = OPEN_MONTH;
    const source = byMonth.get(LAST_SHEET_MONTH)!;
    byMonth.set(
      openMonth,
      new Map(
        [...source.values()].map((position) => {
          const copy: Position = {
            ...position,
            month: openMonth,
            origin: `copiado de ${LAST_SHEET_MONTH} (P17)`,
            notes: [],
            sheet: null,
            allocations: position.allocations.map((allocation) => ({ ...allocation })),
          };
          return [positionId(copy), copy];
        }),
      ),
    );
    monthOrigin.set(openMonth, `copiado de ${LAST_SHEET_MONTH}`);
    monthStatus.set(openMonth, "DRAFT");
    for (const quote of [...quotes.values()].filter((item) => item.month === LAST_SHEET_MONTH)) {
      quotes.set(`${openMonth}|${quote.symbol}`, {
        ...quote,
        month: openMonth,
        provider: `repetida de ${LAST_SHEET_MONTH}`,
        check: null,
        checkSource: "",
        carriedFrom: LAST_SHEET_MONTH,
      });
    }
  }
  const allMonths = [...byMonth.keys()].sort();

  // Catálogo usado, com chave, liquidez e vencimento.
  const usedAssets = new Map<string, { first: string; last: string }>();
  for (const month of allMonths) {
    for (const position of byMonth.get(month)!.values()) {
      const range = usedAssets.get(position.asset);
      usedAssets.set(position.asset, { first: range?.first ?? month, last: month });
    }
  }
  const assetRows = [...usedAssets.entries()].map(([id, range]) => {
    const catalog = CATALOG[id];
    const maturity = MATURITIES[id] ?? null;
    const found = [...(liquidityFound.get(id) ?? [])];
    if (REDEMPTION_DAYS_TO_LIQUIDITY && found.length > 0 && !found.includes(catalog.liquidity ?? "")) {
      warnings.push(`${catalog.name}: liquidez ${catalog.liquidity ?? "vazia"} no catálogo, planilha tem ${found.join(", ")}.`);
    }
    return { id, catalog, key: assetKey(catalog, maturity), maturity, ...range };
  });
  const keys = new Set<string>();
  for (const row of assetRows) {
    if (keys.has(row.key)) {
      throw new Error(`Chave de ativo repetida: ${row.key}.`);
    }
    keys.add(row.key);
  }
  const keyOf = new Map(assetRows.map((row) => [row.id, row.key]));

  // Preço, total e rateio de cada posição; cotações de cada competência.
  const positionRows: (string | null)[][] = [];
  const allocationRows: (string | null)[][] = [];
  const monthRows: (string | number | null)[][] = [];
  const quoteUsage = new Set<string>();

  for (const month of allMonths) {
    const positions = [...byMonth.get(month)!.values()].sort((left, right) =>
      `${left.institution}|${CATALOG[left.asset].name}`.localeCompare(`${right.institution}|${CATALOG[right.asset].name}`, "pt-BR"),
    );
    let monthTotal = new Decimal(0);
    let sheetTotal = new Decimal(0);
    let sheetComplete = true;
    for (const position of positions) {
      const catalog = CATALOG[position.asset];
      let unitPriceBrl: Decimal | null;
      let totalBrl: Decimal;
      const exchangeRateBrl = quoteOf(month, "USD").valueBrl;
      quoteUsage.add(`${month}|USD`);
      if (catalog.ticker) {
        unitPriceBrl = quoteOf(month, catalog.ticker).valueBrl;
        quoteUsage.add(`${month}|${catalog.ticker}`);
        totalBrl = position.quantity.mul(unitPriceBrl).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      } else {
        unitPriceBrl = null;
        totalBrl = position.quantity.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      }
      monthTotal = monthTotal.plus(totalBrl);
      const sheetValue = position.sheet ? parseDecimal(position.sheet.total) : null;
      if (sheetValue) {
        sheetTotal = sheetTotal.plus(sheetValue);
      } else {
        sheetComplete = false;
      }

      const allocations =
        STANDARDIZE_CLASSIFICATION && catalog.allocation !== "source"
          ? catalog.allocation.map((allocation) => ({ ...allocation, weight: new Decimal(allocation.weight) }))
          : position.allocations;
      const rounded = allocations.map((allocation) => ({
        ...allocation,
        weight: allocation.weight.toDecimalPlaces(10, Decimal.ROUND_HALF_UP),
      }));
      const sum = rounded.reduce((total, allocation) => total.plus(allocation.weight), new Decimal(0));
      if (!sum.equals(1) && rounded.length > 0) {
        rounded[rounded.length - 1].weight = rounded[rounded.length - 1].weight.plus(new Decimal(1).minus(sum));
      }
      if (rounded.length === 0) {
        warnings.push(`${month} ${catalog.name}: sem rateio.`);
      }
      for (const allocation of rounded) {
        allocationRows.push([
          month,
          position.institution,
          position.asset,
          keyOf.get(position.asset)!,
          allocation.assetClass,
          allocation.subclass,
          allocation.duration,
          fmt(allocation.weight),
        ]);
      }

      positionRows.push([
        month,
        monthStatus.get(month)!,
        position.institution,
        "Principal",
        position.asset,
        keyOf.get(position.asset)!,
        catalog.name,
        catalog.ticker,
        fmt(position.quantity),
        fmt(unitPriceBrl),
        fmt(exchangeRateBrl),
        fmt(totalBrl, 2),
        position.strategy,
        position.origin,
        position.notes.join(" | "),
        position.sheet?.quantity ?? "",
        position.sheet?.price ?? "",
        position.sheet?.total ?? "",
      ]);
    }
    const difference = sheetComplete && !sheetTotal.isZero() ? monthTotal.div(sheetTotal).minus(1).mul(100) : null;
    monthRows.push([
      month,
      monthStatus.get(month)!,
      monthOrigin.get(month)!,
      positions.length,
      fmt(monthTotal, 2),
      sheetComplete ? fmt(sheetTotal, 2) : "",
      difference ? `${fmt(difference, 1)}%` : "",
    ]);
  }

  // Cotações: o fechamento de cada mês de todos os símbolos do catálogo.
  // As dos símbolos com posição no mês vão para a competência; as demais, só
  // para o histórico diário, que alimenta o gráfico de cotação.
  const usedSymbols = new Set(assetRows.map((row) => row.catalog.ticker).filter(Boolean) as string[]);
  usedSymbols.add("USD");
  const quoteRows: (string | null)[][] = [];
  const allQuotes = [...quotes.values()]
    .filter((quote) => usedSymbols.has(quote.symbol))
    .sort((left, right) => `${left.month}|${left.symbol}`.localeCompare(`${right.month}|${right.symbol}`));
  for (const quote of allQuotes) {
    const used = quoteUsage.has(`${quote.month}|${quote.symbol}`);
    // Uma cotação repetida não é observação: só entra na competência.
    if (quote.carriedFrom && !used) {
      continue;
    }
    const difference = pct(quote.valueBrl, quote.check);
    if (difference && difference.abs().greaterThan(3)) {
      warnings.push(`${quote.month} ${quote.symbol}: conferência difere ${fmt(difference, 2)}%.`);
    }
    quoteRows.push([
      quote.month,
      quote.symbol,
      quote.instrumentType,
      quote.baseCurrency,
      fmt(quote.valueBrl),
      quote.day,
      fmt(quote.close),
      quote.currency,
      fmt(quote.usdRate),
      quote.provider,
      fmt(quote.check),
      quote.checkSource,
      difference ? `${fmt(difference, 2)}%` : "",
      used ? "competência" : "histórico diário",
      quote.carriedFrom ?? "",
    ]);
  }
  for (const key of quoteUsage) {
    if (!quotes.has(key)) {
      throw new Error(`Cotação usada sem valor: ${key}.`);
    }
  }

  await mkdir(OUTPUT, { recursive: true });
  await writeFile(
    path.join(OUTPUT, "ativos.csv"),
    csv([
      [
        "ativo_id",
        "chave",
        "nome",
        "ticker",
        "simbolo_cotacao",
        "moeda_base",
        "tipo_instrumento",
        "instituicao_da_chave",
        "liquidez",
        "vencimento",
        "id_provedor",
        "primeiro_mes",
        "ultimo_mes",
      ],
      ...assetRows
        .sort((left, right) => left.catalog.name.localeCompare(right.catalog.name, "pt-BR"))
        .map((row) => [
          row.id,
          row.key,
          row.catalog.name,
          row.catalog.ticker,
          row.catalog.ticker,
          row.catalog.baseCurrency,
          row.catalog.instrumentType,
          row.catalog.institution ?? "",
          row.catalog.liquidity,
          row.maturity,
          row.catalog.quoteProviderId ?? "",
          row.first,
          row.last,
        ]),
    ]),
  );
  await writeFile(
    path.join(OUTPUT, "posicoes.csv"),
    csv([
      [
        "competencia",
        "status_mes",
        "instituicao",
        "conta",
        "ativo_id",
        "chave_ativo",
        "nome",
        "ticker",
        "quantidade",
        "cotacao_brl",
        "dolar_brl",
        "total_brl",
        "estrategia",
        "origem",
        "observacoes",
        "quantidade_planilha",
        "cotacao_planilha",
        "total_planilha",
      ],
      ...positionRows,
    ]),
  );
  await writeFile(
    path.join(OUTPUT, "rateios.csv"),
    csv([["competencia", "instituicao", "ativo_id", "chave_ativo", "classe", "subclasse", "resgate", "peso"], ...allocationRows]),
  );
  await writeFile(
    path.join(OUTPUT, "cotacoes.csv"),
    csv([
      [
        "competencia",
        "simbolo",
        "tipo",
        "moeda_base",
        "valor_brl",
        "dia",
        "fechamento",
        "moeda_fechamento",
        "dolar_usado",
        "provedor",
        "conferencia_brl",
        "fonte_conferencia",
        "diferenca",
        "destino",
        "repetida_de",
      ],
      ...quoteRows,
    ]),
  );
  await writeFile(
    path.join(OUTPUT, "meses.csv"),
    csv([["competencia", "status", "origem", "posicoes", "total_brl", "total_planilha", "diferenca"], ...monthRows]),
  );

  console.info(
    `${allMonths.length} competências (${allMonths[0]} a ${allMonths.at(-1)}), ${assetRows.length} ativos, ` +
      `${positionRows.length} posições, ${allocationRows.length} linhas de rateio, ${quoteRows.length} cotações.`,
  );
  if (warnings.length > 0) {
    console.info(`\nAvisos:\n- ${warnings.join("\n- ")}`);
  }
  console.info(`\nRespostas pendentes: ${pendingAnswers().join(", ") || "nenhuma"}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
