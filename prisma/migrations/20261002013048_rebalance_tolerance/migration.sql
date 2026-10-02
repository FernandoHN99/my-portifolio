-- AlterTable
ALTER TABLE "target_plans" ADD COLUMN     "rebalance_tolerance" DECIMAL(5,2) NOT NULL DEFAULT 2;
