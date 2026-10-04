import { calendarDay, toDateKey } from "@/modules/quotes/domain/calendar";
import type { QuoteRequest, QuoteResult } from "@/modules/quotes/domain/quote-types";
import { quoteFailure } from "@/modules/quotes/domain/quote-types";
import { latestTreasuryPoint, parseTreasuryCsv, TREASURY_PROVIDER, treasurySeriesOf, type TreasuryBook } from "@/modules/quotes/domain/treasury";
import { describeProviderError, ProviderRefusalError, QuoteHttpError } from "@/modules/quotes/infrastructure/http";

// Recurso oficial de dados abertos do Tesouro Nacional. A API CKAN oficial
// publica esta URL. O antigo treasurybondsinfo.json retornou HTTP 410.
export const TREASURY_CSV_URL = "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv";
const CACHE_MS = 60 * 60 * 1000;

export type TreasuryBookLoader = () => Promise<TreasuryBook>;

/** Uma carga para catálogo, cotação e histórico; falhas não ficam no cache. */
export function createTreasurySource(loadText: () => Promise<string>, clock = Date.now): TreasuryBookLoader {
  let cached: { book: TreasuryBook; until: number } | null = null;
  let pending: Promise<TreasuryBook> | null = null;

  return async () => {
    if (cached && cached.until > clock()) return cached.book;
    if (pending) return pending;

    pending = loadText().then((text) => {
      const book = parseTreasuryCsv(text);
      cached = { book, until: clock() + CACHE_MS };
      return book;
    }).finally(() => { pending = null; });
    return pending;
  };
}

async function loadOfficialText() {
  const response = await fetch(TREASURY_CSV_URL, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new QuoteHttpError(response.status, `O Tesouro respondeu com HTTP ${response.status}.`);
  return response.text();
}

const globalForTreasury = globalThis as unknown as { treasuryBookLoader?: TreasuryBookLoader };
export const readTreasuryBook = (globalForTreasury.treasuryBookLoader ??= createTreasurySource(loadOfficialText));

/** PU de mercado observado até hoje, com a data oficial, sem cotações fictícias. */
export async function fetchTreasuryQuotes(
  requests: QuoteRequest[],
  { today = toDateKey(calendarDay(new Date())), loadBook = readTreasuryBook }: { today?: string; loadBook?: TreasuryBookLoader } = {},
): Promise<QuoteResult[]> {
  if (requests.length === 0) return [];

  let book: TreasuryBook;
  try {
    book = await loadBook();
  } catch (error) {
    const described = describeProviderError(error);
    return requests.map((request) => quoteFailure(request.symbol, TREASURY_PROVIDER, described.code, described.message));
  }

  return requests.map((request): QuoteResult => {
    const series = treasurySeriesOf(book, request);
    if (!series) return quoteFailure(request.symbol, TREASURY_PROVIDER, "NOT_FOUND", "O Tesouro não publicou preços para este título e vencimento.");
    if (series.maturityDate <= today) return quoteFailure(request.symbol, TREASURY_PROVIDER, "MATURED_TITLE", "Este título já venceu; confirme o valor recebido na liquidação.");
    const point = latestTreasuryPoint(series, today);
    if (!point) return quoteFailure(request.symbol, TREASURY_PROVIDER, "MISSING_QUOTE", "O Tesouro não tem preço deste título até a data pedida.");
    return { symbol: request.symbol, provider: TREASURY_PROVIDER, status: "SUCCESS", valueBrl: point.value, quoteDate: point.day };
  });
}

/** Cotação confiável para conferir a seleção do título ao cadastrar o ativo. */
export async function fetchTreasuryPrice(symbol: string, providerId?: string | null, today?: string) {
  const [result] = await fetchTreasuryQuotes([{ symbol, providerId: providerId ?? undefined, instrumentType: "TESOURO", baseCurrency: "BRL" }], { today });
  if (result.status === "FAILED") throw new ProviderRefusalError(result.errorCode, result.errorMessage);
  return { price: result.valueBrl, quoteDate: result.quoteDate! };
}
