import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildHistorySlots,
  summarizeHistory,
  type PositionObservation,
  type PresentSlot,
} from "@/modules/portfolio/domain/position-history";
import { emptyRecordedMonth, recordedByMonth, type StoredTransactionKind } from "@/modules/portfolio/domain/position-transactions";

// Spec 073: valor aplicado, rendimento e preço médio pelas movimentações, com o
// saldo inicial valendo como aplicação. Dados fictícios.

type Movement = { month: string; kind: StoredTransactionKind; quantity: number; amountBrl: number; occurredOn: string };

function history(
  months: { month: string; quantity: number; opening: number; price: number | null }[],
  movements: Movement[],
  quoted: boolean,
) {
  const recorded = recordedByMonth(movements.map((entry) => ({ ...entry, transferId: null })));
  const observations: PositionObservation[] = months.map((entry) => ({
    month: entry.month,
    accountId: "conta",
    accountLabel: "Banco",
    quantity: entry.quantity,
    openingQuantity: entry.opening,
    recorded: recorded.get(entry.month) ?? emptyRecordedMonth(),
    unitPriceBrl: entry.price,
    totalBrl: entry.price === null ? entry.quantity : entry.quantity * entry.price,
    strategy: null,
    allocations: [],
  }));
  const slots = buildHistorySlots({
    months: months.map((entry) => ({ month: entry.month, totalBrl: 100_000 })),
    observations,
    scopeAccountId: "conta",
    quoted,
  });
  return { slots, at: (month: string) => summarizeHistory(slots, month, quoted) };
}

test("saldo em reais: saldo inicial e aportes somam, o rendimento não, a retirada tira a parte proporcional e realiza o ganho", () => {
  const { slots, at } = history(
    [
      { month: "2026-01", quantity: 1000, opening: 0, price: null },
      { month: "2026-02", quantity: 1510, opening: 1000, price: null },
      { month: "2026-03", quantity: 1510, opening: 1510, price: null },
      { month: "2026-04", quantity: 755, opening: 1510, price: null },
    ],
    [
      { month: "2026-01", kind: "OPENING", quantity: 1000, amountBrl: 1000, occurredOn: "2026-01-31" },
      { month: "2026-02", kind: "CONTRIBUTION", quantity: 500, amountBrl: 500, occurredOn: "2026-02-10" },
      { month: "2026-02", kind: "INCOME", quantity: 10, amountBrl: 10, occurredOn: "2026-02-28" },
      { month: "2026-04", kind: "WITHDRAWAL", quantity: 755, amountBrl: 755, occurredOn: "2026-04-10" },
    ],
    false,
  );
  const present = slots.filter((slot): slot is PresentSlot => slot.kind === "present");
  assert.deepEqual(present.map((slot) => slot.appliedBrl), [1000, 1500, 1500, 750]);
  // Um mês acompanhado sem movimentações é registrado, não estimado.
  assert.equal(present[2].source, "recorded");
  assert.equal(at("2026-02").gainBrl, 10);
  // A retirada leva metade do rendimento como lucro realizado (spec 076): o
  // rendimento da posição continua sendo os R$ 10 que ela rendeu.
  assert.equal(present[3].realizedBrl, 5);
  assert.equal(at("2026-04").gainBrl, 10);
  assert.equal(at("2026-01").startValueBrl, 1000);
  assert.equal(at("2026-04").costSource, "opening");
});

test("rendimento negativo reduz o saldo sem mexer no valor aplicado", () => {
  const { at } = history(
    [
      { month: "2026-01", quantity: 2000, opening: 0, price: null },
      { month: "2026-02", quantity: 1900, opening: 2000, price: null },
    ],
    [
      { month: "2026-01", kind: "OPENING", quantity: 2000, amountBrl: 2000, occurredOn: "2026-01-31" },
      { month: "2026-02", kind: "INCOME", quantity: 100, amountBrl: -100, occurredOn: "2026-02-28" },
    ],
    false,
  );
  assert.equal(at("2026-02").appliedBrl, 2000);
  assert.equal(at("2026-02").gainBrl, -100);
});

