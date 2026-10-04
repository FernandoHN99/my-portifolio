-- Specs 056 a 060: movimentações das posições com a base de cada mês,
-- conta corrente para liquidar títulos vencidos e renda fixa pelo CDI.

-- CreateEnum
CREATE TYPE "PositionTransactionKind" AS ENUM ('CONTRIBUTION', 'WITHDRAWAL', 'INCOME', 'OPENING');

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "applied_on" DATE,
ADD COLUMN     "cash_account" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cdi_percent" DECIMAL(7,3);

-- AlterTable
ALTER TABLE "positions" ADD COLUMN     "opening_quantity" DECIMAL(30,12) NOT NULL DEFAULT 0;

-- As posições existentes não têm movimentações: o valor conhecido de cada mês
-- é a base dele (o saldo inicial do acompanhamento), sem compras inventadas.
UPDATE "positions" SET "opening_quantity" = "quantity";

-- CreateTable
CREATE TABLE "position_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "kind" "PositionTransactionKind" NOT NULL,
    "occurred_on" DATE NOT NULL,
    "quantity" DECIMAL(30,12) NOT NULL,
    "unit_price_brl" DECIMAL(24,8),
    "amount_brl" DECIMAL(24,2) NOT NULL,
    "note" TEXT,
    "transfer_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "position_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "position_transactions_position_id_occurred_on_idx" ON "position_transactions"("position_id", "occurred_on");

-- CreateIndex
CREATE INDEX "position_transactions_user_id_idx" ON "position_transactions"("user_id");

-- CreateIndex
CREATE INDEX "position_transactions_transfer_id_idx" ON "position_transactions"("transfer_id");

-- CreateIndex
CREATE UNIQUE INDEX "position_transactions_id_user_id_key" ON "position_transactions"("id", "user_id");

-- AddForeignKey
ALTER TABLE "position_transactions" ADD CONSTRAINT "position_transactions_position_id_user_id_fkey" FOREIGN KEY ("position_id", "user_id") REFERENCES "positions"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

