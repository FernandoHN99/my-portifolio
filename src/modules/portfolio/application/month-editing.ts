import { createHash, randomUUID } from "node:crypto";

import { PortfolioMonthStatus, PositionTransactionKind, Prisma, QuoteUpdateStatus } from "@/generated/prisma/client";
import { currentUserId, getUserDb, SCOPED_USER } from "@/lib/user-db";
import {
  parseCdiPercent,
  applyAssetAttributes,
  AssetAttributeError,
  restoreAssetState,
  type AssetAttributes,
  type AssetState,
} from "@/modules/portfolio/application/asset-attributes";
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
import { MAX_LIQUIDITY_LENGTH, normalizeLiquidity } from "@/modules/portfolio/domain/liquidity";
import { isRedemption } from "@/modules/portfolio/domain/redemption";
import { valueCdiPositions } from "@/modules/portfolio/application/cdi-positions";
import { readVerifiedTicker } from "@/modules/quotes/application/check-ticker";
import { readMonthQuoteValues } from "@/modules/quotes/application/month-quote-values";
import { addMonths, calendarDay, currentReferenceMonth, lastDayOf, toDateKey } from "@/modules/quotes/domain/calendar";
import { isQuoteEditable } from "@/modules/quotes/domain/quote-refresh";

type Transaction = Prisma.TransactionClient;

export class MonthEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MonthEditError";
  }
}

/** Conta nova, numa instituição existente ou também nova (spec 026). */
export type NewAccountInput = {
  institutionId: string | null;
  institutionName: string | null;
  name: string;
};
/** Ativo novo com a conferência do ticker (spec 026). */
export type NewAssetInput = {
  name: string;
  kind: AssetKind;
  ticker: string | null;
  maturityDate: string | null;
  /** Prazo de liquidez, opcional (spec 039). */
  liquidity?: string | null;
  quoteCheckToken: string | null;
  manualPriceBrl: string | null;
  /** Conta corrente (spec 059), só no caixa em reais e no caixa em dólar. */
  cashAccount?: boolean;
  /** Renda fixa pelo CDI (spec 060): percentual, como "105", e o dia da aplicação. */
  cdiPercent?: string | null;
  appliedOn?: string | null;
};
/** Inclusão pelo formulário da posição (spec 043), já com o rateio completo. */
export type PositionAddition = {
  accountId?: string;
  newAccount?: NewAccountInput;
  assetId?: string;
  newAsset?: NewAssetInput;
  value: string;
  /**
   * Como o valor entra (spec 056): saldo que a posição já tinha, sem ser
   * aporte nem custo conhecido, ou aporte de dinheiro novo.
   */
  initialKind?: "OPENING" | "CONTRIBUTION";
  /** Preço executado do aporte inicial num ativo cotado; sem ele, a cotação do mês. */
  executedPriceBrl?: string | null;
  strategy: string | null;
  allocations: AllocationInput[];
};
/**
 * Edição pelo formulário da posição (spec 043): os atributos da posição, o
 * rateio e o ativo. Quantidade e saldo só mudam por movimentações (spec 057).
 */
export type PositionEdit = {
  positionId: string;
  /**
   * Início do cálculo pelo CDI nesta posição (spec 060), AAAA-MM-DD; nulo
   * desliga. Ausente, fica como está. O percentual é do ativo.
   */
  cdiStartDate?: string | null;
  strategy: string | null;
  allocations: AllocationInput[];
  asset: AssetAttributes;
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
  quantity: Prisma.Decimal;
  openingQuantity: Prisma.Decimal;
  calculationStartDate: Date | null;
  calculatedIncomeBrl: Prisma.Decimal;
  incomeCalculatedThrough: Date | null;
  incomeCalculationError: string | null;
  unitPriceBrl: Prisma.Decimal | null;
  exchangeRateBrl: Prisma.Decimal | null;
  totalBrl: Prisma.Decimal;
  strategy: string | null;
  allocations: {
    id: string;
    assetClass: string;
    subclass: string;
    duration: string;
    weight: Prisma.Decimal;
  }[];
};

/** Cotação digitada à mão pelo usuário (spec 051); as compartilhadas ficam fora. */
type SnapshotQuote = {
  id: string;
  symbol: string;
  instrumentType: string;
  baseCurrency: string;
  valueBrl: Prisma.Decimal;
};