test("ativo cotado: preço médio pelo custo, staking sem custo e venda pelo preço médio", () => {
  const { at } = history(
    [
      { month: "2026-01", quantity: 10, opening: 0, price: 30 },
      { month: "2026-02", quantity: 12.5, opening: 10, price: 40 },
      { month: "2026-03", quantity: 6.25, opening: 12.5, price: 50 },
    ],
    [
      { month: "2026-01", kind: "OPENING", quantity: 10, amountBrl: 300, occurredOn: "2026-01-31" },
      { month: "2026-02", kind: "CONTRIBUTION", quantity: 2, amountBrl: 50, occurredOn: "2026-02-05" },
      { month: "2026-02", kind: "INCOME", quantity: 0.5, amountBrl: 20, occurredOn: "2026-02-20" },
      { month: "2026-03", kind: "WITHDRAWAL", quantity: 6.25, amountBrl: 312.5, occurredOn: "2026-03-10" },
    ],
    true,
  );
  const february = at("2026-02");
  assert.equal(february.appliedBrl, 350);
  assert.equal(february.averagePriceBrl, 350 / 12.5);
  assert.equal(february.gainBrl, 12.5 * 40 - 350);
  const march = at("2026-03");
  assert.equal(march.appliedBrl, 175);
  assert.equal(march.averagePriceBrl, 28);
  assert.equal(march.costSource, "opening");
  // Vendeu metade por R$ 312,50 com custo de R$ 175: o ganho realizado soma ao
  // que continua na posição.
  assert.equal(march.gainBrl, 6.25 * 50 - 175 + (312.5 - 175));
});

test("retirada total liquida a posição: ela fica no mês da saída, com o resultado", () => {
  const { slots, at } = history(
    [
      { month: "2026-01", quantity: 1000, opening: 0, price: null },
      { month: "2026-02", quantity: 1020, opening: 1000, price: null },
      { month: "2026-03", quantity: 0, opening: 1020, price: null },
    ],
    [
      { month: "2026-01", kind: "OPENING", quantity: 1000, amountBrl: 1000, occurredOn: "2026-01-31" },
      { month: "2026-02", kind: "INCOME", quantity: 20, amountBrl: 20, occurredOn: "2026-02-28" },
      { month: "2026-03", kind: "WITHDRAWAL", quantity: 1020, amountBrl: 1020, occurredOn: "2026-03-01" },
    ],
    false,
  );
  const present = slots.filter((slot): slot is PresentSlot => slot.kind === "present");
  assert.deepEqual(present.map((slot) => slot.liquidated), [false, false, true]);
  assert.equal(present[2].liquidatedOn, "2026-03-01");
  const march = at("2026-03");
  assert.equal(march.current?.valueBrl, 0);
  assert.equal(march.appliedBrl, 0);
  assert.equal(march.gainBrl, 20);
  // A saída explica toda a variação do mês: nada sem registro.
  assert.equal(march.monthStep?.flowBrl, -1020);
  assert.equal(march.monthStep?.unexplainedBrl, 0);
});

test("retirada total de um ativo cotado pelo último valor não inventa efeito de preço", () => {
  const { at } = history(
    [
      { month: "2026-01", quantity: 2, opening: 0, price: 100 },
      { month: "2026-02", quantity: 0, opening: 2, price: 100 },
    ],
    [
      { month: "2026-01", kind: "OPENING", quantity: 2, amountBrl: 150, occurredOn: "2026-01-31" },
      { month: "2026-02", kind: "WITHDRAWAL", quantity: 2, amountBrl: 200, occurredOn: "2026-02-01" },
    ],
    true,
  );
  const february = at("2026-02");
  assert.equal(february.current?.liquidated, true);
  assert.equal(february.gainBrl, 50);
  assert.equal(february.monthStep?.priceEffectBrl, 0);
});

test("só aportes, sem saldo inicial, dão preço médio de compra conhecido", () => {
  const { at } = history(
    [{ month: "2026-01", quantity: 4, opening: 0, price: 25 }],
    [{ month: "2026-01", kind: "CONTRIBUTION", quantity: 4, amountBrl: 90, occurredOn: "2026-01-15" }],
    true,
  );
  assert.equal(at("2026-01").costSource, "known");
  assert.equal(at("2026-01").averagePriceBrl, 22.5);
});
