import { PositionTransactionKind, Prisma } from "@/generated/prisma/client";
import { SCOPED_USER } from "@/lib/user-db";
import { valueCdiPositions } from "@/modules/portfolio/application/cdi-positions";
import { foldCalculatedIncome, MonthEditError, parseDecimal, withUndo } from "@/modules/portfolio/application/month-editing";
import { WITHDRAWAL_ABOVE_BALANCE } from "@/modules/portfolio/domain/cdi-valuation";
import type { TransactionKind } from "@/modules/portfolio/domain/position-transactions";
import { calendarDay, lastDayOf, toDateKey } from "@/modules/quotes/domain/calendar";

// Movimentações das posições (specs 056 e 057): aporte, retirada e rendimento,
// registrados, corrigidos ou apagados na posição da competência aberta. A
// quantidade da posição é a base do mês (herdada uma vez do fechamento do mês
// anterior) mais as movimentações dele; cada mudança recalcula só a posição do
// mês, sem mexer em outros meses. Tudo passa pelo desfazer da competência.

type Transaction = Prisma.TransactionClient;

export type TransactionInput = {
  positionId: string;
  kind: TransactionKind;
  /** AAAA-MM-DD, dentro da competência e nunca depois de hoje. */
  occurredOn: string;
  /** Unidades nos ativos cotados (dólares no caixa em dólar); nulo nos saldos em reais. */
  quantity: string | null;
  /** Preço executado em reais; nulo nos saldos em reais e no rendimento em dinheiro. */
  unitPriceBrl: string | null;
  amountBrl: string;
  note?: string | null;
};

const AMOUNT_TOLERANCE = new Prisma.Decimal("0.01");
const MAX_NOTE_LENGTH = 200;

export async function addTransaction(input: { monthId: string; transaction: TransactionInput }) {
  return withUndo(input.monthId, async (transaction, month) => {
    const position = await findPosition(transaction, month.id, input.transaction.positionId);

    // O rendimento de uma aplicação com cálculo automático vem da taxa (spec
    // 079): um rendimento manual somaria duas vezes.
    if (input.transaction.kind === PositionTransactionKind.INCOME && automatic(position)) {
      throw new MonthEditError(`O rendimento de ${position.asset.name} é calculado automaticamente.`);
    }

    const values = parseValues(position, month.referenceDate, input.transaction.kind, input.transaction);
    await transaction.positionTransaction.create({
      data: { userId: SCOPED_USER, positionId: position.id, ...values },
    });
    await recomputePosition(transaction, position.id, `A retirada é maior que a posição de ${position.asset.name}.`);
  });
}

/**
 * Corrige uma movimentação do mês aberto (spec 057): o registro muda no lugar,
 * sem criar outro por cima, e a posição do mês é recalculada.
 */
export async function updateTransaction(input: {
  monthId: string;
  transactionId: string;
  transaction: TransactionInput;
}) {
  return withUndo(input.monthId, async (transaction, month) => {
    const entry = await findMonthTransaction(transaction, month.id, input.transactionId);

    if (entry.transferId) {
      throw new MonthEditError("Uma liquidação não é corrigida por partes: apague-a e liquide de novo.");
    }

    if (entry.positionId !== input.transaction.positionId) {
      throw new MonthEditError("A movimentação não pertence a esta posição.");
    }

    const position = await findPosition(transaction, month.id, entry.positionId);
    // O saldo inicial continua saldo inicial; os demais trocam de tipo à vontade.
    const kind = entry.kind === PositionTransactionKind.OPENING ? PositionTransactionKind.OPENING : input.transaction.kind;

    if (kind === PositionTransactionKind.INCOME && entry.kind !== PositionTransactionKind.INCOME && automatic(position)) {
      throw new MonthEditError(`O rendimento de ${position.asset.name} é calculado automaticamente.`);
    }

    const values = parseValues(position, month.referenceDate, kind, input.transaction);
    await transaction.positionTransaction.update({ where: { id: entry.id }, data: values });
    await recomputePosition(transaction, position.id, "A correção deixaria a posição negativa.");
  });
}

