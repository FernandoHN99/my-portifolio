-- CreateEnum
CREATE TYPE "QuoteRefreshTrigger" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "QuoteRefreshStatus" AS ENUM ('RUNNING', 'COMPLETED', 'COMPLETED_WITH_ISSUES', 'FAILED');

-- AlterTable
ALTER TABLE "market_quotes" ADD COLUMN     "carried_from" DATE,
ADD COLUMN     "quote_date" DATE;

-- CreateTable
CREATE TABLE "daily_quotes" (
    "id" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "quote_date" DATE NOT NULL,
    "instrument_type" TEXT NOT NULL,
    "base_currency" TEXT NOT NULL,
    "value_brl" DECIMAL(24,8) NOT NULL,
    "provider" TEXT NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,
    "run_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_refresh_runs" (
    "id" UUID NOT NULL,
    "trigger" "QuoteRefreshTrigger" NOT NULL,
    "status" "QuoteRefreshStatus" NOT NULL DEFAULT 'RUNNING',
    "quote_date" DATE NOT NULL,
    "portfolio_month_id" UUID,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    "error_message" TEXT,

    CONSTRAINT "quote_refresh_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_refresh_results" (
    "id" BIGSERIAL NOT NULL,
    "run_id" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "QuoteUpdateStatus" NOT NULL,
    "value_brl" DECIMAL(24,8),
    "error_code" TEXT,
    "error_message" TEXT,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_refresh_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_quotes_quote_date_idx" ON "daily_quotes"("quote_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_quotes_symbol_quote_date_key" ON "daily_quotes"("symbol", "quote_date");

-- CreateIndex
CREATE INDEX "quote_refresh_runs_started_at_idx" ON "quote_refresh_runs"("started_at");

-- CreateIndex
CREATE INDEX "quote_refresh_runs_status_idx" ON "quote_refresh_runs"("status");

-- CreateIndex
CREATE INDEX "quote_refresh_results_run_id_status_idx" ON "quote_refresh_results"("run_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quote_refresh_results_run_id_symbol_key" ON "quote_refresh_results"("run_id", "symbol");

-- AddForeignKey
ALTER TABLE "daily_quotes" ADD CONSTRAINT "daily_quotes_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "quote_refresh_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_refresh_runs" ADD CONSTRAINT "quote_refresh_runs_portfolio_month_id_fkey" FOREIGN KEY ("portfolio_month_id") REFERENCES "portfolio_months"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_refresh_results" ADD CONSTRAINT "quote_refresh_results_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "quote_refresh_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
