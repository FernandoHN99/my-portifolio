import { GearSixIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";

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
    </AppShell>
  );
}
