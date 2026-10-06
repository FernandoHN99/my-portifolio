import assert from "node:assert/strict";
import { test } from "node:test";

import { businessDaysBetween, easterSunday, isBusinessDay } from "@/modules/portfolio/domain/business-days";
import { calculateCdiMonth, calculateIncomeMonth, calculatePrefixedMonth } from "@/modules/portfolio/domain/cdi-valuation";
import { autoIncomeParts, incomeParts, indexerOfSubclass } from "@/modules/portfolio/domain/fixed-income-policy";

// Spec 079: rendimento automático como nos bancos. Dias úteis com os feriados
// nacionais (base 252), cada movimentação rendendo desde o próprio dia.

const round = (value: number) => Math.round(value * 100) / 100;

test("feriados nacionais móveis e fixos de 2026", () => {
  assert.equal(easterSunday(2026), "2026-04-05");
  for (const holiday of ["2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03", "2026-04-21", "2026-06-04", "2026-10-12", "2026-11-20", "2026-12-25"]) {
    assert.equal(isBusinessDay(holiday), false, holiday);
  }
  assert.equal(isBusinessDay("2026-02-18"), true);
  assert.equal(isBusinessDay("2026-10-10"), false);
  // Sexta 13/02 e quarta 18/02: o Carnaval e o fim de semana ficam de fora.
  assert.equal(businessDaysBetween("2026-02-13", "2026-02-19"), 2);
  // Outubro de 2026: 22 dias de semana, menos 12/10.
  assert.equal(businessDaysBetween("2026-10-01", "2026-11-01"), 21);
});

test("prefixado: (1 + taxa)^(dias úteis/252), cada aporte desde o próprio dia", () => {
  const result = calculatePrefixedMonth({
    openingBalance: "10000",
    startDate: "2026-10-01",
    asOf: "2026-11-01",
    annualPercent: "12",
    movements: [{ date: "2026-10-15", kind: "CONTRIBUTION", amount: "1000" }],
  });
  assert.equal(result.state, "calculated");
  if (result.state !== "calculated") return;
  const factor = (days: number) => Math.pow(1.12, days / 252);
  const expected = 10000 * factor(21) + 1000 * factor(businessDaysBetween("2026-10-15", "2026-11-01"));
  assert.equal(Number(result.balance), round(expected));
  assert.equal(result.rateDays, 21);
  assert.equal(result.lastRateDate, "2026-10-30");
  assert.equal(round(Number(result.income)), round(expected - 11000));
});

test("prefixado: a retirada sai no dia dela e o resto continua rendendo", () => {
  const result = calculatePrefixedMonth({
    openingBalance: "5000",
    startDate: "2026-10-01",
    asOf: "2026-10-06",
    annualPercent: "10",
    movements: [{ date: "2026-10-02", kind: "WITHDRAWAL", amount: "1000" }],
  });
  assert.equal(result.state, "calculated");
  if (result.state !== "calculated") return;
  // 01/10 rende sobre 5.000; 02/10 e 05/10, sobre o que sobrou.
  const daily = Math.pow(1.1, 1 / 252);
  assert.equal(Number(result.balance), round((5000 * daily - 1000) * daily * daily));
});

test("pós-fixado: o CDI de cada dia útil vezes o percentual", () => {
  const result = calculateCdiMonth({
    openingBalance: "10000",
    startDate: "2026-10-01",
    asOf: "2026-10-06",
    cdiPercent: "110",
    movements: [],
    rates: ["2026-10-01", "2026-10-02", "2026-10-05"].map((date) => ({ date, dailyPercent: "0.055131" })),
    verifiedCoverage: [{ from: "2026-09-01", through: "2026-10-05" }],
  });
  assert.equal(result.state, "calculated");
  if (result.state !== "calculated") return;
  assert.equal(Number(result.balance), round(10000 * Math.pow(1 + 0.00055131 * 1.1, 3)));
  assert.equal(result.lastRateDate, "2026-10-05");
});

test("cada classificação rende pela própria taxa, na proporção do peso", () => {
  const rates = ["2026-10-01", "2026-10-02", "2026-10-05"].map((date) => ({ date, dailyPercent: "0.050788" }));
  const result = calculateIncomeMonth({
    openingBalance: "10000",
    startDate: "2026-10-01",
    asOf: "2026-10-06",
    movements: [],
    parts: [
      { indexer: "CDI", weight: "0.6", ratePercent: "100" },
      { indexer: "PRE", weight: "0.4", ratePercent: "12" },
    ],
    rates,
    verifiedCoverage: [{ from: "2026-10-01", through: "2026-10-05" }],
  });
  assert.equal(result.state, "calculated");
  if (result.state !== "calculated") return;
  // A posição fica dividida pelos pesos: o fator do dia é a média ponderada.
  const daily = 0.6 * (1 + 0.00050788) + 0.4 * Math.pow(1.12, 1 / 252);
  assert.equal(Number(result.balance), round(10000 * Math.pow(daily, 3)));
});

test("uma movimentação depois da última taxa entra no saldo e rende quando a taxa chegar", () => {
  const result = calculateCdiMonth({
    openingBalance: "1000",
    startDate: "2026-10-01",
    asOf: "2026-10-02",
    cdiPercent: "100",
    movements: [{ date: "2026-10-05", kind: "CONTRIBUTION", amount: "500" }],
    rates: [{ date: "2026-10-01", dailyPercent: "0.05" }],
    verifiedCoverage: [{ from: "2026-10-01", through: "2026-10-01" }],
  });
  assert.equal(result.state, "calculated");
  if (result.state !== "calculated") return;
  assert.equal(result.balance, "1500.50");
});

test("a flag liga o cálculo só com a taxa em cada classificação e sem cotação de mercado", () => {
  assert.equal(indexerOfSubclass("Pós-fixado"), "CDI");
  assert.equal(indexerOfSubclass("Prefixado"), "PRE");
  assert.equal(indexerOfSubclass("IPCA"), null);
  const post = { subclass: "Pós-fixado", weight: "0.7", ratePercent: "105" };
  const pre = { subclass: "Prefixado", weight: "0.3", ratePercent: "12" };
  assert.deepEqual(incomeParts([post, pre]), [
    { indexer: "CDI", weight: "0.7", ratePercent: "105" },
    { indexer: "PRE", weight: "0.3", ratePercent: "12" },
  ]);
  // Uma classificação sem taxa ou sem cálculo automático desliga tudo.
  assert.equal(incomeParts([post, { ...pre, ratePercent: null }]), null);
  assert.equal(incomeParts([post, { subclass: "IPCA", weight: "0.3", ratePercent: null }]), null);
  assert.ok(autoIncomeParts({ autoIncome: true, quoteSymbol: null }, [post]));
  assert.equal(autoIncomeParts({ autoIncome: false, quoteSymbol: null }, [post]), null);
  assert.equal(autoIncomeParts({ autoIncome: true, quoteSymbol: "USD" }, [post]), null);
});
