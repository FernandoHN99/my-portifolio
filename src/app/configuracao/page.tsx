import {
  ArrowClockwiseIcon,
  FileSearchIcon,
  GearSixIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/product/app-shell";
import { getTargetPlan } from "@/modules/portfolio/application/get-target-plan";
import { formatSharePercent } from "@/modules/portfolio/presentation/portfolio-format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Configuração da carteira",
};

export default async function SettingsPage() {
  const plan = await getTargetPlan();

  return (
    <AppShell active="none" months={[]} selectedMonth={null}>
      <div className="relative mx-auto w-full max-w-[1100px] px-5 py-8 sm:px-7 sm:py-10 xl:py-12">
        <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[460px] w-[460px]" />

        <header className="border-b border-border/70 pb-8">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Configuração
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-[2.65rem]">
            Metas da carteira
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            {plan ? plan.name : "Nenhum plano de metas ativo."}
          </p>
        </header>

        {plan ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {plan.groups.map((group) => (
              <section key={group.scope} className="premium-panel rounded-[24px] p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-base font-semibold tracking-[-0.025em]">{group.title}</h2>
                    <p className="mt-1 text-[11px] text-muted-foreground">{group.description}</p>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {formatSharePercent(group.totalPercentage)}
                  </span>
                </div>

                <div className="mt-6 space-y-3">
                  {group.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3">
                      <span className="text-xs text-foreground/85">
                        {item.secondaryLabel
                          ? `${item.primaryLabel} · ${item.secondaryLabel}`
                          : item.primaryLabel}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {formatSharePercent(item.percentage)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-10 flex flex-col items-center text-center">
            <span className="grid size-12 place-items-center rounded-2xl border border-border bg-card text-primary">
              <GearSixIcon aria-hidden="true" size={22} weight="duotone" />
            </span>
            <p className="mt-5 text-sm text-muted-foreground">
              Importe as metas do Excel para configurar a carteira.
            </p>
          </div>
        )}

        <section className="premium-panel mt-6 rounded-[24px] p-5 sm:p-6">
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