/** Movimentação registrada no mês (spec 056), que volta junto no desfazer. */
type SnapshotTransaction = {
  id: string;
  positionId: string;
  kind: PositionTransactionKind;
  occurredOn: Date;
  quantity: Prisma.Decimal;
  unitPriceBrl: Prisma.Decimal | null;
  amountBrl: Prisma.Decimal;
  note: string | null;
  transferId: string | null;
  createdAt: Date;
};

type MonthSnapshot = { positions: SnapshotPosition[]; quotes: SnapshotQuote[]; transactions: SnapshotTransaction[] };

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

// O depósito do desfazer é um só no servidor; cada entrada guarda o usuário
// que fez a alteração, e só ele pode desfazê-la (spec 050).
type UndoEntry = { userId: string } & (
  | {
      kind: "restore";
      monthId: string;
      snapshot: MonthSnapshot;
      fingerprint: string;
      expiresAt: number;
      created?: CreatedEntities;
      /** Ativos editados junto, no estado anterior. */
      assets?: AssetState[];
    }
  | { kind: "delete-month"; monthId: string; fingerprint: string; expiresAt: number }
);

type NewUndoEntry = UndoEntry extends infer Entry ? (Entry extends unknown ? Omit<Entry, "userId"> : never) : never;

const UNDO_TTL_MS = 10 * 60 * 1000;
const MAX_STRATEGY_LENGTH = 60;
const MAX_LABEL_LENGTH = 80;
const MAX_ENTITY_NAME_LENGTH = 60;
const MAX_ASSET_NAME_LENGTH = 80;

const globalForUndo = globalThis as unknown as { monthUndoStore?: Map<string, UndoEntry> };
const undoStore = (globalForUndo.monthUndoStore ??= new Map<string, UndoEntry>());

/**
 * Inclui uma posição pelo formulário (spec 043): conta e ativo existentes ou
 * novos, com o rateio informado. Um ativo que já existe é reaproveitado.
 */
export async function addPosition(input: { monthId: string; addition: PositionAddition }) {
  const allocations = parseAllocations(input.addition.allocations);

  return withUndo(input.monthId, async (transaction, month) => {
    const positions = await transaction.position.findMany({
      where: { portfolioMonthId: month.id },
      select: { accountId: true, assetId: true },
    });
    const quotes = await readMonthQuoteValues(transaction, month.referenceDate);
    const quoteBySymbol = new Map([...quotes].map(([symbol, quote]) => [symbol, quote.valueBrl]));
    const batch: AdditionBatch = {
      month,
      isCurrentMonth: month.referenceDate.getTime() === currentReferenceMonth().getTime(),
      quoteBySymbol,
      institutions: new Map(),
      accounts: new Map(),
      assets: new Map(),
      created: { institutionIds: [], accountIds: [], assetIds: [], dailyQuoteIds: [] },
    };
    const addition = input.addition;
    const account = await resolveAdditionAccount(transaction, addition, batch);
    const asset = await resolveAdditionAsset(transaction, addition, account, batch);

    if (positions.some((position) => position.accountId === account.id && position.assetId === asset.id)) {
      throw new MonthEditError("Este ativo já possui posição nesta instituição e competência.");
    }

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

    await assertAllocationRules(transaction, allocations);
    const created = await transaction.position.create({
      data: {
        userId: SCOPED_USER,
        portfolioMonthId: month.id,
        accountId: account.id,
        assetId: asset.id,
        quantity,
        unitPriceBrl,
        exchangeRateBrl: asset.quoteSymbol ? (quoteBySymbol.get(USD_SYMBOL) ?? null) : null,
        totalBrl,
        strategy: normalizeStrategy(addition.strategy),
      },
      select: { id: true },
    });
    await transaction.positionAllocation.createMany({
      data: allocations.map((allocation) => ({ ...allocation, userId: SCOPED_USER, positionId: created.id })),
    });

    // A posição nasce com o movimento inicial (spec 056): saldo inicial, o
    // valor que ela já tinha ao começar o acompanhamento, ou aporte. A base do
    // mês fica zero e a quantidade vem do movimento.
    if (quantity.greaterThan(0)) {
      // O dia da aplicação vale só para a renda fixa criada nesta inclusão; um
      // ativo que já existia entra pelo dia do movimento no mês.
      const dates = batch.created.assetIds.includes(asset.id)
        ? await transaction.asset.findUnique({
            where: { id: asset.id },
            select: { appliedOn: true, cdiPercent: true },
          })
        : null;

      if (dates?.appliedOn && dates.appliedOn > lastDayOf(month.referenceDate)) {
        throw new MonthEditError(
          `O dia da aplicação fica até o fim da competência (${formatDay(lastDayOf(month.referenceDate))}).`,
        );
      }

      const contribution = addition.initialKind === "CONTRIBUTION";
      const executed =
        contribution && unitPriceBrl
          ? addition.executedPriceBrl
            ? parsePositive(addition.executedPriceBrl, 8)
            : unitPriceBrl
          : null;
      await transaction.positionTransaction.create({
        data: {
          userId: SCOPED_USER,
          positionId: created.id,
          kind: contribution ? PositionTransactionKind.CONTRIBUTION : PositionTransactionKind.OPENING,
          occurredOn: dates?.appliedOn ?? transactionDay(month.referenceDate),
          quantity,
          // O saldo inicial não é custo de compra: sem preço executado.
          unitPriceBrl: executed,
          amountBrl: executed ? quantity.mul(executed).toDecimalPlaces(2) : totalBrl,
        },
      });

      // Renda fixa pelo CDI (spec 060): o valor informado é o aplicado no dia da
      // aplicação, e o saldo bruto sai do cálculo até hoje.
      if (dates?.cdiPercent && dates.appliedOn && !asset.quoteSymbol) {
        await transaction.position.update({ where: { id: created.id }, data: { calculationStartDate: dates.appliedOn } });
        await valueCdiPositions(transaction, { where: { id: created.id } });
      }
    }

    return hasCreated(batch.created) ? { created: batch.created } : undefined;
  });
}

