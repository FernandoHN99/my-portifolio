import type { ComponentProps } from "react";
import { tv, type VariantProps } from "tailwind-variants";

// O selo de estado do app (spec 090): pílula de 10 px em caixa alta, como o
// `DirectionBadge` de Gastos familiares. O tom diz o que o selo significa:
// `primary` para o que conta a favor, `spent` para saída ou excesso, `accent`
// para qualificadores (saldo inicial, proporcional), `warning` para pendência
// e `neutral` para o que está fora do cálculo.
const badge = tv({
  base: "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-sans text-[10px] font-semibold tracking-[0.04em] whitespace-nowrap uppercase",
  variants: {
    tone: {
      primary: "bg-primary/10 text-primary",
      spent: "bg-chart-spent/10 text-chart-spent",
      accent: "bg-accent text-accent-foreground",
      warning: "bg-warning/50 text-warning-foreground",
      neutral: "bg-white/[0.06] text-muted-foreground",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ tone, className, ...props }: ComponentProps<"span"> & VariantProps<typeof badge>) {
  return <span className={badge({ tone, className })} {...props} />;
}
