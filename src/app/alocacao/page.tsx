import type { Metadata } from "next";

import { AppShell } from "@/components/product/app-shell";
import { getAllocationOverview } from "@/modules/portfolio/application/get-allocation-overview";
import { getMonthContext } from "@/modules/portfolio/application/get-month-context";
import { AllocationDashboard } from "@/modules/portfolio/ui/allocation-dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Alocação",
};

export default async function AllocationPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const { months, selected } = await getMonthContext(mes);
  const allocation = await getAllocationOverview(selected?.referenceDate);

  return (
    <AppShell active="allocation" months={months} selectedMonth={selected?.month ?? null}>
      <AllocationDashboard overview={allocation} />
    </AppShell>
  );
}
