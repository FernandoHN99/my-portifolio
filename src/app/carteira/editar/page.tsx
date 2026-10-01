import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/product/app-shell";
import { getEditablePortfolioMonth } from "@/modules/portfolio/application/get-editable-portfolio-month";
import { PositionEditor } from "@/modules/portfolio/ui/position-editor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Editar posições" };

export default async function EditPortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { salvo } = await searchParams;
  const month = await getEditablePortfolioMonth();

  return (
    <AppShell active="none" months={[]} selectedMonth={null}>
      {month ? <PositionEditor month={month} saved={salvo === "1"} /> : <EmptyDraft />}
    </AppShell>
  );
}

function EmptyDraft() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-64px)] max-w-xl flex-col items-center justify-center px-5 py-16 text-center lg:min-h-dvh">
      <p className="text-sm text-muted-foreground">Não existe uma competência em rascunho para editar.</p>
      <Link
        href="/atualizacao"
        className="mt-5 inline-flex h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none transition-[background-color,transform] duration-150 ease-out hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.98]"
      >
        Preparar competência
      </Link>
    </div>
  );
}
