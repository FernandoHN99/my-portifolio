-- Spec 067: change points of the Selic target, shared by all users and kept
-- out of portfolio backups like reference_rates.
CREATE TABLE "reference_rate_points" (
    "key" TEXT NOT NULL,
    "effective_on" DATE NOT NULL,
    "percent_annual" DECIMAL(12,6) NOT NULL,
    CONSTRAINT "reference_rate_points_pkey" PRIMARY KEY ("key", "effective_on")
);

-- Spec 068: optional asset type; legacy rows stay null and are inferred on read.
ALTER TABLE "assets" ADD COLUMN "asset_type" TEXT;