/**
 * Apaga uma movimentação do mês aberto e recalcula a posição. As pernas de uma
 * liquidação saem juntas, para o título e o caixa continuarem coerentes.
 */
export async function removeTransaction(input: { monthId: string; transactionId: string }) {
  return withUndo(input.monthId, async (transaction, month) => {
    const entry = await findMonthTransaction(transaction, month.id, input.transactionId);
    const legs = entry.transferId
      ? await transaction.positionTransaction.findMany({
          where: { transferId: entry.transferId, position: { portfolioMonthId: month.id } },
          select: { id: true, positionId: true },
        })
      : [{ id: entry.id, positionId: entry.positionId }];

    await transaction.positionTransaction.deleteMany({ where: { id: { in: legs.map((leg) => leg.id) } } });

    for (const positionId of new Set(legs.map((leg) => leg.positionId))) {
      await recomputePosition(transaction, positionId, "Apagar esta movimentação deixaria a posição negativa.");
    }
  });
}

export type LiquidationInput = {
  positionId: string;
  /** AAAA-MM-DD */
  occurredOn: string;
  /** Valor recebido em reais. */
  amountBrl: string;
};

/**
 * Liquida uma posição (spec 076): uma retirada total, com desfazer. A posição
 * fica zerada no mês, com todo o histórico, e não passa ao mês seguinte. Num
 * saldo em reais, um valor recebido diferente do saldo registra a diferença
 * como rendimento antes da retirada (negativo quando chega menos, como imposto
 * retido); num ativo cotado, a diferença fica no preço executado da venda.
 * Diferente de remover, que apaga o registro do mês.
 */
export async function liquidatePosition(input: { monthId: string; liquidation: LiquidationInput }) {
  return withUndo(input.monthId, async (transaction, month) => {
    const { liquidation } = input;
    const position = await findPosition(transaction, month.id, liquidation.positionId);
    const occurredOn = parseOccurredOn(liquidation.occurredOn, month.referenceDate);

    // Uma segunda submissão encontra a posição já zerada e não retira de novo.
    if (!position.quantity.greaterThan(0)) {
      throw new MonthEditError(`${position.asset.name} já está liquidada.`);
    }

    // Sem cascata: liquidar antes de um mês que ainda tem a posição deixaria
    // os meses seguintes com um saldo que não existe mais.
    const later = await transaction.position.findFirst({
      where: {
        accountId: position.accountId,
        assetId: position.assetId,
        portfolioMonth: { referenceDate: { gt: month.referenceDate } },
      },
      select: { id: true },
    });

    if (later) {
      throw new MonthEditError(`${position.asset.name} continua nos meses seguintes. Liquide no último mês em que ela aparece.`);
    }

    const received = parseAmount(liquidation.amountBrl);
    const note = "Liquidação";
    const quoted = Boolean(position.asset.quoteSymbol);
    let balance = position.totalBrl;

    // Rendimento automático (spec 079): como no resgate do banco, o cálculo
    // fecha no dia da liquidação, com o rendimento até a véspera guardado como
    // "Rendimento automático até…"; o que o banco pagou a mais ou a menos
    // (o imposto retido, por exemplo) entra como acerto, abaixo.
    if (automatic(position)) {
      await valueCdiPositions(transaction, { where: { id: position.id }, asOf: toDateKey(occurredOn) });
      await foldCalculatedIncome(transaction, month, position.id, occurredOn);
      balance = (await transaction.position.findUniqueOrThrow({ where: { id: position.id }, select: { totalBrl: true } })).totalBrl;
    }

    if (!quoted) {
      const difference = received.minus(balance);

      if (!difference.isZero()) {
        await transaction.positionTransaction.create({
          data: {
            userId: SCOPED_USER,
            positionId: position.id,
            kind: PositionTransactionKind.INCOME,
            occurredOn,
            quantity: difference.abs(),
            unitPriceBrl: null,
            amountBrl: difference,
            note: difference.isNegative() ? `${note}: recebido abaixo do saldo` : note,
          },
        });
      }
    }

    // A retirada leva a posição exatamente a zero: a quantidade dela é o que
    // sobra depois da base e das outras movimentações do mês.
    const rest = await quantityOf(transaction, position.id);
    await transaction.positionTransaction.create({
      data: {
        userId: SCOPED_USER,
        positionId: position.id,
        kind: PositionTransactionKind.WITHDRAWAL,
        occurredOn,
        quantity: rest,
        unitPriceBrl: quoted ? received.div(rest).toDecimalPlaces(8) : null,
        amountBrl: received,
        note,
      },
    });
    await recomputePosition(transaction, position.id, `${position.asset.name} não pôde ser zerada.`);
  });
}

