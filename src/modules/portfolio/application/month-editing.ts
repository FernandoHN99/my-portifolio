import { createHash, randomUUID } from "node:crypto";

import { PortfolioMonthStatus, Prisma, QuoteUpdateStatus } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import {
  ASSET_KIND_DEFINITIONS,
  baseCurrencyOf,
  buildAssetKey,
  cleanName,
  duplicateAssetMessage,
  normalizeKey,
  normalizeTicker,
  providerForQuote,
  USD_SYMBOL,
  type AssetKind,
} from "@/modules/portfolio/domain/asset-kinds";
import { isRedemption } from "@/modules/portfolio/domain/redemption";
import { readVerifiedTicker } from "@/modules/quotes/application/check-ticker";
import { addMonths, currentReferenceMonth } from "@/modules/quotes/domain/calendar";
import { isQuoteEditable } from "@/modules/quotes/domain/quote-refresh";

type Transaction = Prisma.TransactionClient;

export class MonthEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MonthEditError";
  }
}

export type PositionUpdate = { positionId: string; value?: string; strategy?: string | null };
/** Conta nova, numa instituição existente ou também nova (spec 026). */
export type NewAccountInput = {
  institutionId: string | null;
  institutionName: string | null;
  name: string;
};
/** Ativo novo com o rateio inicial e a conferência do ticker (spec 026). */
export type NewAssetInput = {
  name: string;
  kind: AssetKind;
  ticker: string | null;
  maturityDate: string | null;
  allocation: { assetClass: string; subclass: string; duration: string };
  quoteCheckToken: string | null;
  manualPriceBrl: string | null;
};
export type PositionAddition = {
  accountId?: string;
  newAccount?: NewAccountInput;
  assetId?: string;
  newAsset?: NewAssetInput;
  value: string;
  strategy: string | null;
};
export type AllocationInput = {
  assetClass: string;
  subclass: string;
  duration: string;
  weightPercent: string;
};
export type QuoteInput = { symbol: string; valueBrl: string };

type SnapshotPosition = {
  id: string;
  accountId: string;
  assetId: string;
  sourceRowId: bigint | null;
  quantity: Prisma.Decimal;
  unitPriceBrl: Prisma.Decimal | null;
  exchangeRateBrl: Prisma.Decimal | null;
  totalBrl: Prisma.Decimal;
  strategy: string | null;
  allocations: {
    id: string;
    sourceRowId: bigint | null;
    assetClass: string;
    subclass: string;
    duration: string;
    weight: Prisma.Decimal;
  }[];
};

type SnapshotQuote = {
  id: string;
  sourceRowId: bigint | null;
  symbol: string;
  instrumentType: string;
  baseCurrency: string;
  valueBrl: Prisma.Decimal;
  quoteDate: Date | null;
  carriedFrom: Date | null;
};

type MonthSnapshot = { positions: SnapshotPosition[]; quotes: SnapshotQuote[] };

/**
 * Cadastros criados junto com uma inclusão. Ficam fora da fotografia da
 * competência, que só guarda posições e cotações do mês; o desfazer os remove
 * depois de restaurar o mês, desde que nada mais os use.
 */
type CreatedEntities = {
  institutionIds: string[];
  accountIds: string[];
  assetIds: string[];
  dailyQuoteIds: string[];
};

type UndoEntry =
  | {
      kind: "restore";
      monthId: string;
      snapshot: MonthSnapshot;
      fingerprint: string;
      expiresAt: number;
      created?: CreatedEntities;
    }
  | { kind: "delete-month"; monthId: string; fingerprint: string; expiresAt: number };

const UNDO_TTL_MS = 10 * 60 * 1000;
const MAX_STRATEGY_LENGTH = 60;
const MAX_LABEL_LENGTH = 80;
const MAX_ENTITY_NAME_LENGTH = 60;
const MAX_ASSET_NAME_LENGTH = 80;

const globalForUndo = globalThis as unknown as { monthUndoStore?: Map<string, UndoEntry> };
const undoStore = (globalForUndo.monthUndoStore ??= new Map<string, UndoEntry>());

