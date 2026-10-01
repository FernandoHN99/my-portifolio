-- CreateEnum
CREATE TYPE "AllocationTargetScope" AS ENUM ('ASSET_CLASS', 'CURRENCY', 'STRATEGY', 'CLASS_CURRENCY', 'FIXED_INCOME', 'VARIABLE_INCOME');

-- CreateTable
CREATE TABLE "position_allocations" (
    "id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "source_row_id" BIGINT,
    "asset_class" TEXT NOT NULL,
    "subclass" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "weight" DECIMAL(12,10) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "position_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "target_plans" (
    "id" UUID NOT NULL,
    "source_batch_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "target_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocation_targets" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "scope" "AllocationTargetScope" NOT NULL,
    "primary_label" TEXT NOT NULL,
    "secondary_label" TEXT,
    "percentage" DECIMAL(12,10) NOT NULL,
    "source_sheet" TEXT NOT NULL,
    "source_cell" TEXT NOT NULL,

    CONSTRAINT "allocation_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "position_allocations_source_row_id_key" ON "position_allocations"("source_row_id");

-- CreateIndex
CREATE INDEX "position_allocations_position_id_idx" ON "position_allocations"("position_id");

-- CreateIndex
CREATE UNIQUE INDEX "position_allocations_position_id_asset_class_subclass_durat_key" ON "position_allocations"("position_id", "asset_class", "subclass", "duration");

-- CreateIndex
CREATE UNIQUE INDEX "target_plans_source_batch_id_key" ON "target_plans"("source_batch_id");

-- CreateIndex
CREATE INDEX "allocation_targets_plan_id_scope_idx" ON "allocation_targets"("plan_id", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "allocation_targets_plan_id_key_key" ON "allocation_targets"("plan_id", "key");

-- AddForeignKey
ALTER TABLE "position_allocations" ADD CONSTRAINT "position_allocations_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_allocations" ADD CONSTRAINT "position_allocations_source_row_id_fkey" FOREIGN KEY ("source_row_id") REFERENCES "import_source_rows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_plans" ADD CONSTRAINT "target_plans_source_batch_id_fkey" FOREIGN KEY ("source_batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_targets" ADD CONSTRAINT "allocation_targets_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "target_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
