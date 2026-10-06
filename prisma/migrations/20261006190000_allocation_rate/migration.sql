-- Rentabilidade por classificação (spec 079): cada classificação pós-fixada ou
-- prefixada do rateio tem a própria taxa, no lugar da taxa única do ativo.
ALTER TABLE "position_allocations" ADD COLUMN "rate_percent" DECIMAL(9,4);

-- As taxas que já estavam no ativo passam às classificações do indexador dela.
UPDATE "position_allocations" AS allocation
SET "rate_percent" = asset."cdi_percent"
FROM "positions" AS position
JOIN "assets" AS asset ON asset."id" = position."asset_id"
WHERE allocation."position_id" = position."id"
  AND allocation."subclass" = 'Pós-fixado'
  AND asset."cdi_percent" IS NOT NULL;

UPDATE "position_allocations" AS allocation
SET "rate_percent" = asset."fixed_rate_percent"
FROM "positions" AS position
JOIN "assets" AS asset ON asset."id" = position."asset_id"
WHERE allocation."position_id" = position."id"
  AND allocation."subclass" = 'Prefixado'
  AND asset."fixed_rate_percent" IS NOT NULL;

ALTER TABLE "assets" DROP COLUMN "fixed_rate_percent";
