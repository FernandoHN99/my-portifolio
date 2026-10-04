-- Shared annual reference rate. User portfolio backups do not include it.
CREATE TABLE "reference_rates" (
    "key" TEXT NOT NULL,
    "percent_annual" DECIMAL(12,6),
    "observed_on" DATE,
    "source" TEXT,
    "fetched_at" TIMESTAMPTZ(3),
    "last_attempt_at" TIMESTAMPTZ(3),
    "error_message" TEXT,
    CONSTRAINT "reference_rates_pkey" PRIMARY KEY ("key")
);