export async function applyPositionChanges(input: {
  monthId: string;
  updates: PositionUpdate[];
  removals: string[];
  additions: PositionAddition[];
}) {
  if (input.updates.length + input.removals.length + input.additions.length === 0) {
    throw new MonthEditError("Não há alterações para salvar.");
  }

  return withUndo(input.monthId, async (transaction, month) => {
    const positions = await transaction.position.findMany({
      where: { portfolioMonthId: month.id },
      select: {
        id: true,
        accountId: true,
        assetId: true,
        unitPriceBrl: true,
        asset: { select: { quoteSymbol: true } },
      },
    });
    const byId = new Map(positions.map((position) => [position.id, position]));
    const removals = new Set(input.removals);
    const touched = new Set<string>();

    for (const positionId of removals) {
      if (!byId.has(positionId)) {
        throw new MonthEditError("Uma das posições removidas não pertence a esta competência.");
      }
    }

    for (const update of input.updates) {
      const position = byId.get(update.positionId);

      if (!position || removals.has(update.positionId) || touched.has(update.positionId)) {
        throw new MonthEditError("Uma das posições alteradas é inválida ou está repetida.");
      }
      touched.add(update.positionId);

      const data: Prisma.PositionUpdateInput = {};

      if (update.value !== undefined) {
        const value = parseNonNegative(update.value);

        if (position.asset.quoteSymbol) {
          if (!position.unitPriceBrl) {
            throw new MonthEditError("Uma posição cotada está sem preço e não pode ser recalculada.");
          }
          data.quantity = value;
          data.totalBrl = value.mul(position.unitPriceBrl).toDecimalPlaces(2);
        } else {
          const balance = value.toDecimalPlaces(2);
          data.quantity = balance;
          data.totalBrl = balance;
        }
      }

      if (update.strategy !== undefined) {
        data.strategy = normalizeStrategy(update.strategy);
      }

      await transaction.position.update({ where: { id: update.positionId }, data });
    }

    if (removals.size > 0) {
      await transaction.position.deleteMany({ where: { id: { in: [...removals] } } });
    }

    const occupied = new Set(
      positions
        .filter((position) => !removals.has(position.id))
        .map((position) => `${position.accountId}:${position.assetId}`),
    );
    const quotes = await transaction.marketQuote.findMany({
      where: { referenceDate: month.referenceDate },
      select: { symbol: true, valueBrl: true },
    });
    const quoteBySymbol = new Map(quotes.map((quote) => [quote.symbol, quote.valueBrl]));
    const usdRate = quoteBySymbol.get(USD_SYMBOL) ?? null;
    const batch: AdditionBatch = {
      month,
      isCurrentMonth: month.referenceDate.getTime() === currentReferenceMonth().getTime(),
      quoteBySymbol,
      institutions: new Map(),
      accounts: new Map(),
      assets: new Map(),
      created: { institutionIds: [], accountIds: [], assetIds: [], dailyQuoteIds: [] },
    };

    for (const addition of input.additions) {
      const account = await resolveAdditionAccount(transaction, addition, batch);
      const asset = await resolveAdditionAsset(transaction, addition, account, batch);
      const identity = `${account.id}:${asset.id}`;

      if (occupied.has(identity)) {
        throw new MonthEditError("Este ativo já possui posição nesta conta e competência.");
      }
      occupied.add(identity);

      const value = parseNonNegative(addition.value);
      let unitPriceBrl: Prisma.Decimal | null = null;
      let quantity = value.toDecimalPlaces(2);
      let totalBrl = quantity;

      if (asset.quoteSymbol) {
        const price = quoteBySymbol.get(asset.quoteSymbol);

        if (!price) {
          throw new MonthEditError(
            `Não há cotação de ${asset.quoteSymbol} nesta competência. Informe-a na página de cotações.`,
          );
        }
        unitPriceBrl = price;
        quantity = value;
        totalBrl = value.mul(price).toDecimalPlaces(2);
      }

      const created = await transaction.position.create({
        data: {
          portfolioMonthId: month.id,
          accountId: account.id,
          assetId: asset.id,
          quantity,
          unitPriceBrl,
          exchangeRateBrl: asset.quoteSymbol ? usdRate : null,
          totalBrl,
          strategy: normalizeStrategy(addition.strategy),
        },
        select: { id: true },
      });

      // Um ativo novo recebe o rateio escolhido no diálogo; um existente herda o
      // da posição mais recente do mesmo ativo, como antes.
      if (asset.allocation) {
        await transaction.positionAllocation.create({
          data: { ...asset.allocation, weight: new Prisma.Decimal(1), positionId: created.id },
        });
        continue;
      }

      const template = await transaction.position.findFirst({
        where: { assetId: asset.id, id: { not: created.id }, allocations: { some: {} } },
        orderBy: { portfolioMonth: { referenceDate: "desc" } },
        select: { allocations: { select: { assetClass: true, subclass: true, duration: true, weight: true } } },
      });

      if (template) {
        await transaction.positionAllocation.createMany({
          data: template.allocations.map((allocation) => ({ ...allocation, positionId: created.id })),
        });
      }
    }

    return hasCreated(batch.created) ? { created: batch.created } : undefined;
  });
}

type AdditionBatch = {
  month: { id: string; referenceDate: Date };
  isCurrentMonth: boolean;
  quoteBySymbol: Map<string, Prisma.Decimal>;
  // Cadastros criados neste salvamento, pela chave normalizada: duas posições
  // novas na mesma instituição nova criam a instituição uma vez só.
  institutions: Map<string, { id: string; name: string }>;
  accounts: Map<string, string>;
  assets: Map<string, { id: string; signature: string; quoteSymbol: string | null; allocation: AllocationSeed }>;
  created: CreatedEntities;
};

type AllocationSeed = { assetClass: string; subclass: string; duration: string };

