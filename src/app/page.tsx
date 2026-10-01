import { AppShell } from "@/components/product/app-shell";
import { getMonthContext } from "@/modules/portfolio/application/get-month-context";
import { getPortfolioOverview } from "@/modules/portfolio/application/get-portfolio-overview";
import { PortfolioDashboard } from "@/modules/portfolio/ui/portfolio-dashboard";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const { months, selected } = await getMonthContext(mes);
  const portfolio = await getPortfolioOverview(selected?.referenceDate);

  return (
    <AppShell active="overview" months={months} selectedMonth={selected?.month ?? null}>
      <PortfolioDashboard overview={portfolio} />
    </AppShell>
  );
}