/**
 * Edita uma posição pelo formulário (spec 043): quantidade ou saldo,
 * estratégia, rateio e os atributos do ativo, que valem para todos os meses.
 * Tudo numa transação, com desfazer que também volta o ativo.
 */
export async function editPosition(input: { monthId: string; edit: PositionEdit }) {
  const allocations = parseAllocations(input.edit.allocations);

  return withUndo(input.monthId, async (transaction, month) => {
    const position = await transaction.position.findFirst({
      where: { id: input.edit.positionId, portfolioMonthId: month.id },
      select: {
        id: true,
        assetId: true,
        openingQuantity: true,
        calculationStartDate: true,
        allocations: { select: { duration: true } },
      },
    });

    if (!position) {
      throw new MonthEditError("A posição não pertence a esta competência.");
    }

    // O lápis edita só os atributos: quantidade e saldo vêm das movimentações
    // (spec 057).
    await transaction.position.update({
      where: { id: position.id },
      data: { strategy: normalizeStrategy(input.edit.strategy) },
    });

    // Um prazo antigo, como D+0, só continua se a posição já o tinha.
    await assertAllocationRules(
      transaction,
      allocations,
      new Set(position.allocations.map((allocation) => allocation.duration)),
    );
    await transaction.positionAllocation.deleteMany({ where: { positionId: position.id } });
    await transaction.positionAllocation.createMany({
      data: allocations.map((allocation) => ({ ...allocation, userId: SCOPED_USER, positionId: position.id })),
    });

    let previous: AssetState | null;

    try {
      previous = await applyAssetAttributes(transaction, position.assetId, input.edit.asset);
    } catch (error) {
      if (error instanceof AssetAttributeError) {
        throw new MonthEditError(error.message);
      }
      throw error;
    }

    await applyCdiStart(transaction, month, position, input.edit.cdiStartDate);

    return previous ? { assets: [previous] } : undefined;
  });
}

/**
 * Liga, muda ou desliga o cálculo pelo CDI de uma posição (spec 060). Ligado,
 * a base do mês rende a partir do dia escolhido, dentro da competência; num
 * ativo legado, a base é o saldo conhecido, sem inventar a aplicação. Desligar
 * guarda o rendimento já calculado como um rendimento registrado, para o saldo
 * não sumir. O percentual é do ativo e chega pelos atributos.
 */
