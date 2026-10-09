import type { Metadata } from "next";

import { requireModulePage } from "@/modules/access/application/module-access";
import { getOvertimeView } from "@/modules/income/application/get-overtime-view";
import { IncomeShell } from "@/modules/income/ui/income-shell";
import { OvertimeWorkspace } from "@/modules/income/ui/overtime-workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Horas extras",
};

// Horas extras (spec 098): aba de Recebimentos, com a mesma concessão.
export default async function OvertimePage() {
  await requireModulePage("INCOME");
  const view = await getOvertimeView();

  return (
    <IncomeShell tab="overtime">
      <OvertimeWorkspace view={view} />
    </IncomeShell>
  );
}