/**
 * Rendimento automático ligado na posição (spec 079): a flag do ativo e o
 * início do cálculo no mês, que só existe com a taxa de cada classificação.
 */
function automatic(position: { calculationStartDate: Date | null; asset: { autoIncome: boolean; quoteSymbol: string | null } }) {
  return Boolean(position.calculationStartDate && position.asset.autoIncome && !position.asset.quoteSymbol);
}

async function findPosition(transaction: Transaction, monthId: string, positionId: string) {
  const position = await transaction.position.findFirst({
    where: { id: positionId, portfolioMonthId: monthId },
    select: {
      id: true,
      accountId: true,
      assetId: true,
      quantity: true,
      unitPriceBrl: true,
      totalBrl: true,
      calculationStartDate: true,
      asset: { select: { quoteSymbol: true, name: true, autoIncome: true } },
    },
  });

  if (!position) {
    throw new MonthEditError("A posição não pertence a esta competência.");
  }

  return position;
}

async function findMonthTransaction(transaction: Transaction, monthId: string, transactionId: string) {
  const entry = await transaction.positionTransaction.findFirst({
    where: { id: transactionId, position: { portfolioMonthId: monthId } },
    select: { id: true, kind: true, positionId: true, transferId: true },
  });

  if (!entry) {
    throw new MonthEditError("A movimentação não pertence à competência aberta ou já foi apagada.");
  }

  return entry;
}

/**
 * Efeito da movimentação na quantidade: a retirada e o acerto negativo de uma
 * liquidação tiram; os demais põem. O rendimento em dinheiro tem quantidade
 * zero e não muda a posição.
 */
function quantityEffect(entry: { kind: PositionTransactionKind; quantity: Prisma.Decimal; amountBrl: Prisma.Decimal }) {
  return entry.kind === PositionTransactionKind.WITHDRAWAL || entry.amountBrl.isNegative()
    ? entry.quantity.neg()
    : entry.quantity;
}

/** Base, movimentos e rendimento automático já salvo, preservado na pausa. */
async function quantityOf(transaction: Transaction, positionId: string) {
  const position = await transaction.position.findUniqueOrThrow({
    where: { id: positionId },
    select: {
      openingQuantity: true,
      calculatedIncomeBrl: true,
      asset: { select: { quoteSymbol: true } },
      transactions: { select: { kind: true, quantity: true, amountBrl: true } },
    },
  });

  const plain = position.transactions.reduce((total, entry) => total.plus(quantityEffect(entry)), position.openingQuantity);
  // Não converter nem apagar os juros anteriores: seu valor permanece fixo.
  // A soma arredondada reproduz o último saldo em reais, inclusive numa
  // retirada total ou liquidação, sem deixar centavos/juros para trás.
  return position.asset.quoteSymbol ? plain : plain.plus(position.calculatedIncomeBrl).toDecimalPlaces(2);
}

/**
 * Recalcula a posição do mês a partir da base e de todas as movimentações dele:
 * quantidade, e o total pelo preço do mês (ou o próprio saldo em reais).
 */
