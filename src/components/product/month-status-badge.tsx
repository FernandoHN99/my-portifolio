import type { PortfolioMonthStatus } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

// Selo do status da competência ao lado do mês: rascunho, para o mês ainda
// em ajuste, e finalizado, para o mês corrente fechado pelo usuário (spec
// 032). As importadas da planilha não têm selo.
export function MonthStatusBadge({ status }: { status: PortfolioMonthStatus }) {
  if (status === "IMPORTED") {
    return null;
  }

  return (
    <span
      data-testid="month-status"
      className={cn(
        "rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-[0.08em] uppercase",
        status === "DRAFT" ? "bg-warning/10 text-warning-foreground" : "bg-primary/10 text-primary",
      )}
    >
      {status === "DRAFT" ? "Rascunho" : "Finalizado"}
    </span>
  );
}
