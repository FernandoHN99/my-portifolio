import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/product/app-shell";
import { getMonthlyUpdate } from "@/modules/portfolio/application/get-monthly-update";
import { MonthlyUpdateView } from "@/modules/portfolio/ui/monthly-update-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Atualização da carteira" };

export default async function MonthlyUpdateRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const update = await getMonthlyUpdate(runId);

  if (!update) {
    notFound();
  }

  return (
    <AppShell active="none" months={[]} selectedMonth={null}>
      <MonthlyUpdateView update={update} />
    </AppShell>
  );
}
