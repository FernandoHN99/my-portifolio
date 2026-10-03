import type { Metadata } from "next";

import { AppShell } from "@/components/product/app-shell";
import { getUserDb } from "@/lib/user-db";
import { getEditingCatalog } from "@/modules/portfolio/application/get-editing-catalog";
import { getMonthContext } from "@/modules/portfolio/application/get-month-context";
import { getMonthPositions } from "@/modules/portfolio/application/get-month-positions";
import { getPositionHistory } from "@/modules/portfolio/application/get-position-history";
import { formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";
import { PositionDetail, type PositionEditing } from "@/modules/portfolio/ui/position-detail";

export const dynamic = "force-dynamic";

type PositionPageProps = {
  params: Promise<{ accountId: string; assetId: string }>;
  searchParams: Promise<{ mes?: string }>;
};

export async function generateMetadata({ params }: PositionPageProps): Promise<Metadata> {
  const { assetId } = await params;
  const asset = await (await getUserDb())
    ?.asset.findUnique({ where: { id: assetId }, select: { name: true } })
    .catch(() => null);

  return { title: asset?.name ?? "Posição" };
}

// Página da posição (spec 016): a conta e o ativo identificam a posição em
// todas as competências; o seletor global de mês continua valendo. O botão
// "Editar posição" abre o mesmo formulário da tabela (spec 043) para a posição
// da competência selecionada.
export default async function PositionPage({ params, searchParams }: PositionPageProps) {
  const [{ accountId, assetId }, { mes }] = await Promise.all([params, searchParams]);
  const { months, selected } = await getMonthContext(mes);
  const [history, month, catalog] = await Promise.all([
    getPositionHistory({ accountId, assetId, months, selected }),
    selected ? getMonthPositions(selected.referenceDate) : Promise.resolve(null),
    getEditingCatalog(),
  ]);
  const editing: PositionEditing | null = month
    ? {
        position:
          month.positions.find((position) => position.accountId === accountId && position.assetId === assetId) ?? null,
        month: {
          id: month.id,
          label: formatMonthCompact(month.referenceDate),
          isCurrent: month.isCurrent,
          quotes: month.quotes,
          isLocked: month.isLocked,
        },
        occupied: month.positions.map((position) => `${position.accountId}:${position.assetId}`),
        catalog,
      }
    : null;

  return (
    <AppShell
      active="positions"
      months={months}
      selectedMonth={selected?.month ?? null}
      context={history ? { kind: "position", label: history.assetName } : undefined}
    >
      <PositionDetail history={history} editing={editing} />
    </AppShell>
  );
}
