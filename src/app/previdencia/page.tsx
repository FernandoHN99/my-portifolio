import type { Metadata } from "next";

import { requireModulePage } from "@/modules/access/application/module-access";
import { getPensionData } from "@/modules/pension/application/get-pension-summary";
import { PensionShell } from "@/modules/pension/ui/pension-shell";
import { PensionView } from "@/modules/pension/ui/pension-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Previdência",
};

// Previdência (spec 089): só para quem tem a concessão da área; os demais
// recebem 404, inclusive pelo endereço direto.
export default async function PensionPage() {
  await requireModulePage("PENSION");
  const data = await getPensionData();

  return <PensionShell>{(menu) => <PensionView data={data} menu={menu} />}</PensionShell>;
}
