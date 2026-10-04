// Movimentações das posições (spec 056). Sem dependências de banco, para servir
// ao servidor e ao formulário.

/** Tipos do formulário de movimentação (spec 057). */
export const TRANSACTION_KINDS = ["CONTRIBUTION", "WITHDRAWAL", "INCOME"] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];
/**
 * O saldo inicial só nasce com a posição: identifica o valor que ela já tinha
 * ao começar o acompanhamento, sem ser aporte, rendimento nem custo conhecido.
 */
export type StoredTransactionKind = TransactionKind | "OPENING";

export const TRANSACTION_LABELS: Record<StoredTransactionKind, string> = {
  OPENING: "Saldo inicial",
  CONTRIBUTION: "Aporte",
  WITHDRAWAL: "Retirada",
  INCOME: "Rendimento",
};

/** Movimentações registradas num mês (spec 058), para separar do que é estimado. */
export type RecordedMonth = {
  /** Aportes externos menos retiradas externas, em reais. */
  netFlowBrl: number;
  contributionsBrl: number;
  withdrawalsBrl: number;
  incomeBrl: number;
  /** Rendimento que mudou a quantidade/saldo; dividendos em dinheiro ficam fora. */
  capitalizedIncomeBrl: number;
  openingBrl: number;
  /** Entradas menos saídas de transferências internas (liquidação). */
  internalBrl: number;
  /** Efeito das operações na quantidade, sem o saldo inicial. */
  quantityDelta: number;
  /** Quantidade identificada como saldo inicial, sem custo conhecido. */
  openingQuantity: number;
  /** Movimentos para custo/avaliação, em ordem financeira crescente. */
  movements: RecordedMovement[];
  count: number;
};

export type RecordedMovement = {
  kind: StoredTransactionKind;
  amountBrl: number;
  quantity?: number;
  transferId: string | null;
  occurredOn?: string;
};

export function emptyRecordedMonth(): RecordedMonth {
  return {
    netFlowBrl: 0,
    contributionsBrl: 0,
    withdrawalsBrl: 0,
    incomeBrl: 0,
    capitalizedIncomeBrl: 0,
    openingBrl: 0,
    internalBrl: 0,
    quantityDelta: 0,
    openingQuantity: 0,
    movements: [],
    count: 0,
  };
}

/**
 * Soma as movimentações de cada mês (AAAA-MM): aportes, retiradas, rendimentos
 * e saldo inicial separados. O saldo inicial não é aporte nem rendimento.
 */
export function recordedByMonth(
  transactions: (RecordedMovement & { month: string })[],
) {
  const months = new Map<string, RecordedMonth>();

  for (const entry of transactions) {
    const month = months.get(entry.month) ?? emptyRecordedMonth();
    month.count += 1;
    month.movements.push(entry);

    if (entry.kind === "CONTRIBUTION") {
      if (entry.transferId) {
        month.internalBrl += entry.amountBrl;
      } else {
        month.contributionsBrl += entry.amountBrl;
        month.netFlowBrl += entry.amountBrl;
      }
    } else if (entry.kind === "WITHDRAWAL") {
      if (entry.transferId) {
        month.internalBrl -= entry.amountBrl;
      } else {
        month.withdrawalsBrl += entry.amountBrl;
        month.netFlowBrl -= entry.amountBrl;
      }
    } else if (entry.kind === "INCOME") {
      month.incomeBrl += entry.amountBrl;
      if (entry.quantity !== undefined && entry.quantity !== 0) {
        month.capitalizedIncomeBrl += entry.amountBrl;
      }
    } else {
      month.openingBrl += entry.amountBrl;
      month.openingQuantity += entry.quantity ?? 0;
    }

    if (entry.kind !== "OPENING") {
      const sign = entry.kind === "WITHDRAWAL" || entry.amountBrl < 0 ? -1 : 1;
      month.quantityDelta += sign * (entry.quantity ?? 0);
    }

    months.set(entry.month, month);
  }

  for (const month of months.values()) {
    // O histórico normalmente vem decrescente. Em dias iguais, preserve a
    // ordem fornecida; quem lê o banco inclui createdAt na ordenação crescente.
    month.movements.sort((left, right) => (left.occurredOn ?? "").localeCompare(right.occurredOn ?? ""));
    for (const key of ["netFlowBrl", "contributionsBrl", "withdrawalsBrl", "incomeBrl", "capitalizedIncomeBrl", "openingBrl", "internalBrl"] as const) {
      month[key] = round(month[key], 2);
    }
  }

  return months;
}

