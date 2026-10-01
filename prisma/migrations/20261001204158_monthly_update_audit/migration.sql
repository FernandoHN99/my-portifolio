-- CreateEnum
CREATE TYPE "MonthlyUpdateStatus" AS ENUM ('RUNNING', 'COMPLETED', 'COMPLETED_WITH_ISSUES', 'FAILED');

-- CreateEnum
CREATE TYPE "QuoteUpdateStatus" AS ENUM ('SUCCESS', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "monthly_update_runs" (
    "id" UUID NOT NULL,
    "source_month_id" UUID NOT NULL,
    "target_month_id" UUID NOT NULL,
    "status" "MonthlyUpdateStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "error_message" TEXT,

    CONSTRAINT "monthly_update_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_update_results" (
    "id" BIGSERIAL NOT NULL,
    "run_id" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "QuoteUpdateStatus" NOT NULL,
    "value_brl" DECIMAL(24,8),
    "error_code" TEXT,
    "error_message" TEXT,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_update_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "monthly_update_runs_target_month_id_key" ON "monthly_update_runs"("target_month_id");

-- CreateIndex
CREATE INDEX "monthly_update_runs_status_idx" ON "monthly_update_runs"("status");

-- CreateIndex
CREATE INDEX "quote_update_results_run_id_status_idx" ON "quote_update_results"("run_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quote_update_results_run_id_symbol_key" ON "quote_update_results"("run_id", "symbol");

-- AddForeignKey
ALTER TABLE "monthly_update_runs" ADD CONSTRAINT "monthly_update_runs_source_month_id_fkey" FOREIGN KEY ("source_month_id") REFERENCES "portfolio_months"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_update_runs" ADD CONSTRAINT "monthly_update_runs_target_month_id_fkey" FOREIGN KEY ("target_month_id") REFERENCES "portfolio_months"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_update_results" ADD CONSTRAINT "quote_update_results_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "monthly_update_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
