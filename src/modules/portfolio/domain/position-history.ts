// Histórico de uma posição ao longo das competências (spec 016).
//
// Uma posição é a combinação de conta e ativo, pelos identificadores; nomes e
// datas nunca servem de chave. Cada mês do calendário, da primeira à última
// competência, vira uma casa: "present" quando a posição existe na competência,
// "absent" quando a competência existe sem ela e "missing" quando o histórico
// não tem a competência. Ausências e meses sem competência são lacunas, nunca
// zero.
//
// A variação entre duas competências seguidas em que a posição existe é
// dividida em efeito de preço (quantidade anterior vezes a variação da cotação)
// e aportes e resgates (o restante, ou seja, a variação de quantidade valorizada
// pela cotação do mês em que aparece, mais o arredondamento em centavos). Só há
// efeito de preço entre duas competências em que a posição existe: a saída
// conta como resgate do último valor conhecido e a volta como aporte do primeiro
// valor. Saldos sem cotação não separam rendimento de aporte.

export type ObservedAllocation = {
  assetClass: string;
  subclass: string;
  duration: string;
  /** Peso em percentual (0 a 100). */
  weight: number;
};

export type PositionObservation = {
  /** Competência como AAAA-MM. */
  month: string;
  accountId: string;
  /** Instituição e conta, como "Ledger · Principal", para os textos. */
  accountLabel: string;
  quantity: number;
  unitPriceBrl: number | null;
  totalBrl: number;
  strategy: string | null;
  allocations: ObservedAllocation[];
};

export type PortfolioMonthTotal = {
  month: string;
  totalBrl: number;
};

export type AllocationSlice = ObservedAllocation & {
  valueBrl: number;
};

export type HistoryStep = {
  /** Competência anterior com a posição, sempre a competência existente imediatamente anterior. */
  fromMonth: string;
  /** Há meses sem competência entre as duas. */
  acrossMissing: boolean;
  changeBrl: number;
  changePercent: number | null;
  /** Quantidade anterior vezes a variação da cotação; nulo em saldos sem cotação. */
  priceEffectBrl: number | null;
  /** Variação de quantidade valorizada pela cotação do mês; nulo em saldos sem cotação. */
  flowBrl: number | null;
  /** Variação da cotação entre as duas competências, em percentual. */
  pricePercent: number | null;
};

export type MissingSlot = { kind: "missing"; month: string };

export type AbsentSlot = {
  kind: "absent";
  month: string;
  portfolioTotalBrl: number;
  /** Outras contas que tinham o ativo nesta competência. */
  elsewhere: string[];
  /** Resgate do último valor conhecido, na primeira competência sem a posição. */
  exitBrl: number | null;
};

export type PresentSlot = {
  kind: "present";
  month: string;
  portfolioTotalBrl: number;
  quantity: number;
  priceBrl: number | null;
  valueBrl: number;
  /** Participação no patrimônio do mês, em percentual. */
  share: number;
  accounts: string[];
  strategy: string | null;
  allocations: AllocationSlice[];
  /** Valor que entrou na volta à conta, quando a posição retorna depois de uma ausência. */
  entryBrl: number | null;
  step: HistoryStep | null;
  /** Entrada mais aportes menos resgates estimados, para ativos cotados. */
  appliedBrl: number | null;
};

export type HistorySlot = MissingSlot | AbsentSlot | PresentSlot;

export type StepHighlight = HistoryStep & { month: string };

export type PositionSummary = {
  selectedMonth: string;
  /** "before": a competência selecionada é anterior à primeira com a posição. */
  state: "present" | "absent" | "before" | "never";
  firstMonth: string | null;
  lastPresentMonth: string | null;
  /** Competência existente imediatamente anterior à selecionada. */
  previousMonth: string | null;
  previousPresent: boolean;
  current: PresentSlot | null;
  shareChange: number | null;
  monthStep: StepHighlight | null;
  startValueBrl: number | null;
  /** Valor na competência selecionada; zero quando a posição já saiu. */
  endValueBrl: number | null;
  priceGainBrl: number | null;
  flowsBrl: number | null;
  changeBrl: number | null;
  /**
   * Variação encadeada dentro dos trechos em que a posição existe: a cotação nos
   * ativos cotados e o saldo nos demais. Sem efeito das saídas e voltas.
   */
  growthPercent: number | null;
  /** Soma das variações dentro dos trechos, para saldos sem cotação. */
  heldChangeBrl: number | null;
  heldMonths: number;
  monthsSinceFirst: number;
  segments: number;
  stepCount: number;
  best: StepHighlight | null;
  worst: StepHighlight | null;
  averagePriceBrl: number | null;
  costBasisBrl: number | null;
};