async function resolveAdditionAccount(
  transaction: Transaction,
  addition: PositionAddition,
  batch: AdditionBatch,
): Promise<{ id: string; institutionName: string }> {
  if (addition.accountId) {
    const account = await transaction.account.findUnique({
      where: { id: addition.accountId },
      select: { id: true, institution: { select: { name: true } } },
    });

    if (!account) {
      throw new MonthEditError("A conta escolhida não existe.");
    }

    return { id: account.id, institutionName: account.institution.name };
  }

  const input = addition.newAccount;

  if (!input) {
    throw new MonthEditError("Escolha a conta da posição.");
  }

  const institution = await resolveInstitution(transaction, input, batch);
  const name = requireName(input.name, MAX_ENTITY_NAME_LENGTH, "o nome da conta");
  const key = `${institution.id}:${normalizeKey(name)}`;
  const reused = batch.accounts.get(key);

  if (reused) {
    return { id: reused, institutionName: institution.name };
  }

  const siblings = await transaction.account.findMany({
    where: { institutionId: institution.id },
    select: { name: true },
  });
  const duplicate = siblings.find((account) => normalizeKey(account.name) === normalizeKey(name));

  if (duplicate) {
    throw new MonthEditError(`A conta "${duplicate.name}" já existe em ${institution.name}. Escolha-a na lista.`);
  }

  const account = await transaction.account.create({
    data: { institutionId: institution.id, name },
    select: { id: true },
  });
  batch.accounts.set(key, account.id);
  batch.created.accountIds.push(account.id);

  return { id: account.id, institutionName: institution.name };
}

async function resolveInstitution(transaction: Transaction, input: NewAccountInput, batch: AdditionBatch) {
  if (input.institutionId) {
    const institution = await transaction.institution.findUnique({
      where: { id: input.institutionId },
      select: { id: true, name: true },
    });

    if (!institution) {
      throw new MonthEditError("A instituição escolhida não existe.");
    }

    return institution;
  }

  const name = requireName(input.institutionName ?? "", MAX_ENTITY_NAME_LENGTH, "o nome da instituição");
  const normalizedName = normalizeKey(name);
  const reused = batch.institutions.get(normalizedName);

  if (reused) {
    return reused;
  }

  const existing = await transaction.institution.findUnique({
    where: { normalizedName },
    select: { name: true },
  });

  if (existing) {
    throw new MonthEditError(`A instituição "${existing.name}" já existe. Escolha-a na lista.`);
  }

  const institution = await transaction.institution.create({
    data: { name, normalizedName },
    select: { id: true, name: true },
  });
  batch.institutions.set(normalizedName, institution);
  batch.created.institutionIds.push(institution.id);

  return institution;
}

async function resolveAdditionAsset(
  transaction: Transaction,
  addition: PositionAddition,
  account: { institutionName: string },
  batch: AdditionBatch,
): Promise<{ id: string; quoteSymbol: string | null; allocation: AllocationSeed | null }> {
  if (addition.assetId) {
    const asset = await transaction.asset.findUnique({
      where: { id: addition.assetId },
      select: { id: true, quoteSymbol: true },
    });

    if (!asset) {
      throw new MonthEditError("O ativo escolhido não existe.");
    }

    return { ...asset, allocation: null };
  }

  const input = addition.newAsset;

  if (!input) {
    throw new MonthEditError("Escolha o ativo da posição.");
  }

  const definition = ASSET_KIND_DEFINITIONS[input.kind];
  const name = requireName(input.name, MAX_ASSET_NAME_LENGTH, "o nome do ativo");
  const symbol = definition.ticker === null ? null : normalizeTicker(input.kind, input.ticker ?? "");

  if (definition.ticker !== null && !symbol) {
    throw new MonthEditError(`Informe um ticker válido para ${name}.`);
  }

  const maturityDate = parseMaturityDate(input.maturityDate);

  if (maturityDate && !definition.allowsMaturity) {
    throw new MonthEditError("Só ativos sem ticker de mercado têm vencimento.");
  }

  const allocation: AllocationSeed = {
    assetClass: normalizeLabel(input.allocation.assetClass, "classe"),
    subclass: normalizeLabel(input.allocation.subclass, "subclasse"),
    duration: normalizeLabel(input.allocation.duration, "resgate"),
  };
  await assertAllocationRules(transaction, [allocation]);
  const maturityKey = maturityDate ? maturityDate.toISOString().slice(0, 10) : null;
  const normalizedKey = buildAssetKey({
    name,
    ticker: symbol,
    institutionName: account.institutionName,
    maturityDate: maturityKey,
  });
  const signature = JSON.stringify([input.kind, symbol, maturityKey, allocation]);
  const reused = batch.assets.get(normalizedKey);

  if (reused) {
    if (reused.signature !== signature) {
      throw new MonthEditError(`Duas posições novas criam o ativo ${name} com dados diferentes.`);
    }

    return { id: reused.id, quoteSymbol: reused.quoteSymbol, allocation: reused.allocation };
  }

  const existing = await transaction.asset.findUnique({ where: { normalizedKey }, select: { name: true } });

  if (existing) {
    throw new MonthEditError(
      duplicateAssetMessage({ name: existing.name, kind: input.kind, symbol, maturityDate: maturityKey }),
    );
  }

  const verifiedCoinId = symbol ? await ensureMonthQuote(transaction, input, symbol, batch) : null;
  // A moeda da CoinGecko fica no ativo para a atualização de cotações não
  // buscar outra moeda com o mesmo símbolo. Um símbolo que outro ativo já cota
  // mantém a moeda dele.
  const quoteProviderId =
    symbol && definition.provider === "coingecko"
      ? ((
          await transaction.asset.findFirst({
            where: { quoteSymbol: symbol, quoteProviderId: { not: null } },
            orderBy: { createdAt: "asc" },
            select: { quoteProviderId: true },
          })
        )?.quoteProviderId ?? verifiedCoinId)
      : null;

  const asset = await transaction.asset.create({
    data: {
      normalizedKey,
      name,
      ticker: symbol,
      quoteSymbol: symbol,
      baseCurrency: baseCurrencyOf(input.kind, symbol),
      maturityDate,
      quoteProviderId,
    },
    select: { id: true },
  });
  batch.assets.set(normalizedKey, { id: asset.id, signature, quoteSymbol: symbol, allocation });
  batch.created.assetIds.push(asset.id);

  return { id: asset.id, quoteSymbol: symbol, allocation };
}

