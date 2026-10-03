-- Spec 049: tabelas e status sem uso.

-- O status IMPORTED veio da importação do Excel (spec 047) e equivale a um mês
-- fechado; os meses que o têm passam a REVIEWED antes da troca do enum.
UPDATE "portfolio_months" SET "status" = 'REVIEWED' WHERE "status" = 'IMPORTED';

CREATE TYPE "PortfolioMonthStatus_new" AS ENUM ('DRAFT', 'REVIEWED');
ALTER TABLE "portfolio_months" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "portfolio_months" ALTER COLUMN "status" TYPE "PortfolioMonthStatus_new" USING ("status"::text::"PortfolioMonthStatus_new");
ALTER TYPE "PortfolioMonthStatus" RENAME TO "PortfolioMonthStatus_old";
ALTER TYPE "PortfolioMonthStatus_new" RENAME TO "PortfolioMonthStatus";
DROP TYPE "PortfolioMonthStatus_old";
ALTER TABLE "portfolio_months" ALTER COLUMN "status" SET DEFAULT 'REVIEWED';

-- A atualização mensal manual (spec 003) foi substituída pela virada automática
-- (spec 021); nada mais grava nestas tabelas.
DROP TABLE "quote_update_results";
DROP TABLE "monthly_update_runs";
DROP TYPE "MonthlyUpdateStatus";
