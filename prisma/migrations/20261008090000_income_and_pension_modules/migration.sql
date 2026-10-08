-- Specs 088 e 089: as áreas Recebimentos e Previdência, por concessão.
-- Os valores novos do enum ficam numa migração própria: o Postgres não deixa
-- usá-los na mesma transação em que foram criados, e a seguinte grava as
-- concessões com eles.

ALTER TYPE "AppModule" ADD VALUE IF NOT EXISTS 'INCOME';
ALTER TYPE "AppModule" ADD VALUE IF NOT EXISTS 'PENSION';
