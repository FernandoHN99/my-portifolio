import { createHash, randomUUID } from "node:crypto";

import { PortfolioMonthStatus, Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { currentReferenceMonth } from "@/modules/portfolio/application/refresh-portfolio-month";

type Transaction = Prisma.TransactionClient;

export class MonthEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MonthEditError";
  }
}

export type PositionUpdate = { positionId: string; value?: string; strategy?: string | null };
export type PositionAddition = {
  accountId: string;
  assetId: string;
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

type UndoEntry =
  | { kind: "restore"; monthId: string; snapshot: MonthSnapshot; fingerprint: string; expiresAt: number }
  | { kind: "delete-month"; monthId: string; fingerprint: string; expiresAt: number };

const UNDO_TTL_MS = 10 * 60 * 1000;
const MAX_STRATEGY_LENGTH = 60;
const MAX_LABEL_LENGTH = 80;

const globalForUndo = globalThis as unknown as { monthUndoStore?: Map<string, UndoEntry> };
const undoStore = (globalForUndo.monthUndoStore ??= new Map<string, UndoEntry>());

export async function applyPositionChanges(input: {
  monthId: string;
  confirmHistory: boolean;
  updates: PositionUpdate[];
  removals: string[];
  additions: PositionAddition[];
}) {
  if (input.updates.length + input.removals.length + input.additions.length === 0) {
    throw new MonthEditError("Não há alterações para salvar.");
  }

  return withUndo(input.monthId, input.confirmHistory, async (transaction, month) => {
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
    const usdRate = quoteBySymbol.get("USD") ?? null;

    for (const addition of input.additions) {
      const identity = `${addition.accountId}:${addition.assetId}`;

      if (occupied.has(identity)) {
        throw new MonthEditError("Este ativo já possui posição nesta conta e competência.");
      }
      occupied.add(identity);

      const [account, asset] = await Promise.all([
        transaction.account.findUnique({ where: { id: addition.accountId }, select: { id: true } }),
        transaction.asset.findUnique({
          where: { id: addition.assetId },
          select: { id: true, name: true, quoteSymbol: true },
        }),
      ]);

      if (!account || !asset) {
        throw new MonthEditError("A conta ou o ativo escolhido não existe.");
      }

      const value = parseNonNegative(addition.value);
      let unitPriceBrl: Prisma.Decimal | null = null;
      let quantity = value.toDecimalPlaces(2);
      let totalBrl = quantity;

      if (asset.quoteSymbol) {
        const price = quoteBySymbol.get(asset.quoteSymbol);

        if (!price) {
          throw new MonthEditError(
            `Não há cotação de ${asset.quoteSymbol} nesta competência. Informe-a no painel de cotações.`,
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
  });
}

export async function replaceAllocations(input: {
  monthId: string;
  confirmHistory: boolean;
  positionId: string;
  allocations: AllocationInput[];
}) {
  const parsed = input.allocations.map((allocation) => ({
    assetClass: normalizeLabel(allocation.assetClass, "classe"),
    subclass: normalizeLabel(allocation.subclass, "subclasse"),
    duration: normalizeLabel(allocation.duration, "duração"),
    weight: parsePositive(allocation.weightPercent, 8).div(100),
  }));

  if (parsed.length === 0) {
    throw new MonthEditError("Informe ao menos uma classificação.");
  }

  const identities = new Set(parsed.map((entry) => `${entry.assetClass}|${entry.subclass}|${entry.duration}`));
  if (identities.size !== parsed.length) {
    throw new MonthEditError("Há classificações repetidas com a mesma classe, subclasse e duração.");
  }

  const sum = parsed.reduce((total, entry) => total.plus(entry.weight), new Prisma.Decimal(0));
  if (sum.minus(1).abs().greaterThan("0.0001")) {
    throw new MonthEditError(`Os pesos somam ${sum.mul(100).toFixed(2)}%. A soma precisa ser 100%.`);
  }

  if (parsed.some((entry) => entry.weight.greaterThan(1))) {
    throw new MonthEditError("Nenhum peso pode ultrapassar 100%.");
  }

  return withUndo(input.monthId, input.confirmHistory, async (transaction, month) => {
    const position = await transaction.position.findFirst({
      where: { id: input.positionId, portfolioMonthId: month.id },
      select: { id: true },
    });

    if (!position) {
      throw new MonthEditError("A posição não pertence a esta competência.");
    }

    await transaction.positionAllocation.deleteMany({ where: { positionId: position.id } });
    await transaction.positionAllocation.createMany({
      data: parsed.map((entry) => ({ ...entry, positionId: position.id })),
    });
  });
}

export async function updateMonthQuotes(input: {
  monthId: string;
  confirmHistory: boolean;
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

  return withUndo(input.monthId, input.confirmHistory, async (transaction, month) => {
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
      return { referenceDate: month.referenceDate, deleted: false };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

async function withUndo(
  monthId: string,
  confirmHistory: boolean,
  mutate: (transaction: Transaction, month: { id: string; referenceDate: Date }) => Promise<void>,
) {
  const prisma = requirePrisma();

  try {
    return await prisma.$transaction(
      async (transaction) => {
        const month = await assertEditable(transaction, monthId, confirmHistory);
        const before = await readSnapshot(transaction, month);
        await mutate(transaction, month);
        const after = await readSnapshot(transaction, month);
        const undoToken = storeUndo({
          kind: "restore",
          monthId: month.id,
          snapshot: before,
          fingerprint: fingerprint(after),
          expiresAt: Date.now() + UNDO_TTL_MS,
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

async function assertEditable(transaction: Transaction, monthId: string, confirmHistory: boolean) {
  const month = await transaction.portfolioMonth.findUnique({
    where: { id: monthId },
    select: { id: true, referenceDate: true },
  });

  if (!month) {
    throw new MonthEditError("Esta competência não existe.");
  }

  const latest = await transaction.portfolioMonth.findFirst({
    orderBy: { referenceDate: "desc" },
    select: { id: true },
  });

  if (latest?.id !== month.id && !confirmHistory) {
    throw new MonthEditError("Confirme a edição do histórico antes de alterar uma competência passada.");
  }

  return month;
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
