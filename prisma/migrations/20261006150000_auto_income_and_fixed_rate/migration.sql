-- Spec 079: rendimento automático por ativo e taxa prefixada.
ALTER TABLE "assets" ADD COLUMN "fixed_rate_percent" DECIMAL(7,4);
ALTER TABLE "assets" ADD COLUMN "auto_income" BOOLEAN NOT NULL DEFAULT false;
