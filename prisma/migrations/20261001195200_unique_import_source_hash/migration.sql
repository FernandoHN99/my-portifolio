-- ReplaceIndex
DROP INDEX "import_batches_source_hash_idx";

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_source_hash_key" ON "import_batches"("source_hash");
