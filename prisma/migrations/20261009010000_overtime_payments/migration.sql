-- Spec 098, segunda parte (pedido do usuário em 2026-10-08): declarar as horas
-- e registrar o pagamento são ações separadas. O pagamento de cada mês de
-- trabalho fica em `overtime_payments` (um registro por holerite que pagou) e
-- sai do formulário do mês de Recebimentos; o DSR das extras, que estava no mês
-- de Recebimentos desde a migração anterior (nunca publicada), passa ao
-- pagamento.

-- AlterTable
ALTER TABLE "income_months" DROP COLUMN "overtime_dsr";

-- CreateTable
CREATE TABLE "overtime_payments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "overtime_month_id" UUID NOT NULL,
    "payment_month" DATE NOT NULL,
    "hours_50" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "amount_50" DECIMAL(12,2),
    "hours_75" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "amount_75" DECIMAL(12,2),
    "hours_100" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "amount_100" DECIMAL(12,2),
    "dsr_amount" DECIMAL(12,2),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "overtime_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "overtime_payments_user_id_idx" ON "overtime_payments"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "overtime_payments_overtime_month_id_payment_month_key" ON "overtime_payments"("overtime_month_id", "payment_month");

-- CreateIndex
CREATE UNIQUE INDEX "overtime_payments_id_user_id_key" ON "overtime_payments"("id", "user_id");

-- AddForeignKey
ALTER TABLE "overtime_payments" ADD CONSTRAINT "overtime_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_payments" ADD CONSTRAINT "overtime_payments_overtime_month_id_user_id_fkey" FOREIGN KEY ("overtime_month_id", "user_id") REFERENCES "overtime_months"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Regras que o Prisma não declara: horas de 0 a 744, valores não negativos e o
-- holerite no dia 1 do mês.
ALTER TABLE "overtime_payments" ADD CONSTRAINT "overtime_payments_ranges" CHECK (
    "hours_50" BETWEEN 0 AND 744 AND "hours_75" BETWEEN 0 AND 744 AND "hours_100" BETWEEN 0 AND 744
    AND COALESCE("amount_50", 0) >= 0 AND COALESCE("amount_75", 0) >= 0 AND COALESCE("amount_100", 0) >= 0
    AND COALESCE("dsr_amount", 0) >= 0
);
ALTER TABLE "overtime_payments" ADD CONSTRAINT "overtime_payments_month_first_day" CHECK (EXTRACT(DAY FROM "payment_month") = 1);
