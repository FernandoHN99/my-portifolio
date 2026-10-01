import type { Metadata } from "next";

import { AppShell } from "@/components/product/app-shell";
import { getMonthlyUpdate } from "@/modules/portfolio/application/get-monthly-update";
import {
  EmptyMonthlyUpdate,
  MonthlyUpdateView,
} from "@/modules/portfolio/ui/monthly-update-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Atualização da carteira" };

export default async function MonthlyUpdatePage() {
  const update = await getMonthlyUpdate();

  return (
    <AppShell active="none" months={[]} selectedMonth={null}>
      {update ? <MonthlyUpdateView update={update} /> : <EmptyMonthlyUpdate />}
    </AppShell>
  );
}