/**
 * Garante a cotação do mês para o símbolo de um ativo novo. Um símbolo já
 * cotado na competência usa a cotação existente. Os demais exigem a conferência
 * do ticker: com o ticker encontrado e a competência do mês corrente, vale a
 * cotação de hoje, também gravada no histórico diário; com o provedor
 * indisponível ou numa competência passada, vale a cotação digitada. Devolve a
 * moeda da CoinGecko conferida, quando houver.
 */
async function ensureMonthQuote(
  transaction: Transaction,
  input: NewAssetInput,
  symbol: string,
  batch: AdditionBatch,
): Promise<string | null> {
  const definition = ASSET_KIND_DEFINITIONS[input.kind];
  const instrumentType = definition.instrumentType ?? "FIAT";
  const baseCurrency = baseCurrencyOf(input.kind, symbol);
  const provider = providerForQuote(instrumentType, baseCurrency);
  const stored =
    (await transaction.marketQuote.findFirst({
      where: { symbol },
      orderBy: { referenceDate: "desc" },
      select: { instrumentType: true, baseCurrency: true },
    })) ??
    (await transaction.dailyQuote.findFirst({
      where: { symbol },
      orderBy: { quoteDate: "desc" },
      select: { instrumentType: true, baseCurrency: true },
    }));

  if (definition.ticker === "market" && stored && providerForQuote(stored.instrumentType, stored.baseCurrency) !== provider) {
    throw new MonthEditError(`${symbol} já é cotado na carteira por outro provedor. Escolha o tipo correspondente.`);
  }

  if (batch.quoteBySymbol.has(symbol)) {
    return null;
  }

  if (definition.ticker !== "market") {
    throw new MonthEditError(`Não há cotação de ${symbol} nesta competência. Informe-a na página de cotações.`);
  }

  const verified = input.quoteCheckToken ? readVerifiedTicker(input.quoteCheckToken) : null;

  if (!verified || verified.symbol !== symbol || verified.kind !== input.kind) {
    throw new MonthEditError(`A conferência do ticker ${symbol} expirou. Inclua a posição de novo para conferir.`);
  }

  const useFetched = verified.status === "found" && verified.priceBrl !== null && batch.isCurrentMonth;
  let valueBrl: Prisma.Decimal;

  if (useFetched) {
    valueBrl = new Prisma.Decimal(verified.priceBrl!).toDecimalPlaces(8);
  } else {
    if (!input.manualPriceBrl) {
      throw new MonthEditError(`Informe a cotação de ${symbol} em reais.`);
    }
    valueBrl = parsePositive(input.manualPriceBrl, 8);
  }

  await transaction.marketQuote.create({
    data: {
      referenceDate: batch.month.referenceDate,
      symbol,
      instrumentType,
      baseCurrency,
      valueBrl,
      // A cotação de hoje carrega o dia; a digitada é um fato do mês, como na
      // edição à mão da página de cotações.
      quoteDate: useFetched ? verified.quoteDate : null,
    },
  });
  batch.quoteBySymbol.set(symbol, valueBrl);

  if (verified.status === "found" && verified.priceBrl !== null) {
    const daily = await transaction.dailyQuote.findUnique({
      where: { symbol_quoteDate: { symbol, quoteDate: verified.quoteDate } },
      select: { id: true },
    });

    if (!daily) {
      const created = await transaction.dailyQuote.create({
        data: {
          symbol,
          quoteDate: verified.quoteDate,
          instrumentType,
          baseCurrency,
          valueBrl: new Prisma.Decimal(verified.priceBrl).toDecimalPlaces(8),
          provider: verified.provider,
          fetchedAt: verified.fetchedAt,
        },
        select: { id: true },
      });
      batch.created.dailyQuoteIds.push(created.id);
    }
  }

  return verified.coinId;
}

function hasCreated(created: CreatedEntities) {
  return (
    created.institutionIds.length +
      created.accountIds.length +
      created.assetIds.length +
      created.dailyQuoteIds.length >
    0
  );
}

/**
 * Remove, no desfazer, os cadastros criados por uma inclusão que ficaram sem
 * uso depois de restaurar a competência. Um cadastro usado em outro lugar
 * nesse meio-tempo é mantido.
 */
