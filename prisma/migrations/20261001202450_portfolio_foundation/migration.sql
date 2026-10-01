-- CreateEnum
CREATE TYPE "PortfolioMonthStatus" AS ENUM ('IMPORTED', 'DRAFT', 'REVIEWED');

-- CreateTable
CREATE TABLE "institutions" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "normalized_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ticker" TEXT,
    "quote_symbol" TEXT,
    "base_currency" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_months" (
    "id" UUID NOT NULL,
    "source_batch_id" UUID,
    "reference_date" DATE NOT NULL,
    "status" "PortfolioMonthStatus" NOT NULL DEFAULT 'IMPORTED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_months_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL,
    "portfolio_month_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "source_row_id" BIGINT,
    "quantity" DECIMAL(30,12) NOT NULL,
    "unit_price_brl" DECIMAL(24,8),
    "exchange_rate_brl" DECIMAL(20,8),
    "total_brl" DECIMAL(24,2) NOT NULL,
    "strategy" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_quotes" (
    "id" UUID NOT NULL,
    "source_row_id" BIGINT,
    "reference_date" DATE NOT NULL,
    "symbol" TEXT NOT NULL,
    "instrument_type" TEXT NOT NULL,
    "base_currency" TEXT NOT NULL,
    "value_brl" DECIMAL(24,8) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "institutions_normalized_name_key" ON "institutions"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_institution_id_name_key" ON "accounts"("institution_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "assets_normalized_key_key" ON "assets"("normalized_key");

-- CreateIndex
CREATE INDEX "assets_ticker_idx" ON "assets"("ticker");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_months_reference_date_key" ON "portfolio_months"("reference_date");

-- CreateIndex
CREATE UNIQUE INDEX "positions_source_row_id_key" ON "positions"("source_row_id");

-- CreateIndex
CREATE INDEX "positions_portfolio_month_id_idx" ON "positions"("portfolio_month_id");

-- CreateIndex
CREATE INDEX "positions_account_id_idx" ON "positions"("account_id");

-- CreateIndex
CREATE INDEX "positions_asset_id_idx" ON "positions"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "positions_portfolio_month_id_account_id_asset_id_key" ON "positions"("portfolio_month_id", "account_id", "asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "market_quotes_source_row_id_key" ON "market_quotes"("source_row_id");

-- CreateIndex
CREATE INDEX "market_quotes_symbol_idx" ON "market_quotes"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "market_quotes_reference_date_symbol_key" ON "market_quotes"("reference_date", "symbol");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_months" ADD CONSTRAINT "portfolio_months_source_batch_id_fkey" FOREIGN KEY ("source_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_portfolio_month_id_fkey" FOREIGN KEY ("portfolio_month_id") REFERENCES "portfolio_months"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_source_row_id_fkey" FOREIGN KEY ("source_row_id") REFERENCES "import_source_rows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_quotes" ADD CONSTRAINT "market_quotes_source_row_id_fkey" FOREIGN KEY ("source_row_id") REFERENCES "import_source_rows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
