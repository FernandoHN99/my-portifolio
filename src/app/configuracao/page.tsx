import { GearSixIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";

import { AppShell } from "@/components/product/app-shell";
import { BackupPanel } from "@/modules/backup/ui/backup-panel";
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
        <TargetEditor editor={editor}>
          <BackupPanel />
        </TargetEditor>
      ) : (
        // Sem metas, como num banco vazio, o backup continua disponível para
        // restaurar os dados (spec 042).
        <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-7">
          <div className="flex min-h-[40dvh] flex-col items-center justify-center text-center">
            <span className="grid size-12 place-items-center rounded-2xl border border-border bg-card text-primary">
              <GearSixIcon aria-hidden="true" size={22} weight="duotone" />
            </span>
            <h1 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">Metas da carteira</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Importe as metas do Excel ou restaure um backup para configurar a carteira.
            </p>
          </div>
          <BackupPanel />
        </div>
      )}
    </AppShell>
  );
}