async function applyCdiStart(
  transaction: Transaction,
  month: { id: string; referenceDate: Date },
  position: { id: string; assetId: string; calculationStartDate: Date | null },
  next: string | null | undefined,
) {
  const asset = await transaction.asset.findUniqueOrThrow({
    where: { id: position.assetId },
    select: { cdiPercent: true, quoteSymbol: true },
  });
  const enabled = Boolean(asset.cdiPercent) && !asset.quoteSymbol;
  const wanted = next === undefined ? (enabled ? position.calculationStartDate : null) : enabled ? next : null;
  const start = typeof wanted === "string" ? parseCdiStart(wanted, month.referenceDate) : wanted;

  if (!start) {
    if (position.calculationStartDate) {
      await foldCalculatedIncome(transaction, month, position.id);
    }
    return;
  }

  if (position.calculationStartDate?.getTime() !== start.getTime()) {
    await transaction.position.update({ where: { id: position.id }, data: { calculationStartDate: start } });
  }

  await valueCdiPositions(transaction, { where: { id: position.id } });
}

async function foldCalculatedIncome(transaction: Transaction, month: { referenceDate: Date }, positionId: string) {
  const current = await transaction.position.findUniqueOrThrow({
    where: { id: positionId },
    select: { calculatedIncomeBrl: true, incomeCalculatedThrough: true },
  });
  const income = current.calculatedIncomeBrl.toDecimalPlaces(2);

  if (income.greaterThan(0)) {
    await transaction.positionTransaction.create({
      data: {
        userId: SCOPED_USER,
        positionId,
        kind: PositionTransactionKind.INCOME,
        occurredOn: transactionDay(month.referenceDate),
        quantity: income,
        amountBrl: income,
        note: `Rendimento bruto pelo CDI${current.incomeCalculatedThrough ? ` até ${toDateKey(current.incomeCalculatedThrough)}` : ""}`,
      },
    });
  }

  await transaction.position.update({
    where: { id: positionId },
    data: { calculationStartDate: null, calculatedIncomeBrl: 0, incomeCalculatedThrough: null, incomeCalculationError: null },
  });
}

/**
 * Dia do início do cálculo: nunca no futuro e sempre dentro da competência,
 * para a base não render antes de existir nem depois de o mês fechar.
 */