const EPSILON = 1e-9;

export function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

export function monthFromKey(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

/** Meses do calendário entre duas competências, inclusive. */
export function calendarMonths(first: string, last: string) {
  const months: string[] = [];
  const end = monthFromKey(last).getTime();
  let cursor = monthFromKey(first);

  while (cursor.getTime() <= end) {
    months.push(monthKey(cursor));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  return months;
}

/**
 * Monta as casas do calendário para uma conta (`scopeAccountId`) ou para todas
 * as contas do ativo (`null`). As observações são de todas as contas, para
 * dizer onde o ativo estava quando a posição falta na conta.
 */
export function buildHistorySlots({
  months,
  observations,
  scopeAccountId,
  quoted,
}: {
  months: PortfolioMonthTotal[];
  observations: PositionObservation[];
  scopeAccountId: string | null;
  quoted: boolean;
}): HistorySlot[] {
  if (months.length === 0) {
    return [];
  }

  const sorted = [...months].sort((left, right) => left.month.localeCompare(right.month));
  const totals = new Map(sorted.map((entry) => [entry.month, entry.totalBrl]));
  const byMonth = new Map<string, PositionObservation[]>();

  for (const observation of observations) {
    const list = byMonth.get(observation.month) ?? [];
    list.push(observation);
    byMonth.set(observation.month, list);
  }

  const slots: HistorySlot[] = [];
  let previous: PresentSlot | null = null;
  let broken = false;
  let missingSincePrevious = false;
  let applied: number | null = null;

  for (const month of calendarMonths(sorted[0].month, sorted.at(-1)!.month)) {
    const portfolioTotal = totals.get(month);

    if (portfolioTotal === undefined) {
      slots.push({ kind: "missing", month });
      missingSincePrevious = true;
      continue;
    }

    const monthObservations = byMonth.get(month) ?? [];
    const inScope = monthObservations.filter(
      (observation) => scopeAccountId === null || observation.accountId === scopeAccountId,
    );

    if (inScope.length === 0) {
      const exitBrl: number | null = previous && !broken ? -previous.valueBrl : null;

      if (exitBrl !== null && applied !== null) {
        applied += exitBrl;
      }

      slots.push({
        kind: "absent",
        month,
        portfolioTotalBrl: portfolioTotal,
        elsewhere: [...new Set(monthObservations.map((observation) => observation.accountLabel))],
        exitBrl,
      });

      if (previous) {
        broken = true;
      }

      continue;
    }

    const slot = aggregate(month, portfolioTotal, inScope, quoted);

    if (!previous) {
      applied = quoted ? slot.valueBrl : null;
    } else if (broken) {
      slot.entryBrl = slot.valueBrl;

      if (applied !== null) {
        applied += slot.valueBrl;
      }
    } else {
      slot.step = computeStep(previous, slot, missingSincePrevious, quoted);

      if (applied !== null && slot.step.flowBrl !== null) {
        applied += slot.step.flowBrl;
      }
    }

    slot.appliedBrl = applied;
    slots.push(slot);
    previous = slot;
    broken = false;
    missingSincePrevious = false;
  }

  return slots;
}

function aggregate(
  month: string,
  portfolioTotal: number,
  observations: PositionObservation[],
  quoted: boolean,
): PresentSlot {
  const quantity = observations.reduce((total, observation) => total + observation.quantity, 0);
  const valueBrl = roundCents(observations.reduce((total, observation) => total + observation.totalBrl, 0));
  const priced = observations.filter((observation) => observation.unitPriceBrl !== null);
  // Mesma cotação em todas as contas do mês; a média pela quantidade evita o
  // arredondamento em centavos que a divisão do total traria.
  const priceBrl =
    quoted && priced.length === observations.length && quantity > EPSILON
      ? priced.reduce((total, observation) => total + observation.quantity * observation.unitPriceBrl!, 0) / quantity
      : quoted && priced.length > 0
        ? priced[0].unitPriceBrl
        : null;

  const slices = new Map<string, AllocationSlice>();

  for (const observation of observations) {
    for (const allocation of observation.allocations) {
      const key = `${allocation.assetClass}\u0000${allocation.subclass}\u0000${allocation.duration}`;
      const current = slices.get(key) ?? { ...allocation, weight: 0, valueBrl: 0 };
      current.valueBrl += (observation.totalBrl * allocation.weight) / 100;
      slices.set(key, current);
    }
  }

  const allocations = [...slices.values()]
    .map((slice) => ({ ...slice, weight: valueBrl === 0 ? 0 : (slice.valueBrl / valueBrl) * 100 }))
    .sort((left, right) => right.valueBrl - left.valueBrl);

  const largest = [...observations].sort((left, right) => right.totalBrl - left.totalBrl)[0];

  return {
    kind: "present",
    month,
    portfolioTotalBrl: portfolioTotal,
    quantity,
    priceBrl,
    valueBrl,
    share: portfolioTotal === 0 ? 0 : (valueBrl / portfolioTotal) * 100,
    accounts: [...new Set(observations.map((observation) => observation.accountLabel))],
    strategy: largest.strategy,
    allocations,
    entryBrl: null,
    step: null,
    appliedBrl: null,
  };
}

function computeStep(previous: PresentSlot, current: PresentSlot, acrossMissing: boolean, quoted: boolean): HistoryStep {
  const changeBrl = roundCents(current.valueBrl - previous.valueBrl);
  const hasPrices = quoted && previous.priceBrl !== null && current.priceBrl !== null;
  const priceEffectBrl = hasPrices ? roundCents(previous.quantity * (current.priceBrl! - previous.priceBrl!)) : null;

  return {
    fromMonth: previous.month,
    acrossMissing,
    changeBrl,
    changePercent: Math.abs(previous.valueBrl) < EPSILON ? null : (changeBrl / previous.valueBrl) * 100,
    priceEffectBrl,
    flowBrl: priceEffectBrl === null ? null : roundCents(changeBrl - priceEffectBrl),
    pricePercent:
      hasPrices && Math.abs(previous.priceBrl!) > EPSILON ? (current.priceBrl! / previous.priceBrl! - 1) * 100 : null,
  };
}

/** Indicadores da posição até a competência selecionada, inclusive. */
export function summarizeHistory(slots: HistorySlot[], selectedMonth: string, quoted: boolean): PositionSummary {
  const selectedIndex = slots.findIndex((slot) => slot.month === selectedMonth);
  const firstIndex = slots.findIndex((slot) => slot.kind === "present");
  const empty: PositionSummary = {
    selectedMonth,
    state: firstIndex === -1 ? "never" : "before",
    firstMonth: null,
    lastPresentMonth: null,
    previousMonth: null,
    previousPresent: false,
    current: null,
    shareChange: null,
    monthStep: null,
    startValueBrl: null,
    endValueBrl: null,
    priceGainBrl: null,
    flowsBrl: null,
    changeBrl: null,
    growthPercent: null,
    heldChangeBrl: null,
    heldMonths: 0,
    monthsSinceFirst: 0,
    segments: 0,
    stepCount: 0,
    best: null,
    worst: null,
    averagePriceBrl: null,
    costBasisBrl: null,
  };

  if (selectedIndex === -1 || firstIndex === -1) {
    return empty;
  }

  const previousIndex = findLastIndex(slots, selectedIndex - 1, (slot) => slot.kind !== "missing");
  const previous = previousIndex === -1 ? null : slots[previousIndex];
  const selected = slots[selectedIndex];

  if (firstIndex > selectedIndex) {
    return {
      ...empty,
      previousMonth: previous?.month ?? null,
    };
  }

  let start: number | null = null;
  let priceGain = 0;
  let flows = 0;
  let growth = 1;
  let heldChange = 0;
  let held = 0;
  let sinceFirst = 0;
  let segments = 0;
  let cost = 0;
  let costQuantity = 0;
  let lastPresent: PresentSlot | null = null;
  const steps: StepHighlight[] = [];

  for (const slot of slots.slice(firstIndex, selectedIndex + 1)) {
    if (slot.kind === "missing") {
      continue;
    }

    sinceFirst += 1;

    if (slot.kind === "absent") {
      if (slot.exitBrl !== null) {
        flows += slot.exitBrl;
        cost = 0;
        costQuantity = 0;
      }

      continue;
    }

    held += 1;

    if (start === null) {
      start = slot.valueBrl;
      segments = 1;
      cost = slot.valueBrl;
      costQuantity = slot.quantity;
    } else if (slot.entryBrl !== null) {
      flows += slot.entryBrl;
      segments += 1;
      cost = slot.valueBrl;
      costQuantity = slot.quantity;
    } else if (slot.step && lastPresent) {
      steps.push({ ...slot.step, month: slot.month });
      heldChange += slot.step.changeBrl;

      if (quoted && slot.step.priceEffectBrl !== null && slot.step.flowBrl !== null) {
        priceGain += slot.step.priceEffectBrl;
        flows += slot.step.flowBrl;
      } else {
        flows += slot.step.changeBrl;
      }

      const ratio = quoted
        ? lastPresent.priceBrl && slot.priceBrl !== null
          ? slot.priceBrl / lastPresent.priceBrl
          : null
        : Math.abs(lastPresent.valueBrl) > EPSILON
          ? slot.valueBrl / lastPresent.valueBrl
          : null;

      if (ratio !== null) {
        growth *= ratio;
      }

      // Custo médio: aumentos de quantidade entram pela cotação do mês e
      // reduções saem pelo preço médio.
      const delta = slot.quantity - costQuantity;

      if (delta > EPSILON && slot.priceBrl !== null) {
        cost += delta * slot.priceBrl;
      } else if (delta < -EPSILON && costQuantity > EPSILON) {
        cost -= (cost / costQuantity) * -delta;
      }

      costQuantity = slot.quantity;
    }

    lastPresent = slot;
  }

  const current = selected.kind === "present" ? selected : null;
  const end = current ? current.valueBrl : 0;
  const ranked = [...steps].sort((left, right) => metric(right, quoted) - metric(left, quoted));
  const previousPresent = previous?.kind === "present";

  return {
    selectedMonth,
    state: current ? "present" : "absent",
    firstMonth: slots[firstIndex].month,
    lastPresentMonth: lastPresent?.month ?? null,
    previousMonth: previous?.month ?? null,
    previousPresent,
    current,
    shareChange:
      current && previous && previous.kind === "present" ? current.share - previous.share : null,
    monthStep: current?.step ? { ...current.step, month: current.month } : null,
    startValueBrl: start,
    endValueBrl: end,
    priceGainBrl: quoted ? roundCents(priceGain) : null,
    flowsBrl: quoted ? roundCents(flows) : null,
    changeBrl: start === null ? null : roundCents(end - start),
    growthPercent: steps.length === 0 ? null : (growth - 1) * 100,
    heldChangeBrl: steps.length === 0 ? null : roundCents(heldChange),
    heldMonths: held,
    monthsSinceFirst: sinceFirst,
    segments,
    stepCount: steps.length,
    best: ranked.length >= 2 ? ranked[0] : null,
    worst: ranked.length >= 2 ? ranked.at(-1)! : null,
    averagePriceBrl:
      quoted && current && costQuantity > EPSILON ? cost / costQuantity : null,
    costBasisBrl: quoted && current ? roundCents(cost) : null,
  };
}

function metric(step: HistoryStep, quoted: boolean) {
  return quoted && step.priceEffectBrl !== null ? step.priceEffectBrl : step.changeBrl;
}

function findLastIndex<T>(items: T[], from: number, predicate: (item: T) => boolean) {
  for (let index = from; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return index;
    }
  }

  return -1;
}

function roundCents(value: number) {
  return Math.round(value * 100) / 100;
}
