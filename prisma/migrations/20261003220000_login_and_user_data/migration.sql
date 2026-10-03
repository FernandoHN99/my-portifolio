-- Spec 050: login (tabelas do Better Auth) e dados por usuário.
--
-- As tabelas da carteira ganham user_id obrigatório, sem um usuário a quem
-- atribuir as linhas existentes. A migração só roda com elas vazias; os dados
-- voltam pelo backup, restaurado por um usuário depois de entrar.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "institutions") OR EXISTS (SELECT 1 FROM "assets")
    OR EXISTS (SELECT 1 FROM "portfolio_months") OR EXISTS (SELECT 1 FROM "target_plans")
    OR EXISTS (SELECT 1 FROM "data_imports") THEN
    RAISE EXCEPTION 'A migração 20261003220000_login_and_user_data exige as tabelas da carteira vazias. Exporte um backup, apague os dados (ou recrie o banco) e restaure o backup depois de entrar com um usuário.';
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_institution_id_fkey";

-- DropForeignKey
ALTER TABLE "allocation_targets" DROP CONSTRAINT "allocation_targets_plan_id_fkey";

-- DropForeignKey
ALTER TABLE "position_allocations" DROP CONSTRAINT "position_allocations_position_id_fkey";

-- DropForeignKey
ALTER TABLE "positions" DROP CONSTRAINT "positions_account_id_fkey";

-- DropForeignKey
ALTER TABLE "positions" DROP CONSTRAINT "positions_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "positions" DROP CONSTRAINT "positions_portfolio_month_id_fkey";

-- DropIndex
DROP INDEX "assets_normalized_key_key";

-- DropIndex
DROP INDEX "data_imports_imported_at_idx";

-- DropIndex
DROP INDEX "institutions_normalized_name_key";

-- DropIndex
DROP INDEX "portfolio_months_reference_date_key";

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "user_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "allocation_targets" ADD COLUMN     "user_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "user_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "data_imports" ADD COLUMN     "user_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "institutions" ADD COLUMN     "user_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "portfolio_months" ADD COLUMN     "user_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "position_allocations" ADD COLUMN     "user_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "positions" ADD COLUMN     "user_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "target_plans" ADD COLUMN     "user_id" UUID NOT NULL;

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" UUID NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_accounts" (
    "id" UUID NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMPTZ(3),
    "refresh_token_expires_at" TIMESTAMPTZ(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "last_request" BIGINT NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts"("user_id");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limits_key_key" ON "rate_limits"("key");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_id_user_id_key" ON "accounts"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "assets_user_id_normalized_key_key" ON "assets"("user_id", "normalized_key");

-- CreateIndex
CREATE UNIQUE INDEX "assets_id_user_id_key" ON "assets"("id", "user_id");

-- CreateIndex
CREATE INDEX "data_imports_user_id_imported_at_idx" ON "data_imports"("user_id", "imported_at");

-- CreateIndex
CREATE UNIQUE INDEX "institutions_user_id_normalized_name_key" ON "institutions"("user_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "institutions_id_user_id_key" ON "institutions"("id", "user_id");

-- CreateIndex
CREATE INDEX "portfolio_months_reference_date_idx" ON "portfolio_months"("reference_date");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_months_user_id_reference_date_key" ON "portfolio_months"("user_id", "reference_date");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_months_id_user_id_key" ON "portfolio_months"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "positions_id_user_id_key" ON "positions"("id", "user_id");

-- CreateIndex
CREATE INDEX "target_plans_user_id_idx" ON "target_plans"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "target_plans_id_user_id_key" ON "target_plans"("id", "user_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_imports" ADD CONSTRAINT "data_imports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_institution_id_user_id_fkey" FOREIGN KEY ("institution_id", "user_id") REFERENCES "institutions"("id", "user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_months" ADD CONSTRAINT "portfolio_months_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_portfolio_month_id_user_id_fkey" FOREIGN KEY ("portfolio_month_id", "user_id") REFERENCES "portfolio_months"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_account_id_user_id_fkey" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts"("id", "user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_asset_id_user_id_fkey" FOREIGN KEY ("asset_id", "user_id") REFERENCES "assets"("id", "user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_allocations" ADD CONSTRAINT "position_allocations_position_id_user_id_fkey" FOREIGN KEY ("position_id", "user_id") REFERENCES "positions"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_plans" ADD CONSTRAINT "target_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_targets" ADD CONSTRAINT "allocation_targets_plan_id_user_id_fkey" FOREIGN KEY ("plan_id", "user_id") REFERENCES "target_plans"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

