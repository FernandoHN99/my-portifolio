import type { Metadata } from "next";

import { AppShell } from "@/components/product/app-shell";
import { getAllocationOverview } from "@/modules/portfolio/application/get-allocation-overview";
import { AllocationDashboard } from "@/modules/portfolio/ui/allocation-dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Alocação",
};

export default async function AllocationPage() {
  const allocation = await getAllocationOverview();

  return (
    <AppShell active="allocation">
      <AllocationDashboard overview={allocation} />
    </AppShell>
  );
}
