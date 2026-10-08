-- Spec 095: cada linha do holerite diz se entra na renda tributável do limite
-- do PGBL. Antes, a regra era fixa no tipo; agora ela é um campo editável, e as
-- linhas que já existem mantêm o resultado de antes (13º e PLR fora).

-- AlterTable
ALTER TABLE "income_payslips" ADD COLUMN "taxable" BOOLEAN NOT NULL DEFAULT true;

UPDATE "income_payslips" SET "taxable" = false WHERE "kind" IN ('THIRTEENTH', 'PROFIT_SHARING');
