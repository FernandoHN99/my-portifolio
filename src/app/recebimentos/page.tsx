import type { Metadata } from "next";

import { requireModulePage } from "@/modules/access/application/module-access";
import { getIncomeLedger } from "@/modules/income/application/get-income-ledger";
import { IncomeShell } from "@/modules/income/ui/income-shell";
import { IncomeWorkspace } from "@/modules/income/ui/income-workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Recebimentos",
};

// Recebimentos (spec 088): só para quem tem a concessão da área; os demais
// recebem 404, inclusive pelo endereço direto.
export default async function IncomePage() {
  await requireModulePage("INCOME");
  const ledger = await getIncomeLedger();

  return <IncomeShell>{(menu) => <IncomeWorkspace ledger={ledger} menu={menu} />}</IncomeShell>;
}
