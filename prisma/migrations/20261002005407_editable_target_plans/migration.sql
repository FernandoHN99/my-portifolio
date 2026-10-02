-- AlterTable
ALTER TABLE "allocation_targets" ALTER COLUMN "source_sheet" DROP NOT NULL,
ALTER COLUMN "source_cell" DROP NOT NULL;

-- AlterTable
ALTER TABLE "target_plans" ALTER COLUMN "source_batch_id" DROP NOT NULL;
