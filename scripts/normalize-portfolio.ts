import "dotenv/config";

import {
  PortfolioMonthStatus,
  Prisma,
} from "../src/generated/prisma/client";
import { getPrismaClient } from "../src/lib/prisma";

type SourceContent = Record<string, Prisma.JsonValue>;

type NormalizationSummary = {
  months: Set<string>;
  institutions: Set<string>;
  accounts: Set<string>;
  assets: Set<string>;
  positions: number;
  quotes: number;
  skippedPositions: number;
  skippedQuotes: number;
};

function asContent(value: Prisma.JsonValue): SourceContent | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as SourceContent;
  }

  return null;
}

function formulaResult(value: Prisma.JsonValue | undefined): Prisma.JsonValue | undefined {
  if (value && typeof value === "object" && !Array.isArray(value) && "result" in value) {
    return (value as SourceContent).result;
  }

  return value;
}

function readText(content: SourceContent, field: string) {
  const value = formulaResult(content[field]);
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g, " ").trim() : null;
}

function readNumber(content: SourceContent, field: string) {
  const value = formulaResult(content[field]);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readDate(content: SourceContent, field: string) {
  const value = readText(content, field);

  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function normalizeKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildAssetKey(name: string, ticker: string | null, institution: string) {
  const normalizedName = normalizeKey(name);

  return ticker
    ? `market:${normalizedName}:${ticker.toUpperCase()}`
    : `private:${normalizeKey(institution)}:${normalizedName}`;
}

function monthKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("DATABASE_URL não está configurada.");
  }

  const batch = await prisma.importBatch.findFirst({
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      sourceRows: {
        where: {
          sourceTable: {
            in: ["Table_Investimentos_Main", "Table_Cotacoes"],
          },
        },
        orderBy: [{ sourceTable: "asc" }, { sourceRow: "asc" }],
        select: {
          id: true,
          sourceTable: true,
          sourceRow: true,
          content: true,
        },
      },
    },
  });

  if (!batch) {
    throw new Error("Nenhum lote de importação foi encontrado.");
  }

  const summary: NormalizationSummary = {
    months: new Set(),
    institutions: new Set(),
    accounts: new Set(),
    assets: new Set(),
    positions: 0,
    quotes: 0,
    skippedPositions: 0,
    skippedQuotes: 0,
  };

  await prisma.$transaction(
    async (transaction) => {
      const institutionCache = new Map<string, string>();
      const accountCache = new Map<string, string>();
      const assetCache = new Map<string, string>();
      const monthCache = new Map<string, string>();
      const seenPositions = new Set<string>();

      await transaction.importIssue.deleteMany({
        where: {
          batchId: batch.id,
          code: "DUPLICATE_SOURCE_POSITION",
        },
      });

      for (const sourceRow of batch.sourceRows) {
        const content = asContent(sourceRow.content);

        if (!content) {
          continue;
        }

        if (sourceRow.sourceTable === "Table_Cotacoes") {
          const referenceDate = readDate(content, "Data");
          const symbol = readText(content, "Ticker")?.toUpperCase() ?? null;
          const instrumentType = readText(content, "Tipo");
          const baseCurrency = readText(content, "Moeda Base")?.toUpperCase() ?? null;
          const valueBrl = readNumber(content, "Valor");

          if (!referenceDate || !symbol || !instrumentType || !baseCurrency || valueBrl === null) {
            summary.skippedQuotes += 1;
            continue;
          }

          await transaction.marketQuote.upsert({
            where: { sourceRowId: sourceRow.id },
            create: {
              sourceRowId: sourceRow.id,
              referenceDate,
              symbol,
              instrumentType,
              baseCurrency,
              valueBrl: new Prisma.Decimal(valueBrl),
            },
            update: {
              referenceDate,
              symbol,
              instrumentType,
              baseCurrency,
              valueBrl: new Prisma.Decimal(valueBrl),
            },
          });
          summary.quotes += 1;
          continue;
        }

        const referenceDate = readDate(content, "Data");
        const name = readText(content, "Nome");
        const institutionName = readText(content, "Instituição");
        const quantity = readNumber(content, "Quantidade");
        const totalBrl = readNumber(content, "Total (R$)");

        if (!referenceDate || !name || !institutionName || quantity === null || totalBrl === null) {
          summary.skippedPositions += 1;
          continue;
        }

        const ticker = readText(content, "Ticker")?.toUpperCase() ?? null;
        const baseCurrency = readText(content, "Moeda Base")?.toUpperCase() ?? "BRL";
        const unitPriceBrl = readNumber(content, "Cotação Ativo");
        const exchangeRateBrl = readNumber(content, "Cotação Dolar");
        const strategy = readText(content, "Estratégia");
        const normalizedInstitution = normalizeKey(institutionName);
        const assetKey = buildAssetKey(name, ticker, institutionName);
        const referenceKey = monthKey(referenceDate);
        const uniquePositionKey = `${referenceKey}:${normalizedInstitution}:${assetKey}`;

        if (seenPositions.has(uniquePositionKey)) {
          await transaction.importIssue.create({
            data: {
              batchId: batch.id,
              severity: "WARNING",
              code: "DUPLICATE_SOURCE_POSITION",
              message:
                "A posição repete mês, instituição, ativo, quantidade e total de outra linha; " +
                "a duplicata foi preservada na origem e excluída do total normalizado.",
              sourceSheet: "Investimentos_Main",
              sourceTable: sourceRow.sourceTable,
              sourceRow: sourceRow.sourceRow,
              sourceField: "Nome",
              rawValue: {
                date: referenceKey,
                name,
                institution: institutionName,
                quantity,
                totalBrl,
              },
            },
          });
          summary.skippedPositions += 1;
          continue;
        }
        seenPositions.add(uniquePositionKey);

        let institutionId = institutionCache.get(normalizedInstitution);
        if (!institutionId) {
          const institution = await transaction.institution.upsert({
            where: { normalizedName: normalizedInstitution },
            create: { name: institutionName, normalizedName: normalizedInstitution },
            update: { name: institutionName },
            select: { id: true },
          });
          institutionId = institution.id;
          institutionCache.set(normalizedInstitution, institution.id);
        }
        summary.institutions.add(normalizedInstitution);

        let accountId = accountCache.get(institutionId);
        if (!accountId) {
          const account = await transaction.account.upsert({
            where: {
              institutionId_name: {
                institutionId,
                name: "Principal",
              },
            },
            create: {
              institutionId,
              name: "Principal",
            },
            update: {},
            select: { id: true },
          });
          accountId = account.id;
          accountCache.set(institutionId, account.id);
        }
        summary.accounts.add(accountId);

        let assetId = assetCache.get(assetKey);
        if (!assetId) {
          const asset = await transaction.asset.upsert({
            where: { normalizedKey: assetKey },
            create: {
              normalizedKey: assetKey,
              name,
              ticker,
              quoteSymbol: ticker,
              baseCurrency,
            },
            update: {
              name,
              ticker,
              quoteSymbol: ticker,
              baseCurrency,
            },
            select: { id: true },
          });
          assetId = asset.id;
          assetCache.set(assetKey, asset.id);
        }
        summary.assets.add(assetKey);

        let portfolioMonthId = monthCache.get(referenceKey);
        if (!portfolioMonthId) {
          const month = await transaction.portfolioMonth.upsert({
            where: { referenceDate },
            create: {
              referenceDate,
              sourceBatchId: batch.id,
              status: PortfolioMonthStatus.IMPORTED,
            },
            update: { sourceBatchId: batch.id },
            select: { id: true },
          });
          portfolioMonthId = month.id;
          monthCache.set(referenceKey, month.id);
        }
        summary.months.add(referenceKey);

        await transaction.position.upsert({
          where: { sourceRowId: sourceRow.id },
          create: {
            portfolioMonthId,
            accountId,
            assetId,
            sourceRowId: sourceRow.id,
            quantity: new Prisma.Decimal(quantity),
            unitPriceBrl: unitPriceBrl === null ? null : new Prisma.Decimal(unitPriceBrl),
            exchangeRateBrl:
              exchangeRateBrl === null ? null : new Prisma.Decimal(exchangeRateBrl),
            totalBrl: new Prisma.Decimal(totalBrl),
            strategy,
          },
          update: {
            portfolioMonthId,
            accountId,
            assetId,
            quantity: new Prisma.Decimal(quantity),
            unitPriceBrl: unitPriceBrl === null ? null : new Prisma.Decimal(unitPriceBrl),
            exchangeRateBrl:
              exchangeRateBrl === null ? null : new Prisma.Decimal(exchangeRateBrl),
            totalBrl: new Prisma.Decimal(totalBrl),
            strategy,
          },
        });
        summary.positions += 1;
      }
    },
    { maxWait: 10_000, timeout: 120_000 },
  );

  console.info(
    [
      "Normalização concluída.",
      `${summary.months.size} competências`,
      `${summary.institutions.size} instituições`,
      `${summary.accounts.size} contas`,
      `${summary.assets.size} ativos`,
      `${summary.positions} posições`,
      `${summary.quotes} cotações`,
      `${summary.skippedPositions} posições pendentes`,
      `${summary.skippedQuotes} cotações ignoradas`,
    ].join(" · "),
  );

  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Falha desconhecida.");
  process.exitCode = 1;
});
