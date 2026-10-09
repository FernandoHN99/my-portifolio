-- Spec 098: horas extras. O mês de trabalho (a folha de horas) ganha tabela
-- própria, com os dias importados e as regras; o holerite continua em
-- `income_hour_records`, que perde as horas declaradas e trabalhadas (nunca
-- preenchidas: elas eram do mês de trabalho, outra competência). O DSR das
-- extras do holerite entra no mês de Recebimentos.

-- As colunas que saem estavam vazias no banco local e na produção (conferido em
-- 2026-10-08). Se houver valor, a migração para em vez de perder dado.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "income_hour_records" WHERE "declared_hours" IS NOT NULL OR "worked_hours" IS NOT NULL) THEN
        RAISE EXCEPTION 'income_hour_records tem horas declaradas ou trabalhadas: mova-as para overtime_months antes desta migração.';
    END IF;
END $$;

-- CreateEnum
CREATE TYPE "OvertimeSource" AS ENUM ('IMPORT', 'MANUAL');

-- CreateEnum
CREATE TYPE "OvertimeDayType" AS ENUM ('WORKDAY', 'SATURDAY', 'SUNDAY', 'HOLIDAY');

-- AlterTable (o CHECK das horas cita as colunas que saem e sai junto; volta abaixo)
ALTER TABLE "income_hour_records" DROP CONSTRAINT "income_hour_records_hours_range";
ALTER TABLE "income_hour_records" DROP COLUMN "declared_hours",
DROP COLUMN "worked_hours";
ALTER TABLE "income_hour_records" ADD CONSTRAINT "income_hour_records_hours_range" CHECK (COALESCE("paid_hours", 0) BETWEEN 0 AND 744);

-- AlterTable
ALTER TABLE "income_months" ADD COLUMN     "overtime_dsr" DECIMAL(12,2);
ALTER TABLE "income_months" ADD CONSTRAINT "income_months_overtime_dsr_not_negative" CHECK (COALESCE("overtime_dsr", 0) >= 0);

-- CreateTable
CREATE TABLE "overtime_months" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "source" "OvertimeSource" NOT NULL,
    "weekday_hours" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "weekday_beyond_hours" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "saturday_hours" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "sunday_hours" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "holiday_hours" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "shortfall_hours" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "compensated_hours" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "source_name" TEXT,
    "import_warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "overtime_months_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_days" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "overtime_month_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "hours" DECIMAL(5,2) NOT NULL,
    "day_type" "OvertimeDayType" NOT NULL,
    "manual_type" BOOLEAN NOT NULL DEFAULT false,
    "activity" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "overtime_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_rules" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "daily_hours" DECIMAL(4,2) NOT NULL,
    "weekday_percent" INTEGER NOT NULL,
    "weekday_beyond_percent" INTEGER NOT NULL,
    "saturday_percent" INTEGER NOT NULL,
    "sunday_percent" INTEGER NOT NULL,
    "holiday_percent" INTEGER NOT NULL,
    "usual_daily_limit" DECIMAL(4,2),
    "exceptional_daily_limit" DECIMAL(4,2),
    "net_shortfall" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "overtime_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "overtime_months_user_id_month_key" ON "overtime_months"("user_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "overtime_months_id_user_id_key" ON "overtime_months"("id", "user_id");

-- CreateIndex
CREATE INDEX "overtime_days_user_id_idx" ON "overtime_days"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "overtime_days_overtime_month_id_date_key" ON "overtime_days"("overtime_month_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "overtime_days_id_user_id_key" ON "overtime_days"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "overtime_rules_user_id_effective_from_key" ON "overtime_rules"("user_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "overtime_rules_id_user_id_key" ON "overtime_rules"("id", "user_id");

-- AddForeignKey
ALTER TABLE "overtime_months" ADD CONSTRAINT "overtime_months_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_days" ADD CONSTRAINT "overtime_days_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_days" ADD CONSTRAINT "overtime_days_overtime_month_id_user_id_fkey" FOREIGN KEY ("overtime_month_id", "user_id") REFERENCES "overtime_months"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_rules" ADD CONSTRAINT "overtime_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Regras que o Prisma não declara. Horas do mês entre 0 e 744 (31 dias de 24 h),
-- do dia entre 0 e 24, período de até 45 dias que contém o fim no mês da
-- competência, jornada de 1 a 12 h, adicionais de 0 a 300% e limites diários
-- de 0 a 16 h, com o excepcional nunca abaixo do habitual.
ALTER TABLE "overtime_months" ADD CONSTRAINT "overtime_months_hours_range" CHECK (
    "weekday_hours" BETWEEN 0 AND 744 AND "weekday_beyond_hours" BETWEEN 0 AND 744
    AND "saturday_hours" BETWEEN 0 AND 744 AND "sunday_hours" BETWEEN 0 AND 744
    AND "holiday_hours" BETWEEN 0 AND 744 AND "shortfall_hours" BETWEEN 0 AND 744
    AND "compensated_hours" BETWEEN 0 AND 744
);
ALTER TABLE "overtime_months" ADD CONSTRAINT "overtime_months_month_first_day" CHECK (EXTRACT(DAY FROM "month") = 1);
ALTER TABLE "overtime_months" ADD CONSTRAINT "overtime_months_period" CHECK (
    "starts_on" <= "ends_on" AND "ends_on" - "starts_on" < 45
    AND date_trunc('month', "ends_on")::date = "month"
);
ALTER TABLE "overtime_days" ADD CONSTRAINT "overtime_days_hours_range" CHECK ("hours" BETWEEN 0 AND 24);
ALTER TABLE "overtime_rules" ADD CONSTRAINT "overtime_rules_effective_first_day" CHECK (EXTRACT(DAY FROM "effective_from") = 1);
ALTER TABLE "overtime_rules" ADD CONSTRAINT "overtime_rules_ranges" CHECK (
    "daily_hours" BETWEEN 1 AND 12
    AND "weekday_percent" BETWEEN 0 AND 300 AND "weekday_beyond_percent" BETWEEN 0 AND 300
    AND "saturday_percent" BETWEEN 0 AND 300 AND "sunday_percent" BETWEEN 0 AND 300
    AND "holiday_percent" BETWEEN 0 AND 300
    AND COALESCE("usual_daily_limit", 0) BETWEEN 0 AND 16
    AND COALESCE("exceptional_daily_limit", 0) BETWEEN 0 AND 16
    AND ("usual_daily_limit" IS NULL OR "exceptional_daily_limit" IS NULL OR "exceptional_daily_limit" >= "usual_daily_limit")
);
