import type { Icon } from "@phosphor-icons/react/dist/lib/types";
import type { ReactNode } from "react";

import { formatCents, type Cents } from "@/lib/money";
import { cn } from "@/lib/utils";

// Peças compartilhadas das áreas financeiras pessoais (Recebimentos e
// Previdência, specs 088 e 089): os tons menta e violeta do guia de estilos, a
// barra de taxa e o cartão de resumo com ícone, brilho e detalhe.

export type Tone = "saved" | "spent" | "neutral";

// Classes completas por tom, para o Tailwind encontrá-las no código: menta para
// o que entra e sobra, violeta para o que sai (guia de estilos).
export const TONES: Record<Tone, { dot: string; chip: string; glow: string; tint: string; rule: string; text: string }> = {
  saved: {
    dot: "bg-chart-saved",
    chip: "bg-chart-saved/[0.12] text-chart-saved",
    glow: "bg-chart-saved/[0.13]",
    tint: "bg-chart-saved/[0.05]",
    rule: "border-chart-saved/45",
    text: "text-chart-saved",
  },
  spent: {
    dot: "bg-chart-spent",
    chip: "bg-chart-spent/[0.13] text-chart-spent",
    glow: "bg-chart-spent/[0.14]",
    tint: "bg-chart-spent/[0.055]",
    rule: "border-chart-spent/45",
    text: "text-chart-spent",
  },
  neutral: {
    dot: "bg-muted-foreground/60",
    chip: "bg-white/[0.06] text-muted-foreground",
    glow: "bg-white/[0.05]",
    tint: "bg-white/[0.025]",
    rule: "border-border",
    text: "text-muted-foreground",
  },
};

/** Barra de uma taxa em %: menta, ou violeta quando ela é negativa. */
export function RateBar({
  rate,
  label = "Taxa de poupança",
  className,
}: {
  rate: number;
  /** Nome para leitores de tela: o que a barra mede. */
  label?: string;
  className?: string;
}) {
  const width = Math.min(Math.max(rate, 0), 100);

  return (
    <span
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={width}
      className={cn("block shrink-0 overflow-hidden rounded-full bg-white/[0.07]", className)}
    >
      <span
        className={cn("block h-full rounded-full", rate < 0 ? "bg-chart-spent" : "bg-gradient-to-r from-chart-saved/70 to-chart-saved")}
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

export function SummaryCard({
  tone,
  icon: IconComponent,
  label,
  cents,
  detail,
  valueClassName = "text-foreground",
  signed = false,
  emphasis = false,
  testId,
  children,
}: {
  tone: Tone;
  icon: Icon;
  label: string;
  cents: Cents;
  detail: string;
  valueClassName?: string;
  signed?: boolean;
  emphasis?: boolean;
  testId: string;
  children?: ReactNode;
}) {
  return (
    <article
      className={cn(
        "metric-card relative overflow-hidden rounded-2xl p-4 sm:p-5",
        emphasis && (tone === "spent" ? "border-chart-spent/35" : "border-primary/30"),
      )}
    >
      <span aria-hidden="true" className={cn("pointer-events-none absolute -top-10 -right-8 size-28 rounded-full blur-2xl", TONES[tone].glow)} />
      <div className="relative flex items-center gap-2.5">
        <span className={cn("grid size-8 place-items-center rounded-lg", TONES[tone].chip)}>
          <IconComponent aria-hidden="true" size={17} weight="duotone" />
        </span>
        <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      </div>
      <p
        data-testid={testId}
        data-cents={cents}
        className={cn(
          "relative mt-4 font-mono text-xl font-medium tracking-[-0.05em] min-[360px]:text-[15px] min-[400px]:text-base sm:text-xl xl:text-2xl xl:tracking-[-0.04em]",
          valueClassName,
        )}
      >
        {formatCents(cents, { signed })}
      </p>
      <p className="relative mt-1.5 text-xs text-muted-foreground">{detail}</p>
      <div className="relative">{children}</div>
    </article>
  );
}
