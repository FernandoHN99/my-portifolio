import type { Metadata } from "next";

import { AppShell } from "@/components/product/app-shell";
import { getPrismaClient } from "@/lib/prisma";
import { getMonthContext } from "@/modules/portfolio/application/get-month-context";
import { getPositionHistory } from "@/modules/portfolio/application/get-position-history";
import { PositionDetail } from "@/modules/portfolio/ui/position-detail";

export const dynamic = "force-dynamic";

type PositionPageProps = {
  params: Promise<{ accountId: string; assetId: string }>;
  searchParams: Promise<{ mes?: string }>;
};

export async function generateMetadata({ params }: PositionPageProps): Promise<Metadata> {
  const { assetId } = await params;
  const asset = await getPrismaClient()
    ?.asset.findUnique({ where: { id: assetId }, select: { name: true } })
    .catch(() => null);

  return { title: asset?.name ?? "Posição" };
}

// Página da posição (spec 016): a conta e o ativo identificam a posição em
// todas as competências; o seletor global de mês continua valendo.
export default async function PositionPage({ params, searchParams }: PositionPageProps) {
  const [{ accountId, assetId }, { mes }] = await Promise.all([params, searchParams]);
  const { months, selected } = await getMonthContext(mes);
  const history = await getPositionHistory({ accountId, assetId, months, selected });

  return (
    <AppShell active="positions" months={months} selectedMonth={selected?.month ?? null}>
      <PositionDetail history={history} />
    </AppShell>
  );
}