async function removeUnusedCreated(transaction: Transaction, created: CreatedEntities) {
  if (created.assetIds.length > 0) {
    await transaction.asset.deleteMany({ where: { id: { in: created.assetIds }, positions: { none: {} } } });
  }

  if (created.dailyQuoteIds.length > 0) {
    const daily = await transaction.dailyQuote.findMany({
      where: { id: { in: created.dailyQuoteIds } },
      select: { id: true, symbol: true },
    });
    const inUse = new Set(
      (
        await transaction.asset.findMany({
          where: { quoteSymbol: { in: daily.map((entry) => entry.symbol) } },
          select: { quoteSymbol: true },
        })
      ).map((asset) => asset.quoteSymbol),
    );
    const removable = daily.filter((entry) => !inUse.has(entry.symbol)).map((entry) => entry.id);

    if (removable.length > 0) {
      await transaction.dailyQuote.deleteMany({ where: { id: { in: removable } } });
    }
  }

  if (created.accountIds.length > 0) {
    await transaction.account.deleteMany({ where: { id: { in: created.accountIds }, positions: { none: {} } } });
  }

  if (created.institutionIds.length > 0) {
    await transaction.institution.deleteMany({
      where: { id: { in: created.institutionIds }, accounts: { none: {} } },
    });
  }
}

export async function replaceAllocations(input: {
  monthId: string;
  positionId: string;
  allocations: AllocationInput[];
}) {
  const parsed = input.allocations.map((allocation) => ({
    assetClass: normalizeLabel(allocation.assetClass, "classe"),
    subclass: normalizeLabel(allocation.subclass, "subclasse"),
    duration: normalizeLabel(allocation.duration, "resgate"),
    weight: parsePositive(allocation.weightPercent, 8).div(100),
  }));

  if (parsed.length === 0) {
    throw new MonthEditError("Informe ao menos uma classificação.");
  }

  const identities = new Set(parsed.map((entry) => `${entry.assetClass}|${entry.subclass}|${entry.duration}`));
  if (identities.size !== parsed.length) {
    throw new MonthEditError("Há classificações repetidas com a mesma classe, subclasse e resgate.");
  }

  const sum = parsed.reduce((total, entry) => total.plus(entry.weight), new Prisma.Decimal(0));
  if (sum.minus(1).abs().greaterThan("0.0001")) {
    throw new MonthEditError(`Os pesos somam ${sum.mul(100).toFixed(2)}%. A soma precisa ser 100%.`);
  }

  if (parsed.some((entry) => entry.weight.greaterThan(1))) {
    throw new MonthEditError("Nenhum peso pode ultrapassar 100%.");
  }

  return withUndo(input.monthId, async (transaction, month) => {
    const position = await transaction.position.findFirst({
      where: { id: input.positionId, portfolioMonthId: month.id },
      select: { id: true },
    });

    if (!position) {
      throw new MonthEditError("A posição não pertence a esta competência.");
    }

    // Um prazo antigo, como D+0, só continua se a posição já o tinha.
    const current = await transaction.positionAllocation.findMany({
      where: { positionId: position.id },
      select: { duration: true },
    });
    await assertAllocationRules(transaction, parsed, new Set(current.map((entry) => entry.duration)));

    await transaction.positionAllocation.deleteMany({ where: { positionId: position.id } });
    await transaction.positionAllocation.createMany({
      data: parsed.map((entry) => ({ ...entry, positionId: position.id })),
    });
  });
}

export async function updateMonthQuotes(input: {
  monthId: string;
  quotes: QuoteInput[];
}) {
  const parsed = input.quotes.map((quote) => ({
    symbol: quote.symbol.trim(),
    valueBrl: parsePositive(quote.valueBrl, 8),
  }));

  if (parsed.length === 0) {
    throw new MonthEditError("Não há cotações para salvar.");
  }

  if (new Set(parsed.map((quote) => quote.symbol)).size !== parsed.length) {
    throw new MonthEditError("Há cotações repetidas.");
  }

  return withUndo(input.monthId, async (transaction, month) => {
    await assertQuotesEditable(
      transaction,
      month.referenceDate,
      parsed.map((quote) => quote.symbol),
    );

    for (const quote of parsed) {
      const existing = await transaction.marketQuote.findUnique({
        where: { referenceDate_symbol: { referenceDate: month.referenceDate, symbol: quote.symbol } },
        select: { id: true },
      });

      if (existing) {
        // O valor digitado é do próprio mês: deixa de ser repetido e perde o
        // dia da cotação diária que carregava.
        await transaction.marketQuote.update({
          where: { id: existing.id },
          data: { valueBrl: quote.valueBrl, quoteDate: null, carriedFrom: null },
        });
      } else {
        const reference = await transaction.marketQuote.findFirst({
          where: { symbol: quote.symbol },
          orderBy: { referenceDate: "desc" },
          select: { instrumentType: true, baseCurrency: true },
        });

        if (!reference) {
          throw new MonthEditError(`Não há histórico de ${quote.symbol} para identificar o tipo de cotação.`);
        }

        await transaction.marketQuote.create({
          data: {
            referenceDate: month.referenceDate,
            symbol: quote.symbol,
            instrumentType: reference.instrumentType,
            baseCurrency: reference.baseCurrency,
            valueBrl: quote.valueBrl,
          },
        });
      }

      const positions = await transaction.position.findMany({
        where: { portfolioMonthId: month.id, asset: { quoteSymbol: quote.symbol } },
        select: { id: true, quantity: true },
      });

      for (const position of positions) {
        await transaction.position.update({
          where: { id: position.id },
          data: {
            unitPriceBrl: quote.valueBrl,
            totalBrl: position.quantity.mul(quote.valueBrl).toDecimalPlaces(2),
          },
        });
      }

      if (quote.symbol === "USD") {
        await transaction.position.updateMany({
          where: { portfolioMonthId: month.id, exchangeRateBrl: { not: null } },
          data: { exchangeRateBrl: quote.valueBrl },
        });
      }
    }
  });
}

