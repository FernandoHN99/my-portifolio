-- Spec 088: Recebimentos (meses e holerites), com os dados de cada usuário,
-- e as concessões de Recebimentos e Previdência para a conta do dono.

-- CreateEnum
CREATE TYPE "PayslipKind" AS ENUM ('SALARY', 'VACATION', 'THIRTEENTH', 'PROFIT_SHARING', 'OTHER');

-- CreateTable
CREATE TABLE "income_months" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "net_income" DECIMAL(12,2),
    "meal_voucher" DECIMAL(12,2),
    "card_spend" DECIMAL(12,2),
    "pix_spend" DECIMAL(12,2),
    "meal_voucher_spend" DECIMAL(12,2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "income_months_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "income_payslips" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "income_month_id" UUID NOT NULL,
    "kind" "PayslipKind" NOT NULL DEFAULT 'SALARY',
    "label" TEXT,
    "employer" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "gross_salary" DECIMAL(12,2) NOT NULL,
    "prorated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "income_payslips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "income_months_user_id_month_key" ON "income_months"("user_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "income_months_id_user_id_key" ON "income_months"("id", "user_id");

-- CreateIndex
CREATE INDEX "income_payslips_income_month_id_idx" ON "income_payslips"("income_month_id");

-- CreateIndex
CREATE INDEX "income_payslips_user_id_starts_on_idx" ON "income_payslips"("user_id", "starts_on");

-- CreateIndex
CREATE UNIQUE INDEX "income_payslips_id_user_id_key" ON "income_payslips"("id", "user_id");

-- AddForeignKey
ALTER TABLE "income_months" ADD CONSTRAINT "income_months_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_payslips" ADD CONSTRAINT "income_payslips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_payslips" ADD CONSTRAINT "income_payslips_income_month_id_user_id_fkey" FOREIGN KEY ("income_month_id", "user_id") REFERENCES "income_months"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Regras que o Prisma não declara: valores nunca negativos, bruto positivo e
-- período com o fim depois do início. O período dentro do mês é conferido na
-- gravação.
ALTER TABLE "income_months" ADD CONSTRAINT "income_months_values_not_negative" CHECK (
    COALESCE("net_income", 0) >= 0 AND COALESCE("meal_voucher", 0) >= 0 AND COALESCE("card_spend", 0) >= 0
    AND COALESCE("pix_spend", 0) >= 0 AND COALESCE("meal_voucher_spend", 0) >= 0
);
ALTER TABLE "income_months" ADD CONSTRAINT "income_months_first_day" CHECK (EXTRACT(DAY FROM "month") = 1);
ALTER TABLE "income_payslips" ADD CONSTRAINT "income_payslips_gross_positive" CHECK ("gross_salary" > 0);
ALTER TABLE "income_payslips" ADD CONSTRAINT "income_payslips_period" CHECK ("ends_on" >= "starts_on");

-- Concessões iniciais (specs 088 e 089): como Gastos familiares (spec 081), só
-- a conta do dono, resolvida pelo e-mail. Sem ela no banco, nada é concedido;
-- `pnpm auth:access grant` concede depois.
INSERT INTO "module_grants" ("id", "user_id", "module")
SELECT gen_random_uuid(), "id", 'INCOME' FROM "users" WHERE "email" = 'nandohneto@gmail.com'
ON CONFLICT ("user_id", "module") DO NOTHING;

INSERT INTO "module_grants" ("id", "user_id", "module")
SELECT gen_random_uuid(), "id", 'PENSION' FROM "users" WHERE "email" = 'nandohneto@gmail.com'
ON CONFLICT ("user_id", "module") DO NOTHING;
