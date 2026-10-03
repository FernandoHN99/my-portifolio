-- Fim da importação do Excel (spec 047): os dados entram e saem pelo backup em
-- JSON. Saem os lotes, as linhas de origem e os achados da importação, e as
-- colunas que apontavam para eles; entra o registro das importações de backup.
/*
  Warnings:

  - You are about to drop the column `source_cell` on the `allocation_targets` table. All the data in the column will be lost.
  - You are about to drop the column `source_sheet` on the `allocation_targets` table. All the data in the column will be lost.
  - You are about to drop the column `source_row_id` on the `market_quotes` table. All the data in the column will be lost.
  - You are about to drop the column `source_batch_id` on the `portfolio_months` table. All the data in the column will be lost.
  - You are about to drop the column `source_row_id` on the `position_allocations` table. All the data in the column will be lost.
  - You are about to drop the column `source_row_id` on the `positions` table. All the data in the column will be lost.
  - You are about to drop the column `source_batch_id` on the `target_plans` table. All the data in the column will be lost.
  - You are about to drop the `import_batches` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `import_issues` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `import_source_rows` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "import_issues" DROP CONSTRAINT "import_issues_batch_id_fkey";

-- DropForeignKey
ALTER TABLE "import_source_rows" DROP CONSTRAINT "import_source_rows_batch_id_fkey";

-- DropForeignKey
ALTER TABLE "market_quotes" DROP CONSTRAINT "market_quotes_source_row_id_fkey";

-- DropForeignKey
ALTER TABLE "portfolio_months" DROP CONSTRAINT "portfolio_months_source_batch_id_fkey";

-- DropForeignKey
ALTER TABLE "position_allocations" DROP CONSTRAINT "position_allocations_source_row_id_fkey";

-- DropForeignKey
ALTER TABLE "positions" DROP CONSTRAINT "positions_source_row_id_fkey";

-- DropForeignKey
ALTER TABLE "target_plans" DROP CONSTRAINT "target_plans_source_batch_id_fkey";

-- DropIndex
DROP INDEX "market_quotes_source_row_id_key";

-- DropIndex
DROP INDEX "position_allocations_source_row_id_key";

-- DropIndex
DROP INDEX "positions_source_row_id_key";

-- DropIndex
DROP INDEX "target_plans_source_batch_id_key";

-- AlterTable
ALTER TABLE "allocation_targets" DROP COLUMN "source_cell",
DROP COLUMN "source_sheet";

-- AlterTable
ALTER TABLE "market_quotes" DROP COLUMN "source_row_id";

-- AlterTable
ALTER TABLE "portfolio_months" DROP COLUMN "source_batch_id";

-- AlterTable
ALTER TABLE "position_allocations" DROP COLUMN "source_row_id";

-- AlterTable
ALTER TABLE "positions" DROP COLUMN "source_row_id";

-- AlterTable
ALTER TABLE "target_plans" DROP COLUMN "source_batch_id";

-- DropTable
DROP TABLE "import_batches";

-- DropTable
DROP TABLE "import_issues";

-- DropTable
DROP TABLE "import_source_rows";

-- DropEnum
DROP TYPE "ImportIssueSeverity";

-- DropEnum
DROP TYPE "ImportStatus";

-- CreateTable
CREATE TABLE "data_imports" (
    "id" UUID NOT NULL,
    "imported_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exported_at" TIMESTAMPTZ(3) NOT NULL,
    "format_version" INTEGER NOT NULL,

    CONSTRAINT "data_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_imports_imported_at_idx" ON "data_imports"("imported_at");
