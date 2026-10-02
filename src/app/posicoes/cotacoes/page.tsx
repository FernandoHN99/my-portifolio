import type { Metadata } from "next";

import { AppShell } from "@/components/product/app-shell";
import { getMonthContext } from "@/modules/portfolio/application/get-month-context";
import { getMonthQuotes } from "@/modules/quotes/application/get-month-quotes";
import { getRunHistory } from "@/modules/quotes/application/get-run-history";
import { getRequestQuoteRefreshSummary } from "@/modules/quotes/application/refresh-quotes";
import { QuotesWorkspace } from "@/modules/quotes/ui/quotes-workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cotações",
};

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const { months, selected } = await getMonthContext(mes);
  const [month, summary, history] = await Promise.all([
    getMonthQuotes(selected?.referenceDate),
    getRequestQuoteRefreshSummary(),
    getRunHistory(),
  ]);

  return (
    <AppShell active="positions" months={months} selectedMonth={selected?.month ?? null}>
      <QuotesWorkspace month={month} summary={summary} history={history} />
    </AppShell>
  );
}
