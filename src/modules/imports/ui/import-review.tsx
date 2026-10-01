import {
  ArrowLeftIcon,
  CheckCircleIcon,
  FileXlsIcon,
  InfoIcon,
  RowsIcon,
  WarningCircleIcon,
  WarningOctagonIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import type {
  ImportIssueItem,
  ImportOverview,
} from "@/modules/imports/application/get-latest-import-overview";
import { countImportIssues } from "@/modules/imports/application/get-latest-import-overview";
import {
  formatImportDate,
  getIssueLabel,
  getSourceLabel,
} from "@/modules/imports/presentation/import-labels";

export function ImportReview({ overview }: { overview: ImportOverview | null }) {
  if (!overview) {
    return <EmptyImportReview />;
  }

  const issueCount = countImportIssues(overview);

  return (
    <div className="relative mx-auto w-full max-w-[1472px] px-5 py-8 sm:px-7 sm:py-10 xl:px-12 xl:py-12">
      <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[420px] w-[420px]" />

      <Link
        href="/"
        className="group inline-flex items-center gap-2 rounded-lg text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <ArrowLeftIcon className="transition-transform duration-150 group-hover:-translate-x-0.5" aria-hidden="true" size={14} />
        Voltar para visão geral
      </Link>

      <header className="mt-7 flex flex-col gap-7 border-b border-border/70 pb-9 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-warning-foreground uppercase">
            <span className="size-1.5 rounded-full bg-warning-foreground shadow-[0_0_12px_var(--warning-foreground)]" />
            Revisão necessária
          </div>
          <h1 className="mt-4 text-[clamp(2rem,5vw,4.1rem)] leading-[0.98] font-semibold tracking-[-0.058em] text-balance">
            {issueCount} achados, sem correções silenciosas.
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
            Cada item abaixo aponta para a origem no Excel. Esta etapa preserva
            o histórico enquanto separamos evidência, regra e decisão.
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card/75 px-4 py-3.5">
          <span className="grid size-9 place-items-center rounded-xl bg-[#1f6f43]/20 text-[#6be3a7]">
            <FileXlsIcon aria-hidden="true" size={18} weight="duotone" />
          </span>
          <div>
            <p className="max-w-[230px] truncate font-mono text-[11px] text-foreground/85">{overview.sourcePath}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{formatImportDate(overview.completedAt)}</p>
          </div>
        </div>
      </header>

      <section aria-label="Categorias de achados" className="mt-7 grid gap-3 md:grid-cols-3">
        {overview.issueGroups.map((group) => (
          <article key={`${group.severity}-${group.code}`} className="metric-card rounded-2xl p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <span className="grid size-8 place-items-center rounded-lg bg-warning/10 text-warning-foreground ring-1 ring-warning/15">
                <IssueIcon severity={group.severity} />
              </span>
              <span className="font-mono text-2xl font-medium tracking-[-0.04em]">{group.count}</span>
            </div>
            <h2 className="mt-5 text-sm font-medium text-foreground/90">{getIssueLabel(group.code)}</h2>
            <p className="mt-1 font-mono text-[9px] tracking-[0.08em] text-muted-foreground uppercase">{group.code}</p>
          </article>
        ))}
      </section>

      <section className="mt-7 premium-panel overflow-hidden rounded-[24px]" aria-labelledby="issues-title">
        <div className="flex flex-col gap-3 border-b border-border/70 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
              Evidências preservadas
            </p>
            <h2 id="issues-title" className="mt-2 text-base font-semibold tracking-[-0.025em]">
              Fila de revisão
            </h2>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-warning/15 bg-warning/[0.07] px-3 py-1.5 text-[11px] font-medium text-warning-foreground">
            <WarningCircleIcon aria-hidden="true" size={14} weight="fill" />
            {issueCount} pendentes
          </span>
        </div>

        <ol className="divide-y divide-border/65">
          {overview.issues.map((issue, index) => (
            <IssueRow key={issue.id} issue={issue} index={index + 1} />
          ))}
        </ol>
      </section>

      <aside className="mt-6 flex items-start gap-3 rounded-2xl border border-primary/10 bg-primary/[0.035] p-4 text-xs leading-5 text-muted-foreground sm:p-5">
        <CheckCircleIcon className="mt-0.5 shrink-0 text-primary" aria-hidden="true" size={16} weight="fill" />
        <p>
          A separação entre instituição e conta já foi aprovada. Ativos iguais
          em custodiantes diferentes continuarão como posições independentes e
          serão consolidados apenas nas análises.
        </p>
      </aside>
    </div>
  );
}

function IssueRow({ issue, index }: { issue: ImportIssueItem; index: number }) {
  const location = [
    issue.sourceSheet,
    issue.sourceRow ? `linha ${issue.sourceRow}` : null,
    issue.sourceField,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="grid gap-4 p-5 transition-colors duration-150 hover:bg-white/[0.018] sm:grid-cols-[44px_minmax(0,1fr)_auto] sm:items-start sm:p-6">
      <span className="grid size-9 place-items-center rounded-xl border border-border/80 bg-white/[0.025] font-mono text-[10px] text-muted-foreground">
        {String(index).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium text-foreground/90">{getIssueLabel(issue.code)}</h3>
          <span className="rounded-full border border-warning/15 bg-warning/[0.06] px-2 py-0.5 text-[9px] font-semibold tracking-[0.1em] text-warning-foreground uppercase">
            Pendente
          </span>
        </div>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">{issue.message}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-muted-foreground/80">
          {location ? (
            <span className="inline-flex items-center gap-1.5">
              <RowsIcon aria-hidden="true" size={12} />
              {location}
            </span>
          ) : null}
          {issue.sourceTable ? <span>{getSourceLabel(issue.sourceTable)}</span> : null}
        </div>
      </div>
      <span className="w-fit font-mono text-[9px] tracking-[0.06em] text-muted-foreground/60 uppercase sm:pt-1">
        {issue.code}
      </span>
    </li>
  );
}

function IssueIcon({ severity }: { severity: ImportIssueItem["severity"] }) {
  if (severity === "ERROR") {
    return <WarningOctagonIcon aria-hidden="true" size={16} weight="duotone" />;
  }

  if (severity === "INFO") {
    return <InfoIcon aria-hidden="true" size={16} weight="duotone" />;
  }

  return <WarningCircleIcon aria-hidden="true" size={16} weight="duotone" />;
}

function EmptyImportReview() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-64px)] max-w-xl flex-col items-center justify-center px-5 py-16 text-center lg:min-h-[100dvh]">
      <span className="grid size-12 place-items-center rounded-2xl border border-border bg-card text-muted-foreground">
        <FileXlsIcon aria-hidden="true" size={22} weight="duotone" />
      </span>
      <h1 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">Nenhuma importação disponível</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Inicie o PostgreSQL e execute a carga do Excel para revisar os achados.
      </p>
      <Link className="mt-6 text-sm font-medium text-primary hover:text-primary/80" href="/">
        Voltar para visão geral
      </Link>
    </div>
  );
}
