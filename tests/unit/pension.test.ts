import assert from "node:assert/strict";
import { test } from "node:test";

import { defaultTaxable, monthBounds, type PayslipKind } from "@/modules/income/domain/income";
import {
  deductionLimitCents,
  limitUsagePercent,
  pensionYears,
  summarizePensionYear,
  usageSegments,
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
  taxable: defaultTaxable(kind),
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
    { ...PERIODS[0], id: "13", kind: "THIRTEENTH", taxable: false, startsOn: "2026-12-01", endsOn: "2026-12-31", month: "2026-12", grossCents: 1000000 },
    { ...PERIODS[0], id: "plr", kind: "PROFIT_SHARING", taxable: false, startsOn: "2026-12-01", endsOn: "2026-12-31", month: "2026-12", grossCents: 500000 },
  ];
  const year = summarizePensionYear(CONTRIBUTIONS, [...PERIODS, ...extra], 2026);

  assert.equal(year.taxableCents, 11517370);
  assert.deepEqual(year.periods.filter((period) => !period.counted).map((period) => period.incomeCents), [1000000, 500000]);
});

test("a marcação da linha manda: 13º marcado entra na base e salário desmarcado sai", () => {
  const thirteenth: WorkedPeriod = { ...PERIODS[0], id: "13", kind: "THIRTEENTH", taxable: true, startsOn: "2026-12-01", endsOn: "2026-12-31", month: "2026-12", grossCents: 1000000 };
  const withThirteenth = summarizePensionYear(CONTRIBUTIONS, [...PERIODS, thirteenth], 2026);
  assert.equal(withThirteenth.taxableCents, 11517370 + 1000000);
  assert.ok(withThirteenth.periods.every((period) => period.counted));

  const july = PERIODS.find((period) => period.startsOn === "2026-07-01")!;
  const withoutJuly = summarizePensionYear(CONTRIBUTIONS, PERIODS.map((period) => (period === july ? { ...period, taxable: false } : period)), 2026);
  assert.equal(withoutJuly.taxableCents, 11517370 - 1229554);
  assert.deepEqual(withoutJuly.periods.filter((period) => !period.counted).map((period) => period.incomeCents), [1229554]);
});

test("limite arredondado aos centavos e anos com dados ou o atual", () => {
  assert.equal(deductionLimitCents(11517370), 1382084);
  assert.equal(deductionLimitCents(0), 0);
  assert.deepEqual(pensionYears(CONTRIBUTIONS, PERIODS, 2027), [2027, 2026, 2025]);
});

test("acumulado de cada aporte e quanto do limite ele já usa", () => {
  const y2026 = summarizePensionYear(CONTRIBUTIONS, PERIODS, 2026);
  assert.deepEqual(
    y2026.contributions.map((contribution) => [contribution.cumulativeCents, contribution.usagePercent]),
    [
      [400000, 29],
      [700000, 51],
      [800000, 58],
      [1000000, 72],
      [1200000, 87],
    ],
  );
  assert.equal(y2026.usagePercent, 87);

  const y2025 = summarizePensionYear(CONTRIBUTIONS, PERIODS, 2025);
  assert.deepEqual(y2025.contributions.map((contribution) => contribution.cumulativeCents), [510000, 1238000]);
  assert.equal(y2025.usagePercent, 100);
});

test("a barra do limite: o que passa de R$ 12.378,06 em 2025 vira um trecho violeta de R$ 1,94", () => {
  const { segments, limitCents } = summarizePensionYear(CONTRIBUTIONS, PERIODS, 2025);

  assert.equal(limitCents, 1237806);
  assert.deepEqual(
    segments.map((segment) => [segment.id, segment.startCents, segment.endCents, segment.over]),
    [
      ["2025-09-01", 0, 510000, false],
      ["2025-12-08", 510000, 1237806, false],
      ["2025-12-08", 1237806, 1238000, true],
    ],
  );
  // Os trechos são contínuos: cada um começa onde o anterior terminou.
  assert.deepEqual(
    segments.slice(1).map((segment, index) => segment.startCents === segments[index].endCents),
    [true, true],
  );
});

test("limite e uso: sem holerites não há limite, e nada é marcado como acima dele", () => {
  assert.equal(limitUsagePercent(120000, 0), null);
  assert.equal(limitUsagePercent(0, 100000), 0);
  assert.equal(limitUsagePercent(150000, 100000), 150);

  const segments = usageSegments(
    [
      { id: "a", amountCents: 100 },
      { id: "b", amountCents: 250 },
    ],
    0,
  );
  assert.deepEqual(segments.map((segment) => segment.over), [false, false]);
  assert.equal(segments.at(-1)?.endCents, 350);
  assert.equal(summarizePensionYear(CONTRIBUTIONS, [], 2026).usagePercent, null);
});