export async function cloneLatestMonth() {
  const prisma = requirePrisma();

  return prisma.$transaction(
    async (transaction) => {
      const latest = await transaction.portfolioMonth.findFirst({
        orderBy: { referenceDate: "desc" },
        select: {
          id: true,
          referenceDate: true,
          positions: {
            select: {
              accountId: true,
              assetId: true,
              quantity: true,
              unitPriceBrl: true,
              exchangeRateBrl: true,
              totalBrl: true,
              strategy: true,
              allocations: {
                select: { assetClass: true, subclass: true, duration: true, weight: true },
              },
            },
          },
        },
      });

      if (!latest || latest.positions.length === 0) {
        throw new MonthEditError("Não existe competência com posições para clonar.");
      }

      const target = nextMonth(latest.referenceDate);

      if (target.getTime() > currentReferenceMonth().getTime()) {
        throw new MonthEditError("A competência mais recente já é a do mês corrente.");
      }

      const month = await transaction.portfolioMonth.create({
        data: { referenceDate: target, status: PortfolioMonthStatus.DRAFT },
        select: { id: true },
      });

      for (const position of latest.positions) {
        const { allocations, ...fields } = position;
        const created = await transaction.position.create({
          data: { ...fields, portfolioMonthId: month.id },
          select: { id: true },
        });

        if (allocations.length > 0) {
          await transaction.positionAllocation.createMany({
            data: allocations.map((allocation) => ({ ...allocation, positionId: created.id })),
          });
        }
      }

      const quotes = await transaction.marketQuote.findMany({
        where: { referenceDate: latest.referenceDate },
        select: {
          symbol: true,
          instrumentType: true,
          baseCurrency: true,
          valueBrl: true,
          quoteDate: true,
          carriedFrom: true,
        },
      });

      // As cotações copiadas ficam marcadas como repetidas, como na virada
      // automática de mês (spec 021).
      if (quotes.length > 0) {
        await transaction.marketQuote.createMany({
          data: quotes.map((quote) => ({
            ...quote,
            referenceDate: target,
            carriedFrom: quote.carriedFrom ?? latest.referenceDate,
          })),
        });
      }

      const after = await readSnapshot(transaction, { id: month.id, referenceDate: target });
      const token = storeUndo({
        kind: "delete-month",
        monthId: month.id,
        fingerprint: fingerprint(after),
        expiresAt: Date.now() + UNDO_TTL_MS,
      });

      return { monthId: month.id, referenceDate: target, undoToken: token };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

export async function undoChange(token: string) {
  const entry = undoStore.get(token);
  undoStore.delete(token);

  if (!entry || entry.expiresAt < Date.now()) {
    throw new MonthEditError("Não é mais possível desfazer esta alteração.");
  }

  const prisma = requirePrisma();

  return prisma.$transaction(
    async (transaction) => {
      const month = await transaction.portfolioMonth.findUnique({
        where: { id: entry.monthId },
        select: { id: true, referenceDate: true, targetUpdate: { select: { id: true } } },
      });

      if (!month) {
        throw new MonthEditError("A competência não existe mais.");
      }

      const current = await readSnapshot(transaction, month);

      if (fingerprint(current) !== entry.fingerprint) {
        throw new MonthEditError(
          "A competência mudou depois desta alteração. Desfazer agora sobrescreveria mudanças posteriores.",
        );
      }

      if (entry.kind === "delete-month") {
        if (month.targetUpdate) {
          throw new MonthEditError("A competência já passou por atualização de cotações.");
        }

        await transaction.marketQuote.deleteMany({ where: { referenceDate: month.referenceDate } });
        await transaction.portfolioMonth.delete({ where: { id: month.id } });
        return { referenceDate: month.referenceDate, deleted: true };
      }

      await restoreSnapshot(transaction, month, entry.snapshot);

      if (entry.created) {
        await removeUnusedCreated(transaction, entry.created);
      }

      return { referenceDate: month.referenceDate, deleted: false };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

/**
 * Regras do rateio (spec 035): a classe precisa ser uma das já cadastradas,
 * nos rateios ou nas metas; a subclasse aceita valores novos; o resgate é
 * Curto, Médio, Longo ou Nenhum, além de um prazo antigo que a posição já tinha.
 */
async function assertAllocationRules(
  transaction: Transaction,
  allocations: { assetClass: string; duration: string }[],
  legacyRedemptions: Set<string> = new Set(),
) {
  const classes = [...new Set(allocations.map((entry) => entry.assetClass))];
  const [used, targeted] = await Promise.all([
    transaction.positionAllocation.findMany({
      where: { assetClass: { in: classes } },
      distinct: ["assetClass"],
      select: { assetClass: true },
    }),
    transaction.allocationTarget.findMany({
      where: { scope: "ASSET_CLASS", primaryLabel: { in: classes } },
      select: { primaryLabel: true },
    }),
  ]);
  const known = new Set([...used.map((entry) => entry.assetClass), ...targeted.map((entry) => entry.primaryLabel)]);
  const unknown = classes.filter((assetClass) => !known.has(assetClass));

  if (unknown.length > 0) {
    throw new MonthEditError(`A classe ${unknown.join(", ")} não existe. Escolha uma das classes cadastradas.`);
  }

  const invalid = allocations.find((entry) => !isRedemption(entry.duration) && !legacyRedemptions.has(entry.duration));

  if (invalid) {
    throw new MonthEditError(`Resgate inválido: ${invalid.duration}. Use Curto, Médio, Longo ou Nenhum.`);
  }
}

/**
 * Abre ou fecha um mês (spec 034). Aberto é rascunho e aceita edição; fechado
 * trava posições, rateio e cotações à mão até ser aberto de novo. A
 * atualização automática continua reprecificando o mês corrente fechado.
 */
export async function setMonthOpen({ monthId, open }: { monthId: string; open: boolean }) {
  const prisma = requirePrisma();
  const month = await prisma.portfolioMonth.findUnique({ where: { id: monthId }, select: { id: true, status: true } });

  if (!month) {
    throw new MonthEditError("Esta competência não existe.");
  }

  const isOpen = month.status === PortfolioMonthStatus.DRAFT;

  if (isOpen === open) {
    throw new MonthEditError(open ? "Este mês já está aberto." : "Este mês já está fechado.");
  }

  await prisma.portfolioMonth.update({
    where: { id: month.id },
    data: { status: open ? PortfolioMonthStatus.DRAFT : PortfolioMonthStatus.REVIEWED },
  });
}

/**
 * A edição à mão vale só para cotações não encontradas ou com falha na última
 * busca do mês (spec 028); as demais vêm dos provedores.
 */
async function assertQuotesEditable(transaction: Transaction, referenceDate: Date, symbols: string[]) {
  const [quotes, lastResults] = await Promise.all([
    transaction.marketQuote.findMany({
      where: { referenceDate, symbol: { in: symbols } },
      select: { symbol: true, carriedFrom: true },
    }),
    transaction.quoteRefreshResult.findMany({
      where: {
        symbol: { in: symbols },
        run: { quoteDate: { gte: referenceDate, lt: addMonths(referenceDate, 1) } },
      },
      orderBy: [{ fetchedAt: "desc" }, { id: "desc" }],
      distinct: ["symbol"],
      select: { symbol: true, status: true },
    }),
  ]);
  const quoteBySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const failed = new Set(
    lastResults.filter((result) => result.status === QuoteUpdateStatus.FAILED).map((result) => result.symbol),
  );
  const locked = symbols.filter((symbol) => {
    const quote = quoteBySymbol.get(symbol);
    return !isQuoteEditable({ hasValue: quote !== undefined, carried: Boolean(quote?.carriedFrom), lastFailed: failed.has(symbol) });
  });

  if (locked.length > 0) {
    throw new MonthEditError(
      `${locked.join(", ")} ${locked.length === 1 ? "vem" : "vêm"} da atualização automática e não ${
        locked.length === 1 ? "pode" : "podem"
      } ser ${locked.length === 1 ? "editada" : "editadas"}.`,
    );
  }
}

async function withUndo(
  monthId: string,
  mutate: (
    transaction: Transaction,
    month: { id: string; referenceDate: Date },
  ) => Promise<{ created?: CreatedEntities } | void>,
) {
  const prisma = requirePrisma();

  try {
    return await prisma.$transaction(
      async (transaction) => {
        const month = await assertEditable(transaction, monthId);
        const before = await readSnapshot(transaction, month);
        const extras = await mutate(transaction, month);
        const after = await readSnapshot(transaction, month);
        const undoToken = storeUndo({
          kind: "restore",
          monthId: month.id,
          snapshot: before,
          fingerprint: fingerprint(after),
          expiresAt: Date.now() + UNDO_TTL_MS,
          created: extras?.created,
        });

        return { referenceDate: month.referenceDate, undoToken };
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
  } catch (error) {
    if (error instanceof MonthEditError) {
      throw error;
    }

    throw new MonthEditError("Não foi possível salvar. Nenhuma alteração foi aplicada.");
  }
}

async function assertEditable(transaction: Transaction, monthId: string) {
  const month = await transaction.portfolioMonth.findUnique({
    where: { id: monthId },
    select: { id: true, referenceDate: true, status: true },
  });

  if (!month) {
    throw new MonthEditError("Esta competência não existe.");
  }

  // Só um mês aberto (rascunho) aceita edição (spec 034); para editar um mês
  // fechado, o usuário o abre antes pela linha do tempo.
  if (month.status !== PortfolioMonthStatus.DRAFT) {
    throw new MonthEditError("Este mês está fechado. Abra o mês na linha do tempo para editar.");
  }

  return { id: month.id, referenceDate: month.referenceDate };
}

async function readSnapshot(
  transaction: Transaction,
  month: { id: string; referenceDate: Date },
): Promise<MonthSnapshot> {
  const [positions, quotes] = await Promise.all([
    transaction.position.findMany({
      where: { portfolioMonthId: month.id },
      orderBy: { id: "asc" },
      select: {
        id: true,
        accountId: true,
        assetId: true,
        sourceRowId: true,
        quantity: true,
        unitPriceBrl: true,
        exchangeRateBrl: true,
        totalBrl: true,
        strategy: true,
        allocations: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            sourceRowId: true,
            assetClass: true,
            subclass: true,
            duration: true,
            weight: true,
          },
        },
      },
    }),
    transaction.marketQuote.findMany({
      where: { referenceDate: month.referenceDate },
      orderBy: { symbol: "asc" },
      select: {
        id: true,
        sourceRowId: true,
        symbol: true,
        instrumentType: true,
        baseCurrency: true,
        valueBrl: true,
        quoteDate: true,
        carriedFrom: true,
      },
    }),
  ]);

  return { positions, quotes };
}

async function restoreSnapshot(
  transaction: Transaction,
  month: { id: string; referenceDate: Date },
  snapshot: MonthSnapshot,
) {
  const keepPositionIds = snapshot.positions.map((position) => position.id);
  await transaction.position.deleteMany({
    where: { portfolioMonthId: month.id, id: { notIn: keepPositionIds } },
  });

  for (const { allocations, ...position } of snapshot.positions) {
    await transaction.position.upsert({
      where: { id: position.id },
      create: { ...position, portfolioMonthId: month.id },
      update: {
        quantity: position.quantity,
        unitPriceBrl: position.unitPriceBrl,
        exchangeRateBrl: position.exchangeRateBrl,
        totalBrl: position.totalBrl,
        strategy: position.strategy,
      },
    });
    await transaction.positionAllocation.deleteMany({ where: { positionId: position.id } });

    if (allocations.length > 0) {
      await transaction.positionAllocation.createMany({
        data: allocations.map((allocation) => ({ ...allocation, positionId: position.id })),
      });
    }
  }

  const keepQuoteIds = snapshot.quotes.map((quote) => quote.id);
  await transaction.marketQuote.deleteMany({
    where: { referenceDate: month.referenceDate, id: { notIn: keepQuoteIds } },
  });

  for (const quote of snapshot.quotes) {
    await transaction.marketQuote.upsert({
      where: { id: quote.id },
      create: { ...quote, referenceDate: month.referenceDate },
      update: { valueBrl: quote.valueBrl, quoteDate: quote.quoteDate, carriedFrom: quote.carriedFrom },
    });
  }
}

function fingerprint(snapshot: MonthSnapshot) {
  return createHash("sha256")
    .update(
      JSON.stringify(snapshot, (_key, value: unknown) =>
        typeof value === "bigint" ? value.toString() : value instanceof Prisma.Decimal ? value.toString() : value,
      ),
    )
    .digest("hex");
}

function storeUndo(entry: UndoEntry) {
  const now = Date.now();

  for (const [key, value] of undoStore) {
    if (value.expiresAt < now) {
      undoStore.delete(key);
    }
  }

  const token = randomUUID();
  undoStore.set(token, entry);
  return token;
}

function requirePrisma() {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new MonthEditError("O banco de dados não está disponível.");
  }

  return prisma;
}

function nextMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function normalizeStrategy(value: string | null) {
  const trimmed = value?.trim() ?? "";

  if (trimmed.length > MAX_STRATEGY_LENGTH) {
    throw new MonthEditError("A estratégia informada é longa demais.");
  }

  return trimmed === "" ? null : trimmed;
}

function requireName(value: string, maxLength: number, field: string) {
  const name = cleanName(value);

  if (!name || name.length > maxLength || !normalizeKey(name)) {
    throw new MonthEditError(`Informe ${field} com até ${maxLength} caracteres.`);
  }

  return name;
}

function parseMaturityDate(value: string | null) {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;

  if (!date || date.toISOString().slice(0, 10) !== value || date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2100) {
    throw new MonthEditError("Informe um vencimento válido.");
  }

  return date;
}

function normalizeLabel(value: string, field: string) {
  const trimmed = value.trim();

  if (!trimmed || trimmed.length > MAX_LABEL_LENGTH) {
    throw new MonthEditError(`Informe uma ${field} válida em cada classificação.`);
  }

  return trimmed;
}

function parseNonNegative(raw: string) {
  const value = parseDecimal(raw);

  if (!value || value.isNegative()) {
    throw new MonthEditError("Use apenas valores numéricos maiores ou iguais a zero.");
  }

  if (value.decimalPlaces() > 12 || value.precision() > 30) {
    throw new MonthEditError("Um dos valores excede o limite de precisão permitido.");
  }

  return value;
}

function parsePositive(raw: string, maxDecimals = 10) {
  const value = parseDecimal(raw);

  if (!value || !value.greaterThan(0)) {
    throw new MonthEditError("Use apenas valores numéricos maiores que zero.");
  }

  if (value.decimalPlaces() > maxDecimals || value.precision() > 24) {
    throw new MonthEditError("Um dos valores excede o limite de precisão permitido.");
  }

  return value;
}

export function parseDecimal(value: string) {
  const trimmed = value.trim().replace(/\s/g, "");
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }

  try {
    return new Prisma.Decimal(normalized);
  } catch {
    return null;
  }
}