export async function recomputePosition(transaction: Transaction, positionId: string, negativeMessage: string) {
  const [plain, position] = await Promise.all([
    quantityOf(transaction, positionId),
    transaction.position.findUniqueOrThrow({
      where: { id: positionId },
      select: {
        unitPriceBrl: true,
        calculationStartDate: true,
        asset: { select: { quoteSymbol: true, autoIncome: true } },
      },
    }),
  ]);

  if (plain.lessThan(0)) {
    throw new MonthEditError(negativeMessage);
  }

  // Com o rendimento automático (spec 079), a movimentação nova rende desde o
  // próprio dia: a posição é recalculada pela taxa até hoje.
  const cdi = automatic(position);
  const quantity = plain;

  let totalBrl: Prisma.Decimal;

  if (position.asset.quoteSymbol) {
    if (!position.unitPriceBrl) {
      throw new MonthEditError("Uma posição cotada está sem preço e não pode ser recalculada.");
    }
    totalBrl = quantity.mul(position.unitPriceBrl).toDecimalPlaces(2);
  } else {
    totalBrl = quantity.toDecimalPlaces(2);
  }

  await transaction.position.update({ where: { id: positionId }, data: { quantity, totalBrl } });

  if (cdi) {
    const [result] = await valueCdiPositions(transaction, { where: { id: positionId } });

    // Pelo cálculo, cada retirada sai do saldo do próprio dia.
    if (result?.state === "unavailable" && result.message === WITHDRAWAL_ABOVE_BALANCE) {
      throw new MonthEditError(negativeMessage);
    }
  }

  return { quantity, totalBrl };
}

type PositionForValues = Awaited<ReturnType<typeof findPosition>>;

/**
 * Confere e normaliza os campos da movimentação. Nos ativos cotados,
 * quantidade, preço executado e valor precisam fechar; no rendimento sem
 * quantidade (dividendos), só o valor. Nos saldos em reais, a quantidade é o
 * próprio valor.
 */
function parseValues(
  position: PositionForValues,
  referenceDate: Date,
  kind: PositionTransactionKind | TransactionKind,
  input: TransactionInput,
) {
  const occurredOn = parseOccurredOn(input.occurredOn, referenceDate);
  const amount = parseAmount(input.amountBrl);
  let quantity: Prisma.Decimal;
  let unitPriceBrl: Prisma.Decimal | null = null;

  if (!position.asset.quoteSymbol) {
    quantity = amount;
  } else {
    quantity = input.quantity ? parseNonNegativeDecimal(input.quantity, 12, "a quantidade") : new Prisma.Decimal(0);

    if (quantity.isZero() && kind !== PositionTransactionKind.INCOME) {
      throw new MonthEditError("Informe a quantidade movimentada.");
    }

    if (!quantity.isZero() && kind !== PositionTransactionKind.OPENING) {
      unitPriceBrl = input.unitPriceBrl
        ? parseNonNegativeDecimal(input.unitPriceBrl, 8, "o preço executado")
        : amount.div(quantity).toDecimalPlaces(8);

      if (quantity.mul(unitPriceBrl).minus(amount).abs().greaterThan(AMOUNT_TOLERANCE.plus(amount.mul("0.000001")))) {
        throw new MonthEditError("Quantidade, preço executado e valor não fecham. Revise os campos.");
      }
    }
  }

  return {
    kind: kind as PositionTransactionKind,
    occurredOn,
    quantity,
    unitPriceBrl,
    amountBrl: amount,
    note: input.note?.trim().slice(0, MAX_NOTE_LENGTH) || null,
  };
}

function parseOccurredOn(raw: string, referenceDate: Date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new MonthEditError("Informe o dia da movimentação.");
  }

  const day = new Date(`${raw}T00:00:00.000Z`);
  const today = calendarDay(new Date());

  if (Number.isNaN(day.getTime()) || toDateKey(day) !== raw) {
    throw new MonthEditError("Informe um dia válido para a movimentação.");
  }

  if (day < referenceDate || day > lastDayOf(referenceDate)) {
    throw new MonthEditError("O dia da movimentação precisa estar dentro da competência aberta.");
  }

  if (day > today) {
    throw new MonthEditError("A movimentação não pode ter dia no futuro.");
  }

  return day;
}

function parseAmount(raw: string) {
  const value = parseDecimal(raw.trim());

  if (!value || !value.greaterThan(0) || value.decimalPlaces() > 2) {
    throw new MonthEditError("Informe o valor em reais, maior que zero e com até dois centavos.");
  }

  return value;
}

function parseNonNegativeDecimal(raw: string, maxDecimals: number, field: string) {
  const value = parseDecimal(raw.trim());

  if (!value || value.lessThan(0) || value.decimalPlaces() > maxDecimals) {
    throw new MonthEditError(`Revise ${field}.`);
  }

  return value;
}
