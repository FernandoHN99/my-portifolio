import { cn } from "@/lib/utils";
import { maturityStatus } from "@/modules/portfolio/presentation/maturity";

// Selo de vencimento de um ativo (spec 026), na tabela de Posições e na página
// da posição (spec 016): neutro, "vencendo" a partir de 30 dias ou vencido.
export function MaturityBadge({
  maturityDate,
  referenceDay,
  className,
  testId,
}: {
  maturityDate: string;
  referenceDay: string;
  className?: string;
  testId?: string;
}) {
  const status = maturityStatus(maturityDate, referenceDay);

  return (
    <span
      title={status.title}
      data-testid={testId}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] whitespace-nowrap",
        status.tone === "expired"
          ? "bg-destructive/12 font-semibold text-destructive"
          : status.tone === "soon"
            ? "bg-warning/50 font-semibold text-warning-foreground"
            : "bg-white/[0.04] text-muted-foreground",
        className,
      )}
    >
      {status.label}
      <span className="sr-only">, {status.title.toLocaleLowerCase("pt-BR")}</span>
    </span>
  );
}
