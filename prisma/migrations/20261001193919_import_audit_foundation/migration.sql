-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_ISSUES', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportIssueSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "source_path" TEXT NOT NULL,
    "source_hash" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "rows_read" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_source_rows" (
    "id" BIGSERIAL NOT NULL,
    "batch_id" UUID NOT NULL,
    "source_sheet" TEXT NOT NULL,
    "source_table" TEXT NOT NULL,
    "source_row" INTEGER NOT NULL,
    "content" JSONB NOT NULL,

    CONSTRAINT "import_source_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_issues" (
    "id" BIGSERIAL NOT NULL,
    "batch_id" UUID NOT NULL,
    "severity" "ImportIssueSeverity" NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "source_sheet" TEXT,
    "source_table" TEXT,
    "source_row" INTEGER,
    "source_field" TEXT,
    "raw_value" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_batches_source_hash_idx" ON "import_batches"("source_hash");

-- CreateIndex
CREATE INDEX "import_source_rows_source_sheet_source_table_idx" ON "import_source_rows"("source_sheet", "source_table");

-- CreateIndex
CREATE UNIQUE INDEX "import_source_rows_batch_id_source_table_source_row_key" ON "import_source_rows"("batch_id", "source_table", "source_row");

-- CreateIndex
CREATE INDEX "import_issues_batch_id_severity_idx" ON "import_issues"("batch_id", "severity");

-- AddForeignKey
ALTER TABLE "import_source_rows" ADD CONSTRAINT "import_source_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_issues" ADD CONSTRAINT "import_issues_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
