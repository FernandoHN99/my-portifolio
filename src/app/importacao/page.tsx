import type { Metadata } from "next";

import { AppShell } from "@/components/product/app-shell";
import { getLatestImportOverview } from "@/modules/imports/application/get-latest-import-overview";
import { ImportReview } from "@/modules/imports/ui/import-review";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Revisão da importação",
};

export default async function ImportPage() {
  const latestImport = await getLatestImportOverview();

  return (
    <AppShell active="none" months={[]} selectedMonth={null}>
      <ImportReview overview={latestImport} />
    </AppShell>
  );
}
