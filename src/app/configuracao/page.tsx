import { ArrowClockwiseIcon, FileSearchIcon, GearSixIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/product/app-shell";
import { getMonthContext } from "@/modules/portfolio/application/get-month-context";
import { getTargetEditor } from "@/modules/portfolio/application/get-target-editor";
import { TargetEditor } from "@/modules/portfolio/ui/target-editor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Configuração da carteira",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const { months, selected } = await getMonthContext(mes);
  const editor = await getTargetEditor(selected?.referenceDate);

  return (
    <AppShell active="none" months={months} selectedMonth={selected?.month ?? null}>
      {editor ? (
        <TargetEditor editor={editor} />
      ) : (
        <div className="mx-auto flex min-h-[50dvh] max-w-xl flex-col items-center justify-center px-5 text-center">
          <span className="grid size-12 place-items-center rounded-2xl border border-border bg-card text-primary">
            <GearSixIcon aria-hidden="true" size={22} weight="duotone" />
          </span>
          <h1 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">Metas da carteira</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Importe as metas do Excel para configurar a carteira.
          </p>
        </div>
      )}

      <div className="mx-auto w-full max-w-[1472px] px-5 pb-12 sm:px-7 xl:px-12">
        <section className="premium-panel rounded-[24px] p-5 sm:p-6">
          <h2 className="text-base font-semibold tracking-[-0.025em]">Dados da carteira</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Origem da carga inicial e preparação da próxima competência.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Link
              href="/importacao"
              className="metric-card flex items-center gap-3 rounded-2xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <FileSearchIcon aria-hidden="true" size={17} weight="duotone" />
              </span>
              <span>
                <span className="block text-sm font-medium text-foreground">Revisão de dados</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  Achados da importação do Excel
                </span>
              </span>
            </Link>

            <Link
              href="/atualizacao"
              className="metric-card flex items-center gap-3 rounded-2xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <ArrowClockwiseIcon aria-hidden="true" size={17} weight="duotone" />
              </span>
              <span>
                <span className="block text-sm font-medium text-foreground">Atualização</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  Cotações e rascunho da competência
                </span>
              </span>
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
