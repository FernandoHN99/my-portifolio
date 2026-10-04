-- Spec 054: as metas são uma só por usuário, editada no lugar, sem versões.

-- As versões anteriores das metas deixam de existir; as metas de cada uma saem
-- junto (ON DELETE CASCADE).
DELETE FROM "target_plans" WHERE "is_active" = false;

-- A meta de moeda sobre o patrimônio total passa a ser calculada pela moeda
-- dentro de cada classe, ponderada pela meta da classe.
UPDATE "allocation_targets" AS "c"
SET "percentage" = ROUND(COALESCE((
    SELECT SUM("ac"."percentage" * "cc"."percentage")
    FROM "allocation_targets" AS "cc"
    JOIN "allocation_targets" AS "ac"
      ON "ac"."plan_id" = "cc"."plan_id"
     AND "ac"."scope" = 'ASSET_CLASS'
     AND "ac"."primary_label" = "cc"."primary_label"
    WHERE "cc"."plan_id" = "c"."plan_id"
      AND "cc"."scope" = 'CLASS_CURRENCY'
      AND "cc"."secondary_label" = "c"."primary_label"
), 0), 10)
WHERE "c"."scope" = 'CURRENCY';
