import Link from "next/link";
import {
  ArrowRightIcon,
  ChartDonutIcon,
  CheckCircleIcon,
  DatabaseIcon,
  FileXlsIcon,
  HouseIcon,
  LockKeyIcon,
  StackIcon,
} from "@phosphor-icons/react/dist/ssr";

import { getDatabaseStatus } from "@/lib/database-status";
import { getLatestImportSummary } from "@/lib/import-summary";

export const dynamic = "force-dynamic";

const baseSteps = [
  {
    title: "Fundação local",
    description: "Next.js, PostgreSQL e verificações do projeto.",
    status: "Concluída",
    current: false,
  },
  {
    title: "Importação do Excel",
    description: "Carga preservada e inconsistências para revisão.",
    status: "Em andamento",
    current: true,
  },
  {
    title: "Atualização mensal",
    description: "Copiar o mês anterior e buscar cotações sob demanda.",
    status: "Planejada",
    current: false,
  },
];

export default async function Home() {
  const [database, latestImport] = await Promise.all([
    getDatabaseStatus(),
    getLatestImportSummary(),
  ]);
  const databaseOnline = database.state === "online";
  const importCompleted = Boolean(latestImport?.completedAt);
  const steps = baseSteps.map((step) =>
    step.title === "Importação do Excel" && importCompleted
      ? {
          ...step,
          description: `${latestImport?.rowsRead ?? 0} linhas preservadas e ${latestImport?.issues ?? 0} achados para revisão.`,
        }
      : step,
  );

  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto grid min-h-[100dvh] max-w-[1600px] lg:grid-cols-[240px_1fr]">
        <aside className="border-b border-sidebar-border bg-sidebar px-5 py-5 lg:border-r lg:border-b-0 lg:px-4 lg:py-6">
          <div className="flex items-center justify-between lg:block">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-md text-sm font-semibold tracking-[-0.02em] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-[0_1px_0_rgba(255,255,255,0.2)_inset]">
                <ChartDonutIcon aria-hidden="true" size={17} weight="bold" />
              </span>
              Meu portfólio
            </Link>

            <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground lg:hidden">
              Local
            </span>
          </div>

          <nav aria-label="Navegação principal" className="mt-5 hidden lg:block">
            <Link
              href="/"
              aria-current="page"
              className="flex h-9 items-center gap-2.5 rounded-lg bg-sidebar-accent px-3 text-sm font-medium text-sidebar-accent-foreground outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HouseIcon aria-hidden="true" size={16} weight="fill" />
              Visão geral
            </Link>
          </nav>

          <div className="mt-6 hidden border-t border-sidebar-border pt-5 lg:block">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <LockKeyIcon aria-hidden="true" size={14} />
              Acesso somente local
            </div>
          </div>
        </aside>

        <section className="min-w-0 px-5 py-7 sm:px-8 sm:py-10 xl:px-12">
          <header className="flex flex-col gap-5 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Visão geral
              </p>
              <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-[-0.045em] text-balance sm:text-[2.7rem] sm:leading-[1.05]">
                Sua carteira começa pelo histórico real.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                {importCompleted
                  ? "O histórico foi preservado. Agora podemos revisar as divergências antes de normalizar a carteira."
                  : "A base local está pronta. O próximo passo é importar a planilha sem perder a origem e revisar cada divergência."}
              </p>
            </div>

            <Link
              href="#proximos-passos"
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground outline-none transition-[background-color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.98] sm:self-auto"
            >
              Ver próximas etapas
              <ArrowRightIcon aria-hidden="true" size={15} weight="bold" />
            </Link>
          </header>

          <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.7fr)]">
            <section
              aria-labelledby="origem-title"
              className="overflow-hidden rounded-2xl border border-border bg-card"
            >
              <div className="flex items-start justify-between gap-6 border-b border-border p-5 sm:p-6">
                <div className="flex gap-3.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <FileXlsIcon aria-hidden="true" size={20} weight="duotone" />
                  </span>
                  <div>
                    <h2 id="origem-title" className="font-semibold tracking-[-0.02em]">
                      Fonte financeira
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      raw_file/01-Investimentos.xlsm
                    </p>
                  </div>
                </div>
                <span
                  className={
                    importCompleted
                      ? "rounded-full border border-border bg-success px-2.5 py-1 text-xs font-medium text-success-foreground"
                      : "rounded-full border border-warning-border bg-warning px-2.5 py-1 text-xs font-medium text-warning-foreground"
                  }
                >
                  {importCompleted
                    ? `${latestImport?.issues ?? 0} achados para revisão`
                    : "Aguardando importação"}
                </span>
              </div>

              <dl className="grid grid-cols-2 divide-x divide-border sm:grid-cols-4">
                {[
                  ["6", "abas"],
                  ["14", "tabelas"],
                  ["10", "pivôs"],
                  ["3.266", "fórmulas"],
                ].map(([value, label]) => (
                  <div key={label} className="px-5 py-5 sm:px-6">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 font-mono text-lg font-medium tracking-[-0.03em]">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section
              aria-labelledby="environment-title"
              className="rounded-2xl border border-border bg-card p-5 sm:p-6"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Ambiente
                  </p>
                  <h2 id="environment-title" className="mt-1 font-semibold tracking-[-0.02em]">
                    Serviços locais
                  </h2>
                </div>
                <DatabaseIcon aria-hidden="true" size={21} weight="duotone" />
              </div>

              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/70 px-3.5 py-3">
                  <span className="text-sm">Aplicação</span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success-foreground">
                    <span className="size-1.5 rounded-full bg-success-foreground" />
                    Disponível
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/70 px-3.5 py-3">
                  <span className="text-sm">PostgreSQL</span>
                  <span
                    data-testid="database-status"
                    className={
                      databaseOnline
                        ? "inline-flex items-center gap-1.5 text-xs font-medium text-success-foreground"
                        : "inline-flex items-center gap-1.5 text-xs font-medium text-warning-foreground"
                    }
                  >
                    <span
                      className={
                        databaseOnline
                          ? "size-1.5 rounded-full bg-success-foreground"
                          : "size-1.5 rounded-full bg-warning-foreground"
                      }
                    />
                    {database.label}
                  </span>
                </div>
              </div>

              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                {database.detail}
              </p>
            </section>
          </div>

          <section id="proximos-passos" aria-labelledby="steps-title" className="mt-10 scroll-mt-8">
            <div className="flex items-end justify-between gap-5">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Implantação incremental
                </p>
                <h2 id="steps-title" className="mt-1 text-xl font-semibold tracking-[-0.035em]">
                  Próximos passos
                </h2>
              </div>
              <StackIcon className="text-muted-foreground" aria-hidden="true" size={22} />
            </div>

            <ol className="mt-5 divide-y divide-border border-y border-border">
              {steps.map((step, index) => (
                <li key={step.title} className="grid gap-3 py-5 sm:grid-cols-[36px_1fr_auto] sm:items-center">
                  <span
                    className={
                      step.status === "Concluída"
                        ? "grid size-8 place-items-center rounded-full bg-success text-success-foreground"
                        : step.current
                          ? "grid size-8 place-items-center rounded-full bg-primary text-primary-foreground"
                          : "grid size-8 place-items-center rounded-full border border-border bg-card text-xs font-medium text-muted-foreground"
                    }
                  >
                    {step.status === "Concluída" ? (
                      <CheckCircleIcon aria-hidden="true" size={17} weight="fill" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <div>
                    <h3 className="text-sm font-medium">{step.title}</h3>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground sm:text-right">
                    {step.status}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </section>
      </div>
    </main>
  );
}
