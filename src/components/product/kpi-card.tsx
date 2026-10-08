import type { ReactNode } from "react";
import { tv } from "tailwind-variants";

// O card de indicador do app, uma peça só para todas as áreas: rótulo à
// esquerda, ícone à direita, valor em destaque e uma linha de detalhe, com o
// hover central de `.metric-card` (specs 011, 024 e 090). Investimentos, a
// página da posição, Recebimentos, Previdência e Gastos familiares usam este
// componente; Gastos familiares, mais simples, não leva ícone. Se um card tiver
// ícone, ele fica à direita, nunca ao lado do rótulo.
//
// Cor: o ícone segue o tom (menta, violeta nas saídas de Recebimentos e no que
// passa do limite da Previdência, vermelho na queda de Investimentos) e o
// valor só ganha cor quando o tom diz algo; neutro fica em `foreground`.
// As variantes vivem em `tailwind-variants`, como em todo componente atômico.

export type KpiTone = "up" | "down" | "spent" | "neutral";

const kpiCard = tv({
  slots: {
    root: "metric-card rounded-2xl p-4 sm:p-5",
    label: "text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase",
    chip: "grid size-8 shrink-0 place-items-center rounded-lg ring-1",
    value: "mt-5 font-mono font-medium",
    detail: "mt-1.5 text-xs text-muted-foreground",
  },
  variants: {
    tone: {
      up: { chip: "bg-primary/8 text-primary ring-primary/10", value: "text-primary" },
      neutral: { chip: "bg-primary/8 text-primary ring-primary/10", value: "text-foreground" },
      down: { chip: "bg-destructive/10 text-destructive ring-destructive/15", value: "text-destructive" },
      spent: { chip: "bg-chart-spent/10 text-chart-spent ring-chart-spent/15", value: "text-chart-spent" },
    },
    // Cards em duas colunas no celular: o valor diminui até caber (de 20 a 15 px).
    dense: {
      true: { value: "text-xl tracking-[-0.05em] min-[360px]:text-[15px] min-[400px]:text-base sm:text-xl xl:text-2xl xl:tracking-[-0.04em]" },
      false: { value: "text-2xl tracking-[-0.04em]" },
    },
    emphasis: { true: {}, false: {} },
  },
  compoundVariants: [
    { emphasis: true, tone: ["up", "neutral"], class: { root: "border-primary/25" } },
    { emphasis: true, tone: "down", class: { root: "border-destructive/30" } },
    { emphasis: true, tone: "spent", class: { root: "border-chart-spent/35" } },
  ],
  defaultVariants: { tone: "neutral", dense: false, emphasis: false },
});

export function KpiCard({
  label,
  icon,
  value,
  detail,
  tone = "neutral",
  testId,
  valueText,
  valueData,
  valueClassName,
  dense = false,
  emphasis = false,
  footer,
}: {
  label: string;
  /** Ícone do selo à direita; sem ele, o card fica só com rótulo, valor e detalhe. */
  icon?: ReactNode;
  value: ReactNode;
  detail: ReactNode;
  tone?: KpiTone;
  testId?: string;
  /** Valor formatado, para leitura fora da animação. */
  valueText?: string;
  /** Atributos `data-*` do valor, como `data-cents`, que os testes leem. */
  valueData?: Record<`data-${string}`, string | number | undefined>;
  /** Cor do valor quando ela depende do número, como o saldo positivo ou negativo. */
  valueClassName?: string;
  /** Cards em duas colunas no celular: o valor diminui até caber. */
  dense?: boolean;
  /** Borda na cor do tom, para o indicador que resume a tela. */
  emphasis?: boolean;
  /** Um complemento discreto abaixo do detalhe, como os destaques da posição. */
  footer?: ReactNode;
}) {
  const slots = kpiCard({ tone, dense, emphasis });

  return (
    <article className={slots.root()}>
      <div className="flex items-start justify-between gap-4">
        <p className={slots.label()}>{label}</p>
        {icon ? <span className={slots.chip()}>{icon}</span> : null}
      </div>
      <p data-testid={testId} data-value={valueText} {...valueData} className={slots.value({ class: valueClassName })}>
        {value}
      </p>
      <p className={slots.detail()}>{detail}</p>
      {footer}
    </article>
  );
}
