-- Altcoins como moeda base (spec 036): criptos que não são o BTC deixam de
-- contar como dólar. Vale para os ativos cotados pela CoinGecko e para as
-- cotações deles; ativos antigos com ticker USD ficam como estão até o passo
-- pré-produção.
UPDATE "assets"
SET "base_currency" = 'Altcoins'
WHERE "quote_symbol" IS NOT NULL
  AND "quote_symbol" <> 'BTC'
  AND "base_currency" = 'USD'
  AND "quote_symbol" IN (
    SELECT "symbol" FROM "market_quotes" WHERE "instrument_type" = 'CRIPTO'
    UNION
    SELECT "symbol" FROM "daily_quotes" WHERE "instrument_type" = 'CRIPTO'
  );

UPDATE "market_quotes"
SET "base_currency" = 'Altcoins'
WHERE "instrument_type" = 'CRIPTO' AND "symbol" <> 'BTC' AND "base_currency" = 'USD';

UPDATE "daily_quotes"
SET "base_currency" = 'Altcoins'
WHERE "instrument_type" = 'CRIPTO' AND "symbol" <> 'BTC' AND "base_currency" = 'USD';

-- Metas: a meta de dólar dentro de Cripto cobria as altcoins. Uma versão nova
-- do plano ativo passa esse percentual para "Cripto · Altcoins", zera
-- "Cripto · USD" e cria "Altcoins" com 0% na moeda geral, para o usuário ajustar
-- na configuração. A versão importada da planilha não muda. Sem plano ativo,
-- ou com as altcoins já presentes, nada acontece.
DO $$
DECLARE
  active_id uuid;
  new_id uuid := gen_random_uuid();
BEGIN
  SELECT "id" INTO active_id FROM "target_plans" WHERE "is_active" ORDER BY "created_at" DESC LIMIT 1;

  IF active_id IS NULL OR EXISTS (
    SELECT 1 FROM "allocation_targets" WHERE "plan_id" = active_id AND "key" = 'CURRENCY:altcoins'
  ) THEN
    RETURN;
  END IF;

  UPDATE "target_plans" SET "is_active" = false WHERE "is_active";

  INSERT INTO "target_plans" ("id", "name", "is_active", "tolerance_percent", "created_at", "updated_at")
  SELECT new_id, 'Altcoins separadas do dólar', true, "tolerance_percent", now(), now()
  FROM "target_plans" WHERE "id" = active_id;

  INSERT INTO "allocation_targets" ("id", "plan_id", "key", "scope", "primary_label", "secondary_label", "percentage", "source_sheet", "source_cell")
  SELECT gen_random_uuid(), new_id, "key", "scope", "primary_label", "secondary_label",
    CASE WHEN "key" = 'CLASS_CURRENCY:cripto:usd' THEN 0 ELSE "percentage" END,
    CASE WHEN "key" = 'CLASS_CURRENCY:cripto:usd' THEN NULL ELSE "source_sheet" END,
    CASE WHEN "key" = 'CLASS_CURRENCY:cripto:usd' THEN NULL ELSE "source_cell" END
  FROM "allocation_targets" WHERE "plan_id" = active_id;

  INSERT INTO "allocation_targets" ("id", "plan_id", "key", "scope", "primary_label", "secondary_label", "percentage")
  VALUES (gen_random_uuid(), new_id, 'CURRENCY:altcoins', 'CURRENCY', 'Altcoins', NULL, 0);

  INSERT INTO "allocation_targets" ("id", "plan_id", "key", "scope", "primary_label", "secondary_label", "percentage")
  SELECT gen_random_uuid(), new_id, 'CLASS_CURRENCY:cripto:altcoins', 'CLASS_CURRENCY', 'Cripto', 'Altcoins',
    COALESCE((SELECT "percentage" FROM "allocation_targets" WHERE "plan_id" = active_id AND "key" = 'CLASS_CURRENCY:cripto:usd'), 0);
END $$;
