import { monthEndPoints, type DayValue } from "@/modules/quotes/domain/history-backfill";

// Identidade e preços oficiais do Tesouro Direto (spec 061). O tipo e o dia
// exato do vencimento identificam o título; o ano sozinho não identifica.
export const TREASURY_INSTRUMENT_TYPE = "TESOURO";
export const TREASURY_PROVIDER = "tesouro";
export const TREASURY_SOURCE_URL = "https://www.tesourotransparente.gov.br/ckan/dataset/taxas-dos-titulos-ofertados-pelo-tesouro-direto";

export type TreasuryIdentity = {
  symbol: string;
  providerId: string;
  name: string;
  type: string;
  /** AAAA-MM-DD */
  maturityDate: string;
};

export type TreasurySeries = TreasuryIdentity & { points: DayValue[] };
export type TreasuryBook = { series: Map<string, TreasurySeries> };
export type TreasuryCatalogBond = TreasuryIdentity & { quoteDate: string; valueBrl: number };

export function treasurySymbol(type: string, maturityDate: string) {
  const slug = type.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `TD:${slug}:${maturityDate}`;
}

export function treasuryProviderId(type: string, maturityDate: string) {
  return `${type.trim()}|${maturityDate}`;
}

/** Recupera somente o título pedido; um identificador conflitante é recusado. */
export function treasurySeriesOf(book: TreasuryBook, target: { symbol: string; providerId?: string | null }) {
  const series = book.series.get(target.symbol);

  if (!series || (target.providerId && series.providerId !== target.providerId)) {
    return null;
  }

  return series;
}

export function latestTreasuryPoint(series: TreasurySeries, today: string) {
  // A série é ordenada. A fonte nunca deve introduzir um preço posterior à
  // data pedida, inclusive quando o teste ou a consulta usa uma data passada.
  return series.points.findLast((point) => point.day <= today);
}

/** Fechamentos observados; um buraco dentro da cobertura não vira sucesso. */
export function treasuryMonthEndPoints(series: TreasurySeries, months: string[], currentMonth: string) {
  if (months.length === 0) return new Map<string, DayValue>();
  const points = monthEndPoints(series.points, months[0], currentMonth);
  const firstMonth = series.points[0].day.slice(0, 7);
  const lastMonth = series.points.at(-1)!.day.slice(0, 7);
  const missing = months.filter((month) => month >= firstMonth && month <= lastMonth && !points.has(month));
  if (missing.length > 0) throw new Error(`O Tesouro não publicou preços nas competências ${missing.join(", ")}.`);
  return new Map([...points].filter(([month]) => months.includes(month)));
}

/** Títulos ainda não vencidos com um PU de mercado observado até a data pedida. */
export function getTreasuryCatalog(book: TreasuryBook, today: string): TreasuryCatalogBond[] {
  return [...book.series.values()].flatMap((series) => {
    const point = series.maturityDate > today ? latestTreasuryPoint(series, today) : null;

    if (!point) {
      return [];
    }

    const { points: _points, ...identity } = series;
    void _points;
    return [{ ...identity, quoteDate: point.day, valueBrl: point.value }];
  }).sort((left, right) =>
    typeRank(left.type) - typeRank(right.type) ||
    left.type.localeCompare(right.type, "pt-BR") ||
    left.maturityDate.localeCompare(right.maturityDate));
}

// Ordem da lista: os títulos mais procurados primeiro, como na vitrine do
// Tesouro Direto; os demais, em ordem alfabética depois deles.
const TYPE_ORDER = ["Tesouro Selic", "Tesouro Prefixado", "Tesouro IPCA+", "Tesouro Renda+", "Tesouro Educa+"];

function typeRank(type: string) {
  const index = TYPE_ORDER.findIndex((prefix) => type === prefix || type.startsWith(`${prefix} `));
  return index === -1 ? TYPE_ORDER.length : index;
}

/** Data financeira estrita: não aceita 31/02 normalizado para março. */
export function isTreasuryDay(day: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) &&
    new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
}

function officialDay(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  const day = match ? `${match[3]}-${match[2]}-${match[1]}` : "";

  if (!isTreasuryDay(day)) {
    throw new Error("O Tesouro retornou uma data inválida no arquivo de preços.");
  }

  return day;
}

function officialPrice(value: string) {
  const text = value.trim();

  if (!text) {
    return null;
  }

  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/.test(text)) {
    throw new Error("O Tesouro retornou um preço inválido no arquivo de preços.");
  }

  const price = Number(text.replace(/\./g, "").replace(",", "."));

  if (!Number.isFinite(price)) {
    throw new Error("O Tesouro retornou um preço inválido no arquivo de preços.");
  }

  // Zero/ausência de PU não são preço de mercado: não entram como cotação.
  return price > 0 ? price : null;
}

/** CSV com separador ';', BOM e campos entre aspas; sem guardar todas as linhas. */
function* csvRows(text: string) {
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && (char === ";" || char === "\n" || char === "\r")) {
      row.push(field);
      field = "";

      if (char !== ";") {
        if (char === "\r" && text[index + 1] === "\n") index += 1;
        if (row.some((entry) => entry.trim())) yield row;
        row = [];
      }
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error("O arquivo de preços do Tesouro tem um campo incompleto.");
  row.push(field);
  if (row.some((entry) => entry.trim())) yield row;
}

/**
 * Lê exclusivamente PU Base Manha: o metadado oficial o define como o PU D0
 * usado para marcar a mercado a posição. Compra/venda D+1 não o substituem.
 */
export function parseTreasuryCsv(text: string): TreasuryBook {
  const rows = csvRows(text.replace(/^\uFEFF/, ""));
  const header = rows.next().value;
  const required = ["Tipo Titulo", "Data Vencimento", "Data Base", "PU Base Manha"];

  if (!header || required.some((name) => !header.includes(name))) {
    throw new Error("O arquivo do Tesouro não contém as colunas de preço de mercado esperadas.");
  }

  const [typeColumn, maturityColumn, dayColumn, priceColumn] = required.map((name) => header.indexOf(name));
  const series = new Map<string, TreasurySeries>();

  for (const row of rows) {
    if (row.length !== header.length) throw new Error("O arquivo de preços do Tesouro tem uma linha incompleta.");
    const value = officialPrice(row[priceColumn]);
    if (value === null) continue;
    const type = row[typeColumn].trim();
    if (!type || type.includes("|")) throw new Error("O arquivo do Tesouro contém um tipo de título inválido.");
    const maturityDate = officialDay(row[maturityColumn]);
    const day = officialDay(row[dayColumn]);
    const symbol = treasurySymbol(type, maturityDate);
    let entry = series.get(symbol);

    if (entry && entry.type !== type) throw new Error("Dois títulos do Tesouro têm a mesma identificação.");
    if (!entry) {
      const dayLabel = `${maturityDate.slice(8, 10)}/${maturityDate.slice(5, 7)}/${maturityDate.slice(0, 4)}`;
      entry = { symbol, providerId: treasuryProviderId(type, maturityDate), name: `${type} · ${dayLabel}`, type, maturityDate, points: [] };
      series.set(symbol, entry);
    }

    entry.points.push({ day, value });
  }

  if (series.size === 0) throw new Error("O Tesouro não retornou preços de mercado válidos.");
  for (const entry of series.values()) {
    entry.points.sort((left, right) => left.day.localeCompare(right.day));
    for (let index = 1; index < entry.points.length; index += 1) {
      if (entry.points[index].day === entry.points[index - 1].day) {
        throw new Error("O Tesouro retornou mais de um preço para o mesmo título e dia.");
      }
    }
  }

  return { series };
}
