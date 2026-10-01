import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  CurrencyCircleDollarIcon,
  PencilSimpleLineIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { refreshPortfolioMonthAction } from "@/app/actions/refresh-portfolio-month";
import type { MonthlyUpdateOverview } from "@/modules/portfolio/application/get-monthly-update";
import { formatBrl, formatMonth } from "@/modules/portfolio/presentation/portfolio-format";
import { RefreshPortfolioButton } from "@/modules/portfolio/ui/refresh-portfolio-button";

export function MonthlyUpdateView({ update }: { update: MonthlyUpdateOverview }) {
  const successes = update.quoteResults.filter((result) => result.status === "SUCCESS");
  const failures = update.quoteResults.filter((result) => result.status === "FAILED");
  const status = getStatusPresentation(update.status);

  return (
    <div className="relative mx-auto w-full max-w-[1280px] px-5 py-8 sm:px-7 sm:py-10 xl:px-12 xl:py-12">
      <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[420px] w-[420px]" />

      <Link
        href="/"
        className="group inline-flex items-center gap-2 rounded-lg text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <ArrowLeftIcon className="transition-transform duration-150 group-hover:-translate-x-0.5" aria-hidden="true" size={14} />
        Voltar para visão geral
      </Link>

      <header className="mt-7 flex flex-col gap-7 border-b border-border/70 pb-9 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className={`text-[11px] font-semibold tracking-[0.16em] uppercase ${status.color}`}>{status.eyebrow}</p>
          <h1 className="mt-4 text-[clamp(2rem,5vw,4rem)] leading-[0.98] font-semibold tracking-[-0.058em]">
            Atualização de {formatMonth(update.targetMonth)}
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
            {update.positionCount} posições copiadas de {formatMonth(update.sourceMonth)}.
            As quantidades permanecem editáveis no rascunho.
          </p>
        </div>

        {update.status === "COMPLETED_WITH_ISSUES" || update.status === "FAILED" ? (
          <form action={refreshPortfolioMonthAction}>
            <RefreshPortfolioButton />
          </form>
        ) : null}
      </header>

      <section aria-label="Resumo da atualização" className="mt-7 grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Posições copiadas" value={String(update.positionCount)} tone="default" />
        <SummaryCard label="Cotações atualizadas" value={String(successes.length)} tone="success" />
        <SummaryCard label="Cotações pendentes" value={String(failures.length)} tone={failures.length ? "warning" : "success"} />
      </section>

      <section className="premium-panel mt-7 overflow-hidden rounded-[24px]" aria-labelledby="quotes-title">
        <div className="flex items-center justify-between gap-4 border-b border-border/70 p-5 sm:p-6">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">Preços de mercado</p>
            <h2 id="quotes-title" className="mt-2 text-base font-semibold tracking-[-0.025em]">Resultado por símbolo</h2>
          </div>
          <CurrencyCircleDollarIcon aria-hidden="true" className="text-primary" size={20} weight="duotone" />
        </div>

        {update.quoteResults.length > 0 ? (
          <div className="divide-y divide-border/60">
            {update.quoteResults.map((result) => (
              <div key={result.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[80px_130px_minmax(0,1fr)_auto] sm:items-center sm:px-6">
                <div className="flex items-center gap-2">
                  {result.status === "SUCCESS" ? (
                    <CheckCircleIcon aria-hidden="true" className="text-primary" size={15} weight="fill" />
                  ) : (
                    <XCircleIcon aria-hidden="true" className="text-warning-foreground" size={15} weight="fill" />
                  )}
                  <span className="font-mono text-xs font-medium">{result.symbol}</span>
                </div>
                <span className="text-[10px] tracking-[0.06em] text-muted-foreground uppercase">{result.provider}</span>
                <p className="text-xs leading-5 text-muted-foreground">
                  {result.status === "SUCCESS" ? "Cotação validada" : result.errorMessage}
                </p>
                <span className="font-mono text-xs text-foreground/85 sm:text-right">
                  {result.valueBrl === null ? result.errorCode : formatBrl(result.valueBrl)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma cotação foi processada.</div>
        )}
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-4">
        <Link className="group inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground" href="/">
          Abrir carteira
          <ArrowRightIcon className="text-primary transition-transform group-hover:translate-x-0.5" aria-hidden="true" size={14} />
        </Link>
        {update.status === "COMPLETED" ? (
          <Link
            href="/carteira/editar"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none transition-[background-color,transform] duration-150 ease-out hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.98]"
          >
            <PencilSimpleLineIcon aria-hidden="true" size={15} weight="bold" />
            Editar posições
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyMonthlyUpdate() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-64px)] max-w-xl flex-col items-center justify-center px-5 py-16 text-center lg:min-h-[100dvh]">
      <span className="grid size-12 place-items-center rounded-2xl border border-border bg-card text-primary">
        <ClockIcon aria-hidden="true" size={22} weight="duotone" />
      </span>
      <h1 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">Prepare a próxima competência</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Copie as posições do último mês e consulte as cotações somente quando precisar.
      </p>
      <form action={refreshPortfolioMonthAction} className="mt-6">
        <RefreshPortfolioButton />
      </form>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: "default" | "success" | "warning" }) {
  const icon = tone === "warning" ? WarningCircleIcon : CheckCircleIcon;
  const Icon = icon;

  return (
    <article className="metric-card rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
        <Icon aria-hidden="true" className={tone === "warning" ? "text-warning-foreground" : tone === "success" ? "text-primary" : "text-muted-foreground"} size={16} weight="duotone" />
      </div>
      <p className="mt-5 font-mono text-2xl font-medium tracking-[-0.04em]">{value}</p>
    </article>
  );
}

function getStatusPresentation(status: MonthlyUpdateOverview["status"]) {
  if (status === "COMPLETED") {
    return { eyebrow: "Atualização concluída", color: "text-primary" };
  }
  if (status === "COMPLETED_WITH_ISSUES") {
    return { eyebrow: "Ação necessária", color: "text-warning-foreground" };
  }
  if (status === "FAILED") {
    return { eyebrow: "Atualização interrompida", color: "text-destructive" };
  }
  return { eyebrow: "Atualizando cotações", color: "text-primary" };
}
