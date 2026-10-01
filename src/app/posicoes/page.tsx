import type { Metadata } from "next";

import { AppShell } from "@/components/product/app-shell";
import { getMonthContext } from "@/modules/portfolio/application/get-month-context";
import { getMonthPositions } from "@/modules/portfolio/application/get-month-positions";
import { PositionsTable } from "@/modules/portfolio/ui/positions-table";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Posições",
};

export default async function PositionsPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const { months, selected } = await getMonthContext(mes);
  const month = await getMonthPositions(selected?.referenceDate);

  return (
    <AppShell active="positions" months={months} selectedMonth={selected?.month ?? null}>
      <PositionsTable month={month} />
    </AppShell>
  );
}
