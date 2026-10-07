-- Specs 081 a 083: acesso por área (concessões e papéis) e Gastos familiares
-- (pessoas, séries e lançamentos), com os dados de cada usuário.

-- CreateEnum
CREATE TYPE "AppModule" AS ENUM ('FAMILY_EXPENSES');

-- CreateEnum
CREATE TYPE "AppRole" AS ENUM ('ADMIN');

-- CreateEnum
CREATE TYPE "FamilyDirection" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateEnum
CREATE TYPE "FamilyEntryStatus" AS ENUM ('PENDING', 'SETTLED');

-- CreateEnum
CREATE TYPE "FamilySeriesKind" AS ENUM ('INSTALLMENTS', 'MONTHLY');

-- CreateTable
CREATE TABLE "module_grants" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "module" "AppModule" NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "module_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_grants" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "AppRole" NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_contacts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_series" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "kind" "FamilySeriesKind" NOT NULL,
    "description" TEXT NOT NULL,
    "direction" "FamilyDirection" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "first_competence" DATE NOT NULL,
    "count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "family_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "competence" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "direction" "FamilyDirection" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "FamilyEntryStatus" NOT NULL DEFAULT 'PENDING',
    "series_id" UUID,
    "installment" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "family_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "module_grants_user_id_module_key" ON "module_grants"("user_id", "module");

-- CreateIndex
CREATE UNIQUE INDEX "role_grants_user_id_role_key" ON "role_grants"("user_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "family_contacts_user_id_normalized_name_key" ON "family_contacts"("user_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "family_contacts_id_user_id_key" ON "family_contacts"("id", "user_id");

-- CreateIndex
CREATE INDEX "family_series_user_id_idx" ON "family_series"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "family_series_id_user_id_key" ON "family_series"("id", "user_id");

-- CreateIndex
CREATE INDEX "family_entries_user_id_competence_idx" ON "family_entries"("user_id", "competence");

-- CreateIndex
CREATE INDEX "family_entries_contact_id_idx" ON "family_entries"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "family_entries_series_id_installment_key" ON "family_entries"("series_id", "installment");

-- CreateIndex
CREATE UNIQUE INDEX "family_entries_id_user_id_key" ON "family_entries"("id", "user_id");

-- AddForeignKey
ALTER TABLE "module_grants" ADD CONSTRAINT "module_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_grants" ADD CONSTRAINT "role_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_contacts" ADD CONSTRAINT "family_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_series" ADD CONSTRAINT "family_series_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_series" ADD CONSTRAINT "family_series_contact_id_user_id_fkey" FOREIGN KEY ("contact_id", "user_id") REFERENCES "family_contacts"("id", "user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_entries" ADD CONSTRAINT "family_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_entries" ADD CONSTRAINT "family_entries_contact_id_user_id_fkey" FOREIGN KEY ("contact_id", "user_id") REFERENCES "family_contacts"("id", "user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_entries" ADD CONSTRAINT "family_entries_series_id_user_id_fkey" FOREIGN KEY ("series_id", "user_id") REFERENCES "family_series"("id", "user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Regras que o Prisma não declara: valor sempre positivo, com o sinal vindo do
-- tipo; um lançamento de série sempre tem o número dele, e só ele.
ALTER TABLE "family_entries" ADD CONSTRAINT "family_entries_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "family_entries" ADD CONSTRAINT "family_entries_series_installment"
    CHECK (("series_id" IS NULL AND "installment" IS NULL) OR ("series_id" IS NOT NULL AND "installment" >= 1));
ALTER TABLE "family_series" ADD CONSTRAINT "family_series_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "family_series" ADD CONSTRAINT "family_series_count_range" CHECK ("count" BETWEEN 1 AND 120);

-- Concessão inicial (spec 081): as áreas pessoais e a administração de acessos
-- ficam só com a conta do dono, resolvida aqui pelo e-mail e ligada ao id dela.
-- Sem essa conta no banco, nada é concedido; `pnpm auth:access grant` concede depois.
INSERT INTO "module_grants" ("id", "user_id", "module")
SELECT gen_random_uuid(), "id", 'FAMILY_EXPENSES' FROM "users" WHERE "email" = 'nandohneto@gmail.com'
ON CONFLICT ("user_id", "module") DO NOTHING;

INSERT INTO "role_grants" ("id", "user_id", "role")
SELECT gen_random_uuid(), "id", 'ADMIN' FROM "users" WHERE "email" = 'nandohneto@gmail.com'
ON CONFLICT ("user_id", "role") DO NOTHING;
