-- Spec 060: base financeira explícita por competência e CDI diário separado
-- das cotações. Preserva os saldos conhecidos e não ativa cálculo no legado.
ALTER TABLE "positions"
  ADD COLUMN "calculation_start_date" DATE,
  ADD COLUMN "calculated_income_brl" DECIMAL(24,8) NOT NULL DEFAULT 0,
  ADD COLUMN "income_calculated_through" DATE,
  ADD COLUMN "income_calculation_error" TEXT;

CREATE TABLE "rate_observations" (
  "id" UUID NOT NULL,
  "indexer" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "daily_percent" DECIMAL(18,12) NOT NULL,
  "source" TEXT NOT NULL,
  "fetched_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "rate_observations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rate_observations_indexer_date_key" ON "rate_observations"("indexer", "date");
CREATE INDEX "rate_observations_date_idx" ON "rate_observations"("date");

CREATE TABLE "rate_coverage" (
  "id" UUID NOT NULL,
  "indexer" TEXT NOT NULL,
  "from_date" DATE NOT NULL,
  "through_date" DATE NOT NULL,
  "last_published_date" DATE,
  "fetched_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "rate_coverage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rate_coverage_indexer_from_date_through_date_key" ON "rate_coverage"("indexer", "from_date", "through_date");
