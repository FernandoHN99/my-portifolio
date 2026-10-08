import assert from "node:assert/strict";
import { test } from "node:test";

import { monthBounds, type PayslipKind } from "@/modules/income/domain/income";
import {
  deductionLimitCents,
  pensionYears,
  summarizePensionYear,
  type PensionContribution,
  type WorkedPeriod,
} from "@/modules/pension/domain/pension";

// Spec 089: o limite de 12% da renda tributável por ano-base, como a aba
// Previdência do Excel (filtro "Ano Base"). Os meses trabalhados são os da
// tabela do usuário, com a correção de agosto/26 e as férias de setembro; os
// aportes são os sete da Grão FIM, que conferem com o backup de produção.

const ROWS: [string, string, string, number, boolean, PayslipKind?][] = [
  ["2025-01-01", "2025-01-31", "Accenture", 328250, false],
  ["2025-02-01", "2025-02-28", "Accenture", 328250, false],
  ["2025-03-01", "2025-03-02", "Accenture", 328250, true],
  ["2025-03-03", "2025-03-31", "NTT DATA", 700000, true],
  ["2025-04-01", "2025-04-30", "NTT DATA", 700000, false],
  ["2025-05-01", "2025-05-09", "NTT DATA", 700000, true],
  ["2025-05-12", "2025-05-31", "AMARIS", 1050000, true],
  ...["06", "07", "08", "09", "10", "11", "12"].map(
    (month): [string, string, string, number, boolean] => [`2025-${month}-01`, monthBounds(`2025-${month}`).last, "AMARIS", 1050000, false],
  ),
  ["2026-01-01", "2026-01-31", "AMARIS", 1050000, false],
  ["2026-02-01", "2026-02-28", "AMARIS", 1109570, false],
  ["2026-03-01", "2026-03-31", "AMARIS", 1179256, false],
  ["2026-04-01", "2026-04-30", "AMARIS", 1078035, false],
  ["2026-05-01", "2026-05-31", "AMARIS", 1159912, false],
  ["2026-06-01", "2026-06-30", "AMARIS", 1579322, false],
  ["2026-07-01", "2026-07-31", "AMARIS", 1229554, false],
  ["2026-08-01", "2026-08-31", "AMARIS", 1388427, false],
  ["2026-09-08", "2026-09-13", "AMARIS", 198939, false, "VACATION"],
  ["2026-09-01", "2026-09-30", "AMARIS", 1544355, false],
];

const PERIODS: WorkedPeriod[] = ROWS.map(([startsOn, endsOn, employer, grossCents, prorated, kind = "SALARY"], index) => ({
  id: String(index),
  month: startsOn.slice(0, 7),
  kind,
  label: null,
  employer,
  startsOn,
  endsOn,
  grossCents,
  prorated,
}));

const CONTRIBUTIONS: PensionContribution[] = (
  [
    ["2025-09-01", 510000, "OPENING"],
    ["2025-12-08", 728000, "CONTRIBUTION"],
    ["2026-03-12", 400000, "CONTRIBUTION"],
    ["2026-04-15", 300000, "CONTRIBUTION"],
    ["2026-06-09", 100000, "CONTRIBUTION"],
    ["2026-07-06", 200000, "CONTRIBUTION"],
    ["2026-09-02", 200000, "CONTRIBUTION"],
  ] as const
).map(([occurredOn, amountCents, kind]) => ({
  id: occurredOn,
  occurredOn,
  kind,
  amountCents,
  assetName: "Previdência - Grão FIM",
  institutionName: "Inter",
  accountId: "conta",
  assetId: "ativo",
}));

test("2025: o limite de 12% foi atingido, com R$ 1,94 a mais", () => {
  const year = summarizePensionYear(CONTRIBUTIONS, PERIODS, 2025);

  assert.equal(year.taxableCents, 10315050);
  assert.equal(year.limitCents, 1237806);
  assert.equal(year.contributedCents, 1238000);
  assert.equal(year.remainingCents, -194);
  assert.deepEqual(
    year.contributions.map((contribution) => [contribution.number, contribution.kind]),
    [
      [1, "OPENING"],
      [2, "CONTRIBUTION"],
    ],
  );
});

test("2026: faltam R$ 1.820,84 com os holerites até setembro", () => {
  const year = summarizePensionYear(CONTRIBUTIONS, PERIODS, 2026);

  assert.equal(year.taxableCents, 11517370);
  assert.equal(year.limitCents, 1382084);
  assert.equal(year.contributedCents, 1200000);
  assert.equal(year.remainingCents, 182084);
  assert.equal(year.periods.length, 10);
  // Na ordem da data inicial: o salário de setembro antes das férias.
  assert.deepEqual(year.periods.slice(-2).map((period) => period.kind), ["SALARY", "VACATION"]);
});

test("todos os anos juntos dão o total da tabela colada", () => {
  const all = summarizePensionYear(CONTRIBUTIONS, PERIODS, 2025).taxableCents + summarizePensionYear(CONTRIBUTIONS, PERIODS, 2026).taxableCents;
  assert.equal(all, 21832420);
});

test("13º salário e PLR aparecem no ano, mas fora da base", () => {
  const extra: WorkedPeriod[] = [
    { ...PERIODS[0], id: "13", kind: "THIRTEENTH", startsOn: "2026-12-01", endsOn: "2026-12-31", month: "2026-12", grossCents: 1000000 },
    { ...PERIODS[0], id: "plr", kind: "PROFIT_SHARING", startsOn: "2026-12-01", endsOn: "2026-12-31", month: "2026-12", grossCents: 500000 },
  ];
  const year = summarizePensionYear(CONTRIBUTIONS, [...PERIODS, ...extra], 2026);

  assert.equal(year.taxableCents, 11517370);
  assert.deepEqual(year.periods.filter((period) => !period.counted).map((period) => period.incomeCents), [1000000, 500000]);
});

test("limite arredondado aos centavos e anos com dados ou o atual", () => {
  assert.equal(deductionLimitCents(11517370), 1382084);
  assert.equal(deductionLimitCents(0), 0);
  assert.deepEqual(pensionYears(CONTRIBUTIONS, PERIODS, 2027), [2027, 2026, 2025]);
});
