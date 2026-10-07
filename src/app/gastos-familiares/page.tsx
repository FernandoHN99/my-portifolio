import type { Metadata } from "next";

import { requireModulePage } from "@/modules/access/application/module-access";
import { getFamilyLedger } from "@/modules/family-expenses/application/get-family-ledger";
import { FamilyLedgerWorkspace } from "@/modules/family-expenses/ui/family-ledger";
import { FamilyShell } from "@/modules/family-expenses/ui/family-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gastos familiares",
};

// Gastos familiares (spec 082): só para quem tem a concessão da área; os
// demais recebem 404, inclusive pelo endereço direto.
export default async function FamilyExpensesPage() {
  await requireModulePage("FAMILY_EXPENSES");
  const ledger = await getFamilyLedger();

  return (
    <FamilyShell>
      {(menu) => <FamilyLedgerWorkspace ledger={ledger} menu={menu} />}
    </FamilyShell>
  );
}
