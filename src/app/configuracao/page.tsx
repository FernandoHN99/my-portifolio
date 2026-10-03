import { GearSixIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";

import { AppShell } from "@/components/product/app-shell";
import { cn } from "@/lib/utils";
import { requireSessionUser } from "@/modules/auth/session";
import { AccountPanel } from "@/modules/auth/ui/account-panel";
import { BackupPanel } from "@/modules/backup/ui/backup-panel";
import { getMonthContext } from "@/modules/portfolio/application/get-month-context";
import { getTargetEditor } from "@/modules/portfolio/application/get-target-editor";
import { ensureDefaultTargetPlan } from "@/modules/portfolio/application/target-plan-editing";
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
  const user = await requireSessionUser();
  const { months, selected } = await getMonthContext(mes);
  let result = await getTargetEditor(selected?.referenceDate);

  // Sem metas, a página já abre com as metas padrão (spec 048), tiradas das
  // categorias da carteira; sem posições, fica o convite para restaurar.
  if (result.state === "missing" && (await ensureDefaultTargetPlan().catch(() => null)) === "created") {
    result = await getTargetEditor(selected?.referenceDate);
  }

  return (
    <AppShell
      active="none"
      months={months}
      selectedMonth={selected?.month ?? null}
      context={{ kind: "settings", label: "Configuração" }}
    >
      {result.state === "ready" ? (
        <TargetEditor editor={result.editor}>
          <BackupPanel />
          <AccountPanel name={user.name} email={user.email} />
        </TargetEditor>
      ) : (
        // Sem metas, como num banco vazio, ou sem conseguir lê-las, o backup
        // continua disponível para restaurar os dados (spec 042).
        <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-7">
          <div className="flex min-h-[40dvh] flex-col items-center justify-center text-center">
            <span
              className={cn(
                "grid size-12 place-items-center rounded-2xl border border-border bg-card",
                result.state === "error" ? "text-destructive" : "text-primary",
              )}
            >
              {result.state === "error" ? (
                <WarningCircleIcon aria-hidden="true" size={22} weight="duotone" />
              ) : (
                <GearSixIcon aria-hidden="true" size={22} weight="duotone" />
              )}
            </span>
            <h1 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">Metas da carteira</h1>
            {result.state === "error" ? (
              <p role="alert" className="mt-3 max-w-xl text-sm text-muted-foreground">
                Não foi possível ler as metas. {result.message}
              </p>
            ) : (
              <p className="mt-3 max-w-xl text-sm text-muted-foreground">
                Ainda não há posições. Restaure um backup ou inclua posições em Posições: as metas padrão são
                criadas a partir das categorias da carteira.
              </p>
            )}
          </div>
          <div className="space-y-6">
            <BackupPanel />
            <AccountPanel name={user.name} email={user.email} />
          </div>
        </div>
      )}
    </AppShell>
  );
}
