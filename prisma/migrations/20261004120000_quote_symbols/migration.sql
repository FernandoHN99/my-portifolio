-- Spec 053: cadastro dos símbolos cotados, lido e atualizado pelo job agendado.

-- CreateEnum
CREATE TYPE "QuoteSymbolStatus" AS ENUM ('PENDING', 'ACTIVE', 'ERROR');

-- CreateTable
CREATE TABLE "quote_symbols" (
    "symbol" TEXT NOT NULL,
    "instrument_type" TEXT NOT NULL,
    "base_currency" TEXT NOT NULL,
    "provider_id" TEXT,
    "status" "QuoteSymbolStatus" NOT NULL DEFAULT 'PENDING',
    "last_attempt_at" TIMESTAMPTZ(3),
    "last_success_at" TIMESTAMPTZ(3),
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "next_attempt_at" TIMESTAMPTZ(3),
    "history_synced_until" DATE,
    "history_attempted_at" TIMESTAMPTZ(3),
    "history_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quote_symbols_pkey" PRIMARY KEY ("symbol")
);

-- Cadastra os símbolos dos ativos existentes, com o tipo e a moeda da cotação
-- mais recente, como a atualização fazia. O histórico de quem já tem cotação
-- antes do mês corrente conta como carregado (a regra da spec 029); os demais
-- ficam com o histórico pendente para o job.
WITH "latest" AS (
    SELECT DISTINCT ON ("symbol") "symbol", "instrument_type", "base_currency"
    FROM (
        SELECT "symbol", "instrument_type", "base_currency", "reference_date" AS "day" FROM "market_quotes"
        UNION ALL
        SELECT "symbol", "instrument_type", "base_currency", "quote_date" AS "day" FROM "daily_quotes"
    ) AS "quotes"
    ORDER BY "symbol", "day" DESC
),
"used" AS (
    SELECT "quote_symbol" AS "symbol",
           (ARRAY_AGG("quote_provider_id" ORDER BY "created_at") FILTER (WHERE "quote_provider_id" IS NOT NULL))[1] AS "provider_id"
    FROM "assets"
    WHERE "quote_symbol" IS NOT NULL
    GROUP BY "quote_symbol"
)
INSERT INTO "quote_symbols" (
    "symbol", "instrument_type", "base_currency", "provider_id", "status",
    "last_attempt_at", "last_success_at", "history_synced_until", "updated_at"
)
SELECT
    "used"."symbol",
    "latest"."instrument_type",
    "latest"."base_currency",
    "used"."provider_id",
    CASE WHEN "fetched"."at" IS NULL THEN 'PENDING' ELSE 'ACTIVE' END::"QuoteSymbolStatus",
    "fetched"."at",
    "fetched"."at",
    CASE
        WHEN EXISTS (
            SELECT 1 FROM "market_quotes" AS "m"
            WHERE "m"."symbol" = "used"."symbol" AND "m"."reference_date" < DATE_TRUNC('month', CURRENT_DATE)
        ) OR EXISTS (
            SELECT 1 FROM "daily_quotes" AS "d"
            WHERE "d"."symbol" = "used"."symbol" AND "d"."quote_date" < DATE_TRUNC('month', CURRENT_DATE)
        )
        THEN (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::DATE
    END,
    CURRENT_TIMESTAMP
FROM "used"
JOIN "latest" ON "latest"."symbol" = "used"."symbol"
LEFT JOIN LATERAL (
    SELECT MAX("fetched_at") AS "at" FROM "daily_quotes" WHERE "daily_quotes"."symbol" = "used"."symbol"
) AS "fetched" ON TRUE;