/**
 * Como a posição guarda o valor: `quoted` em unidades vezes o preço do mês
 * (ações, ETFs, cripto e o caixa em dólar, cotado pelo dólar); `balance`, o
 * saldo em reais, sem cotação (renda fixa, caixa em reais).
 */
export type PositionValueKind = "quoted" | "balance";

/** Variação da quantidade da posição: retirada tira; os demais põem. */
export function quantityDelta(kind: StoredTransactionKind, quantity: number) {
  return kind === "WITHDRAWAL" ? -quantity : quantity;
}

export type TrioField = "quantity" | "unitPrice" | "amount";

/**
 * Modos do formulário (spec 057): o valor desta operação ou o novo total da
 * posição, de que o app tira a diferença. Num ativo cotado, o novo total pode
 * ser a quantidade ou o valor de mercado, que a cotação do mês converte em
 * quantidade.
 */
export type MovementMode = "operation" | "total";
export type TotalTarget = "quantity" | "marketValue";

export type MovementInput = {
  kind: StoredTransactionKind;
  mode: MovementMode;
  totalTarget: TotalTarget;
  /** Ativo cotado (unidades × preço); falso nos saldos em reais. */
  quoted: boolean;
  current: { quantity: number; marketPrice: number | null };
  /** Valores digitados; nulos quando o campo não foi digitado. */
  typed: { quantity: number | null; unitPrice: number | null; amount: number | null; total: number | null };
  /** Campos do trio digitados, do mais recente para o mais antigo. */
  order: TrioField[];
};

export type MovementPlan = {
  kind: StoredTransactionKind;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  /** Campos preenchidos pelo app, e não digitados. */
  computed: TrioField[];
  /** Preço executado sugerido pela cotação do mês, por falta de um digitado. */
  suggestedPrice: boolean;
  /** Rendimento em dinheiro num ativo cotado, sem mudar a quantidade. */
  cashIncome: boolean;
  /** Quantidade depois da movimentação. */
  after: number;
  /** O que falta ou o que não fecha; nulo quando pode salvar. */
  issue: string | null;
};

const MONEY_TOLERANCE = 0.01;

/**
 * Resolve a movimentação a partir do que foi digitado (spec 057): calcula os
 * campos que faltam, aponta o dado que falta e mostra a divergência quando os
 * três campos digitados não fecham, sem trocar um número digitado.
 */