function parseCdiStart(raw: string, referenceDate: Date) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00.000Z`) : null;

  if (!day || Number.isNaN(day.getTime()) || toDateKey(day) !== raw || day > calendarDay(new Date())) {
    throw new MonthEditError("Informe um dia válido, até hoje, para o início do cálculo pelo CDI.");
  }

  if (day < referenceDate || day > lastDayOf(referenceDate)) {
    throw new MonthEditError(
      `O cálculo pelo CDI começa dentro da competência, de ${formatDay(referenceDate)} a ${formatDay(lastDayOf(referenceDate))}.`,
    );
  }

  return day;
}

/** Dia como DD/MM/AAAA, nas mensagens. */
function formatDay(day: Date) {
  const [year, month, date] = toDateKey(day).split("-");
  return `${date}/${month}/${year}`;
}

/** Percentual e dia da aplicação de uma renda fixa nova pelo CDI (spec 060). */
function cdiOfNewAsset(input: NewAssetInput) {
  if (input.kind !== "fixed-income" || !input.cdiPercent) {
    return {};
  }

  let percent: Prisma.Decimal | null;

  try {
    percent = parseCdiPercent(input.cdiPercent);
  } catch (error) {
    throw new MonthEditError(error instanceof Error ? error.message : "Revise o percentual do CDI.");
  }

  const applied = input.appliedOn && /^\d{4}-\d{2}-\d{2}$/.test(input.appliedOn) ? new Date(`${input.appliedOn}T00:00:00.000Z`) : null;

  if (!applied || Number.isNaN(applied.getTime()) || toDateKey(applied) !== input.appliedOn || applied > calendarDay(new Date()) || input.appliedOn < "2000-01-01") {
    throw new MonthEditError("Informe o dia da aplicação, até hoje, para calcular pelo CDI.");
  }

  return { cdiPercent: percent, appliedOn: applied };
}

/** Remove uma posição da competência (spec 043), com desfazer. */
export async function removePosition(input: { monthId: string; positionId: string }) {
  return withUndo(input.monthId, async (transaction, month) => {
    const removed = await transaction.position.deleteMany({
      where: { id: input.positionId, portfolioMonthId: month.id },
    });

    if (removed.count === 0) {
      throw new MonthEditError("A posição não pertence a esta competência.");
    }
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
  assets: Map<string, { id: string; signature: string; quoteSymbol: string | null }>;
  created: CreatedEntities;
};

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
    data: { userId: SCOPED_USER, institutionId: institution.id, name },
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

  const existing = await transaction.institution.findFirst({
    where: { normalizedName },
    select: { name: true },
  });

  if (existing) {
    throw new MonthEditError(`A instituição "${existing.name}" já existe. Escolha-a na lista.`);
  }

  const institution = await transaction.institution.create({
    data: { userId: SCOPED_USER, name, normalizedName },
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
): Promise<{ id: string; quoteSymbol: string | null }> {
  if (addition.assetId) {
    const asset = await transaction.asset.findUnique({
      where: { id: addition.assetId },
      select: { id: true, quoteSymbol: true },
    });

    if (!asset) {
      throw new MonthEditError("O ativo escolhido não existe.");
    }

    return asset;
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

  const officialMaturity = input.kind === "treasury" ? symbol?.slice(-10) ?? null : null;
  if (officialMaturity && input.maturityDate && input.maturityDate !== officialMaturity) {
    throw new MonthEditError("O vencimento deve ser o do título oficial selecionado.");
  }
  const maturityDate = parseMaturityDate(officialMaturity ?? input.maturityDate);

  if (maturityDate && !definition.allowsMaturity) {
    throw new MonthEditError("Só ativos sem ticker de mercado têm vencimento.");
  }

  const maturityKey = maturityDate ? maturityDate.toISOString().slice(0, 10) : null;
  const normalizedKey = buildAssetKey({
    name,
    ticker: symbol,
    institutionName: account.institutionName,
    maturityDate: maturityKey,
  });
  const signature = JSON.stringify([input.kind, symbol, maturityKey]);
  const reused = batch.assets.get(normalizedKey);

  if (reused) {
    if (reused.signature !== signature) {
      throw new MonthEditError(`Duas posições novas criam o ativo ${name} com dados diferentes.`);
    }

    return { id: reused.id, quoteSymbol: reused.quoteSymbol };
  }

  const existing = await transaction.asset.findFirst({ where: { normalizedKey }, select: { name: true } });

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
      : definition.provider === "tesouro" ? verifiedCoinId : null;

  const asset = await transaction.asset.create({
    data: {
      userId: SCOPED_USER,
      normalizedKey,
      name,
      ticker: symbol,
      quoteSymbol: symbol,
      baseCurrency: baseCurrencyOf(input.kind, symbol),
      maturityDate,
      liquidity: normalizeLiquidity(input.liquidity)?.slice(0, MAX_LIQUIDITY_LENGTH) ?? null,
      quoteProviderId,
      cashAccount: Boolean(input.cashAccount) && (input.kind === "brl-cash" || input.kind === "usd-balance"),
      ...cdiOfNewAsset(input),
    },
    select: { id: true },
  });
  batch.assets.set(normalizedKey, { id: asset.id, signature, quoteSymbol: symbol });
  batch.created.assetIds.push(asset.id);

  return { id: asset.id, quoteSymbol: symbol };
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

  if (useFetched) {
    // A cotação de hoje é dos provedores e vale para todos (spec 051); outro
    // usuário pode tê-la gravado no meio-tempo.
    await transaction.marketQuote.createMany({
      data: [
        {
          referenceDate: batch.month.referenceDate,
          symbol,
          instrumentType,
          baseCurrency,
          valueBrl,
          quoteDate: verified.quoteDate,
        },
      ],
      skipDuplicates: true,
    });
  } else {
    // A digitada vale só para o usuário, como a edição à mão da página de
    // cotações.
    await transaction.manualQuote.create({
      data: {
        userId: SCOPED_USER,
        referenceDate: batch.month.referenceDate,
        symbol,
        instrumentType,
        baseCurrency,
        valueBrl,
      },
    });
  }
  batch.quoteBySymbol.set(symbol, valueBrl);

  // O ticker novo entra no cadastro como pendente, e o job agendado carrega o
  // histórico dele (spec 053). Um símbolo já cadastrado fica como está.
  await transaction.quoteSymbol.createMany({
    data: [{ symbol, instrumentType, baseCurrency, providerId: verified.coinId }],
    skipDuplicates: true,
  });

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
    // O histórico diário é de todos (spec 051): fica se o ativo de qualquer
    // usuário usa o símbolo. A consulta crua passa por cima do escopo.
    const symbols = daily.map((entry) => entry.symbol);
    const inUse = new Set(
      symbols.length > 0
        ? (
            await transaction.$queryRaw<{ quote_symbol: string }[]>`
              SELECT DISTINCT "quote_symbol" FROM "assets" WHERE "quote_symbol" = ANY(${symbols})
            `
          ).map((row) => row.quote_symbol)
        : [],
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

/**
 * Rateio do formulário: classe, subclasse e resgate preenchidos, sem
 * repetições, com pesos positivos que somam 100%. Devolve os pesos em fração.
 */
function parseAllocations(inputs: AllocationInput[]) {
  const parsed = inputs.map((allocation) => ({
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

  return parsed;
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
      // O valor digitado fica com o usuário (spec 051), por cima da cotação
      // compartilhada, até a próxima busca bem-sucedida do símbolo no mês.
      const reference =
        (await transaction.marketQuote.findFirst({
          where: { symbol: quote.symbol },
          orderBy: { referenceDate: "desc" },
          select: { instrumentType: true, baseCurrency: true },
        })) ??
        (await transaction.manualQuote.findFirst({
          where: { symbol: quote.symbol },
          orderBy: { referenceDate: "desc" },
          select: { instrumentType: true, baseCurrency: true },
        }));

      if (!reference) {
        throw new MonthEditError(`Não há histórico de ${quote.symbol} para identificar o tipo de cotação.`);
      }

      const existing = await transaction.manualQuote.findFirst({
        where: { referenceDate: month.referenceDate, symbol: quote.symbol },
        select: { id: true },
      });

      if (existing) {
        await transaction.manualQuote.update({ where: { id: existing.id }, data: { valueBrl: quote.valueBrl } });
      } else {
        await transaction.manualQuote.create({
          data: {
            userId: SCOPED_USER,
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
  const prisma = await requirePrisma();
  const userId = await currentUserId();

  return prisma.$transaction(
    async (transaction) => {
      // Renda fixa pelo CDI (spec 060): o mês de origem fecha pelo CDI até o
      // primeiro dia do mês novo antes de servir de base.
      const head = await transaction.portfolioMonth.findFirst({
        orderBy: { referenceDate: "desc" },
        select: { id: true, referenceDate: true },
      });

      if (head) {
        await valueCdiPositions(transaction, {
          where: { portfolioMonthId: head.id },
          asOf: toDateKey(nextMonth(head.referenceDate)),
        });
      }

      const latest = await transaction.portfolioMonth.findFirst({
        orderBy: { referenceDate: "desc" },
        select: {
          id: true,
          referenceDate: true,
          // Posições zeradas, como um título liquidado (spec 059), ficam no mês.
          positions: {
            where: { quantity: { gt: 0 } },
            select: {
              calculationStartDate: true,
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
        data: { userId: SCOPED_USER, referenceDate: target, status: PortfolioMonthStatus.DRAFT },
        select: { id: true },
      });

      for (const position of latest.positions) {
        const { allocations, calculationStartDate, ...fields } = position;
        // O mês novo herda uma vez o fechamento do anterior como base, sem as
        // movimentações dele (spec 056); no CDI, o cálculo recomeça no dia 1
        // (spec 060).
        const created = await transaction.position.create({
          data: {
            ...fields,
            openingQuantity: fields.quantity,
            calculationStartDate: calculationStartDate ? target : null,
            userId: SCOPED_USER,
            portfolioMonthId: month.id,
          },
          select: { id: true },
        });

        if (allocations.length > 0) {
          await transaction.positionAllocation.createMany({
            data: allocations.map((allocation) => ({ ...allocation, userId: SCOPED_USER, positionId: created.id })),
          });
        }
      }

      await carryMonthQuotes(transaction, latest.referenceDate, target);

      const after = await readSnapshot(transaction, { id: month.id, referenceDate: target });
      const token = storeUndo(userId, {
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
  const prisma = await requirePrisma();
  const userId = await currentUserId();
  const stored = undoStore.get(token);
  // A entrada de outro usuário fica intacta e é tratada como inexistente.
  const entry = stored?.userId === userId ? stored : undefined;

  if (entry) {
    undoStore.delete(token);
  }

  if (!entry || entry.expiresAt < Date.now()) {
    throw new MonthEditError("Não é mais possível desfazer esta alteração.");
  }


  return prisma.$transaction(
    async (transaction) => {
      const month = await transaction.portfolioMonth.findUnique({
        where: { id: entry.monthId },
        select: { id: true, referenceDate: true },
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
        // As cotações compartilhadas do mês ficam: podem servir a outros
        // usuários (spec 051). Saem só as digitadas por este.
        await transaction.manualQuote.deleteMany({ where: { referenceDate: month.referenceDate } });
        await transaction.portfolioMonth.delete({ where: { id: month.id } });
        return { referenceDate: month.referenceDate, deleted: true };
      }

      await restoreSnapshot(transaction, month, entry.snapshot);

      for (const asset of entry.assets ?? []) {
        try {
          await restoreAssetState(transaction, asset);
        } catch (error) {
          if (error instanceof AssetAttributeError) {
            throw new MonthEditError(error.message);
          }
          throw error;
        }
      }

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
  const prisma = await requirePrisma();
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
  const [quoteBySymbol, lastResults] = await Promise.all([
    readMonthQuoteValues(transaction, referenceDate, symbols),
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
  const failed = new Set(
    lastResults.filter((result) => result.status === QuoteUpdateStatus.FAILED).map((result) => result.symbol),
  );
  const locked = symbols.filter((symbol) => {
    const quote = quoteBySymbol.get(symbol);
    // A digitada à mão continua editável até a próxima busca bem-sucedida.
    return (
      !quote?.manual &&
      !isQuoteEditable({ hasValue: quote !== undefined, carried: Boolean(quote?.carriedFrom), lastFailed: failed.has(symbol) })
    );
  });

  if (locked.length > 0) {
    throw new MonthEditError(
      `${locked.join(", ")} ${locked.length === 1 ? "vem" : "vêm"} da atualização automática e não ${
        locked.length === 1 ? "pode" : "podem"
      } ser ${locked.length === 1 ? "editada" : "editadas"}.`,
    );
  }
}

export async function withUndo(
  monthId: string,
  mutate: (
    transaction: Transaction,
    month: { id: string; referenceDate: Date },
  ) => Promise<{ created?: CreatedEntities; assets?: AssetState[] } | void>,
) {
  const prisma = await requirePrisma();
  const userId = await currentUserId();

  try {
    return await prisma.$transaction(
      async (transaction) => {
        const month = await assertEditable(transaction, monthId);
        const before = await readSnapshot(transaction, month);
        const extras = await mutate(transaction, month);
        const after = await readSnapshot(transaction, month);
        const undoToken = storeUndo(userId, {
          kind: "restore",
          monthId: month.id,
          snapshot: before,
          fingerprint: fingerprint(after),
          expiresAt: Date.now() + UNDO_TTL_MS,
          created: extras?.created,
          assets: extras?.assets,
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
        quantity: true,
        openingQuantity: true,
        calculationStartDate: true,
        calculatedIncomeBrl: true,
        incomeCalculatedThrough: true,
        incomeCalculationError: true,
        unitPriceBrl: true,
        exchangeRateBrl: true,
        totalBrl: true,
        strategy: true,
        allocations: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            assetClass: true,
            subclass: true,
            duration: true,
            weight: true,
          },
        },
      },
    }),
    transaction.manualQuote.findMany({
      where: { referenceDate: month.referenceDate },
      orderBy: { symbol: "asc" },
      select: { id: true, symbol: true, instrumentType: true, baseCurrency: true, valueBrl: true },
    }),
  ]);
  const transactions = await transaction.positionTransaction.findMany({
    where: { position: { portfolioMonthId: month.id } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      positionId: true,
      kind: true,
      occurredOn: true,
      quantity: true,
      unitPriceBrl: true,
      amountBrl: true,
      note: true,
      transferId: true,
      createdAt: true,
    },
  });

  return { positions, quotes, transactions };
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
      create: { ...position, userId: SCOPED_USER, portfolioMonthId: month.id },
      update: {
        quantity: position.quantity,
        openingQuantity: position.openingQuantity,
        calculationStartDate: position.calculationStartDate,
        calculatedIncomeBrl: position.calculatedIncomeBrl,
        incomeCalculatedThrough: position.incomeCalculatedThrough,
        incomeCalculationError: position.incomeCalculationError,
        unitPriceBrl: position.unitPriceBrl,
        exchangeRateBrl: position.exchangeRateBrl,
        totalBrl: position.totalBrl,
        strategy: position.strategy,
      },
    });
    await transaction.positionAllocation.deleteMany({ where: { positionId: position.id } });

    if (allocations.length > 0) {
      await transaction.positionAllocation.createMany({
        data: allocations.map((allocation) => ({ ...allocation, userId: SCOPED_USER, positionId: position.id })),
      });
    }
  }

  // Só as cotações digitadas pelo usuário voltam; as compartilhadas não são
  // dele para desfazer (spec 051).
  const keepQuoteIds = snapshot.quotes.map((quote) => quote.id);
  await transaction.manualQuote.deleteMany({
    where: { referenceDate: month.referenceDate, id: { notIn: keepQuoteIds } },
  });

  for (const quote of snapshot.quotes) {
    await transaction.manualQuote.upsert({
      where: { id: quote.id },
      create: { ...quote, userId: SCOPED_USER, referenceDate: month.referenceDate },
      update: { valueBrl: quote.valueBrl },
    });
  }

  // As movimentações do mês voltam como estavam (spec 056); as de posições
  // apagadas acima já saíram junto com elas.
  const keepTransactionIds = snapshot.transactions.map((entry) => entry.id);
  await transaction.positionTransaction.deleteMany({
    where: { position: { portfolioMonthId: month.id }, id: { notIn: keepTransactionIds } },
  });

  for (const entry of snapshot.transactions) {
    const { id, ...data } = entry;
    await transaction.positionTransaction.upsert({
      where: { id },
      create: { id, ...data, userId: SCOPED_USER },
      update: data,
    });
  }
}

/**
 * Repete as cotações de um mês no seguinte, marcadas como repetidas, como na
 * virada automática (spec 021). As compartilhadas só entram se o mês ainda não
 * as tiver, porque outro usuário pode tê-las criado (spec 051); uma digitada à
 * mão sem compartilhada correspondente é repetida como digitada do usuário.
 */
async function carryMonthQuotes(transaction: Transaction, source: Date, target: Date) {
  const [shared, manual] = await Promise.all([
    transaction.marketQuote.findMany({
      where: { referenceDate: source },
      select: { symbol: true, instrumentType: true, baseCurrency: true, valueBrl: true, quoteDate: true, carriedFrom: true },
    }),
    transaction.manualQuote.findMany({
      where: { referenceDate: source },
      select: { symbol: true, instrumentType: true, baseCurrency: true, valueBrl: true },
    }),
  ]);

  if (shared.length > 0) {
    await transaction.marketQuote.createMany({
      data: shared.map((quote) => ({ ...quote, referenceDate: target, carriedFrom: quote.carriedFrom ?? source })),
      skipDuplicates: true,
    });
  }

  const sharedSymbols = new Set(shared.map((quote) => quote.symbol));
  const manualOnly = manual.filter((quote) => !sharedSymbols.has(quote.symbol));

  if (manualOnly.length > 0) {
    await transaction.manualQuote.createMany({
      data: manualOnly.map((quote) => ({ ...quote, userId: SCOPED_USER, referenceDate: target })),
      skipDuplicates: true,
    });
  }
}

function fingerprint(snapshot: MonthSnapshot) {
  return createHash("sha256")
    .update(
      JSON.stringify(snapshot, (_key, value: unknown) => (value instanceof Prisma.Decimal ? value.toString() : value)),
    )
    .digest("hex");
}

function storeUndo(userId: string, entry: NewUndoEntry) {
  const now = Date.now();

  for (const [key, value] of undoStore) {
    if (value.expiresAt < now) {
      undoStore.delete(key);
    }
  }

  const token = randomUUID();
  undoStore.set(token, { ...entry, userId } as UndoEntry);
  return token;
}

/**
 * Dia de uma movimentação registrada agora numa competência: hoje, no mês
 * corrente; o último dia do mês, num mês passado aberto de novo.
 */
export function transactionDay(referenceDate: Date, now = new Date()) {
  const today = calendarDay(now);
  const last = lastDayOf(referenceDate);
  return today.getTime() > last.getTime() ? last : today < referenceDate ? referenceDate : today;
}

async function requirePrisma() {
  const prisma = await getUserDb();

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
