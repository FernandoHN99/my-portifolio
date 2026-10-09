-- Spec 098, quarta rodada (pedido do usuário em 2026-10-09): o pagamento guarda
-- só as horas de cada adicional. O valor e o DSR saem do salário bruto do
-- holerite em Recebimentos (hora normal = salário ÷ 200 h) e do calendário do
-- mês do holerite, como a folha da empresa calcula; nada é digitado.

ALTER TABLE "overtime_payments" DROP CONSTRAINT "overtime_payments_ranges";

-- AlterTable
ALTER TABLE "overtime_payments" DROP COLUMN "amount_100",
DROP COLUMN "amount_50",
DROP COLUMN "amount_75",
DROP COLUMN "dsr_amount";

ALTER TABLE "overtime_payments" ADD CONSTRAINT "overtime_payments_ranges" CHECK (
    "hours_50" BETWEEN 0 AND 744 AND "hours_75" BETWEEN 0 AND 744 AND "hours_100" BETWEEN 0 AND 744
);
