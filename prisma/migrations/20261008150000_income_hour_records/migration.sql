-- Spec 094: horas do mês de Recebimentos (declaradas, pagas e trabalhadas de
-- verdade), só guardadas por enquanto. Tabela nova, sem mexer nas existentes.

-- CreateEnum
CREATE TYPE "HourKind" AS ENUM ('NORMAL', 'OVERTIME_50', 'OVERTIME_75', 'OVERTIME_100');

-- CreateTable
CREATE TABLE "income_hour_records" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "income_month_id" UUID NOT NULL,
    "kind" "HourKind" NOT NULL,
    "declared_hours" DECIMAL(7,2),
    "paid_hours" DECIMAL(7,2),
    "worked_hours" DECIMAL(7,2),
    "paid_amount" DECIMAL(12,2),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "income_hour_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "income_hour_records_user_id_idx" ON "income_hour_records"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "income_hour_records_income_month_id_kind_key" ON "income_hour_records"("income_month_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "income_hour_records_id_user_id_key" ON "income_hour_records"("id", "user_id");

-- AddForeignKey
ALTER TABLE "income_hour_records" ADD CONSTRAINT "income_hour_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_hour_records" ADD CONSTRAINT "income_hour_records_income_month_id_user_id_fkey" FOREIGN KEY ("income_month_id", "user_id") REFERENCES "income_months"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Regras que o Prisma não declara: horas entre 0 e as 744 de um mês de 31 dias
-- e valor nunca negativo. Nulo continua valendo como "não informado".
ALTER TABLE "income_hour_records" ADD CONSTRAINT "income_hour_records_hours_range" CHECK (
    COALESCE("declared_hours", 0) BETWEEN 0 AND 744 AND COALESCE("paid_hours", 0) BETWEEN 0 AND 744
    AND COALESCE("worked_hours", 0) BETWEEN 0 AND 744
);
ALTER TABLE "income_hour_records" ADD CONSTRAINT "income_hour_records_amount_not_negative" CHECK (COALESCE("paid_amount", 0) >= 0);