export function resolveMovement(input: MovementInput): MovementPlan {
  const { current, typed, quoted } = input;
  let kind = input.kind;
  let quantity: number | null = null;
  let unitPrice: number | null = null;
  let amount: number | null = null;
  const computed: TrioField[] = [];
  let suggestedPrice = false;
  let issue: string | null = null;
  const positive = (value: number | null) => value !== null && Number.isFinite(value) && value > 0;
  const price = () => {
    if (positive(typed.unitPrice)) {
      return typed.unitPrice;
    }

    if (positive(current.marketPrice)) {
      suggestedPrice = true;
      return current.marketPrice;
    }

    return null;
  };

  if (input.mode === "total") {
    // Novo total: a diferença para o saldo atual é a movimentação.
    const target =
      !quoted || input.totalTarget === "quantity"
        ? typed.total
        : positive(typed.total) && positive(current.marketPrice)
          ? typed.total! / current.marketPrice!
          : null;

    if (target === null || !Number.isFinite(target) || target < 0) {
      issue = quoted && input.totalTarget === "marketValue" ? "Informe o novo valor de mercado." : "Informe o novo total da posição.";
    } else {
      const difference = round(target - current.quantity, quoted ? 12 : 2);

      if (difference === 0) {
        issue = "O novo total é igual ao atual.";
      } else if (kind === "OPENING") {
        issue = difference < 0 ? "O saldo inicial não pode ser negativo." : null;
      } else if (difference < 0) {
        kind = "WITHDRAWAL";
      } else if (kind === "WITHDRAWAL") {
        kind = "CONTRIBUTION";
      }

      quantity = Math.abs(difference);

      if (quoted) {
        unitPrice = kind === "OPENING" ? null : price();
        amount = unitPrice !== null ? round(quantity * unitPrice, 2) : null;
        if (unitPrice === null && kind !== "OPENING") {
          issue ??= "Informe o preço executado.";
        }
        computed.push("quantity", "amount");
      } else {
        amount = quantity;
        computed.push("amount");
      }
    }
  } else if (!quoted) {
    amount = positive(typed.amount) ? typed.amount : null;
    quantity = amount;
    issue = amount === null ? "Informe o valor." : null;
  } else if (kind === "INCOME" && !positive(typed.quantity)) {
    // Dividendos e outros rendimentos em dinheiro: só o valor, sem unidades.
    amount = positive(typed.amount) ? typed.amount : null;
    quantity = 0;
    issue = amount === null ? "Informe o valor recebido." : null;
  } else {
    const known = input.order.filter((field) => positive(typed[field]));

    if (known.length >= 3) {
      quantity = typed.quantity;
      unitPrice = typed.unitPrice;
      amount = typed.amount;

      if (Math.abs(quantity! * unitPrice! - amount!) > MONEY_TOLERANCE + amount! * 1e-6) {
        issue = `Quantidade × preço dá ${formatPlain(quantity! * unitPrice!)}, diferente do valor digitado. Apague um dos três para o app calcular.`;
      }
    } else {
      const values = { quantity: typed.quantity, unitPrice: typed.unitPrice, amount: typed.amount };

      if (known.length === 1 && known[0] !== "unitPrice") {
        values.unitPrice = price();
        known.push("unitPrice");
      }

      if (known.length < 2) {
        issue = known[0] === "unitPrice" || !positive(current.marketPrice) ? "Informe a quantidade ou o valor da operação." : "Informe a quantidade ou o valor.";
        quantity = values.quantity;
        unitPrice = values.unitPrice;
        amount = values.amount;
      } else {
        const result = completeTrio(values, known);
        quantity = result.quantity;
        unitPrice = result.unitPrice;
        amount = result.amount;

        if (result.computed) {
          computed.push(result.computed);
        }
      }
    }
  }

  const cashIncome = quoted && kind === "INCOME" && quantity === 0;
  const delta = quantity ? quantityDelta(kind, quantity) : 0;
  const after = round(current.quantity + delta, quoted ? 12 : 2);

  if (!issue && after < 0) {
    issue = "A retirada é maior que a posição.";
  }

  return { kind, quantity, unitPrice, amount, computed, suggestedPrice, cashIncome, after, issue };
}

/**
 * Entrada versátil (spec 056): de quantidade, preço unitário e valor total,
 * os dois informados por último definem o terceiro. `order` traz os campos do
 * mais recente para o mais antigo.
 */
export function completeTrio(
  values: { quantity: number | null; unitPrice: number | null; amount: number | null },
  order: TrioField[],
) {
  const known = order.filter((field) => {
    const value = values[field];
    return value !== null && Number.isFinite(value) && value > 0;
  });
  const [first, second] = known;

  if (!first || !second) {
    return { ...values, computed: null as TrioField | null };
  }

  const computed = (["quantity", "unitPrice", "amount"] as const).find((field) => field !== first && field !== second)!;
  const next = { ...values };

  if (computed === "amount") {
    next.amount = round(values.quantity! * values.unitPrice!, 2);
  } else if (computed === "unitPrice") {
    next.unitPrice = round(values.amount! / values.quantity!, 8);
  } else {
    next.quantity = round(values.amount! / values.unitPrice!, 12);
  }

  return { ...next, computed };
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatPlain(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
