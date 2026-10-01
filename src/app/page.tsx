import { AppShell } from "@/components/product/app-shell";
import { getPortfolioOverview } from "@/modules/portfolio/application/get-portfolio-overview";
import { PortfolioDashboard } from "@/modules/portfolio/ui/portfolio-dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const portfolio = await getPortfolioOverview();

  return (
    <AppShell active="overview">
      <PortfolioDashboard overview={portfolio} />
    </AppShell>
  );
}
