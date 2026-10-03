-- Spec 051: cotações automáticas compartilhadas, à mão por usuário e só
-- atualização automática.

-- A execução deixa de apontar para a competência de um usuário: guarda o mês
-- reprecificado, preenchido a partir da competência ligada antes.
ALTER TABLE "quote_refresh_runs" ADD COLUMN "repriced_month" DATE;
UPDATE "quote_refresh_runs" AS run
SET "repriced_month" = month."reference_date"
FROM "portfolio_months" AS month
WHERE month."id" = run."portfolio_month_id";

ALTER TABLE "quote_refresh_runs" DROP CONSTRAINT "quote_refresh_runs_portfolio_month_id_fkey";
ALTER TABLE "quote_refresh_runs" DROP COLUMN "portfolio_month_id";

-- Sem atualização manual: toda execução é automática.
ALTER TABLE "quote_refresh_runs" DROP COLUMN "trigger";
DROP TYPE "QuoteRefreshTrigger";

-- Cotação digitada por um usuário, que vale só para ele.
CREATE TABLE "manual_quotes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reference_date" DATE NOT NULL,
    "symbol" TEXT NOT NULL,
    "instrument_type" TEXT NOT NULL,
    "base_currency" TEXT NOT NULL,
    "value_brl" DECIMAL(24,8) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "manual_quotes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "manual_quotes_reference_date_symbol_idx" ON "manual_quotes"("reference_date", "symbol");
CREATE UNIQUE INDEX "manual_quotes_user_id_reference_date_symbol_key" ON "manual_quotes"("user_id", "reference_date", "symbol");
ALTER TABLE "manual_quotes" ADD CONSTRAINT "manual_quotes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
