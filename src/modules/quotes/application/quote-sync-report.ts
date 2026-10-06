import type { CdiReport } from "@/modules/portfolio/application/cdi-positions";
import type { SelicSyncReport } from "@/modules/quotes/application/selic-reference";
import type { QuoteSyncOutcome } from "@/modules/quotes/application/sync-quotes";

// Linhas de registro de uma execução do job de cotações (spec 053), iguais no
// terminal, na função do Neon e no GitHub Actions, para os logs de cada lugar
// contarem a mesma coisa.
export function describeQuoteSync(outcome: QuoteSyncOutcome): string[] {
  switch (outcome.state) {
    case "idle":
      return ["Cotações em dia: nenhum símbolo devido.", ...describeSelic(outcome.selic), ...describeCdi(outcome.cdi)];
    case "busy":
      return [`Outra execução está em andamento (${outcome.runId}).`];
    case "unavailable":
      return [`Job indisponível: ${outcome.message}`];
    case "done":
      return [
        `Execução ${outcome.runId}: ${outcome.status}.`,
        ...(outcome.succeeded.length > 0
          ? [`Cotações atualizadas (${outcome.succeeded.length}): ${outcome.succeeded.join(", ")}.`]
          : []),
        ...outcome.failed.map((failure) => `Falha em ${failure.symbol} (${failure.errorCode}): ${failure.errorMessage}`),
        ...outcome.histories.map((report) =>
          report.status === "FAILED"
            ? `Histórico de ${report.symbol}: falhou: ${report.message}`
            : report.status === "UP_TO_DATE"
              ? `Histórico de ${report.symbol}: já completo.`
              : `Histórico de ${report.symbol} (${report.provider}): ${report.months} meses guardados.`,
        ),
        ...describeSelic(outcome.selic),
        ...describeCdi(outcome.cdi),
      ];
  }
}

/** Execução que deve aparecer como falha para quem agendou (código de saída 1). */
export function isQuoteSyncFailure(outcome: QuoteSyncOutcome) {
  return outcome.state === "unavailable" ||
    (outcome.state === "done" && outcome.status === "FAILED") ||
    ((outcome.state === "done" || outcome.state === "idle") && outcome.selic?.state === "failed");
}

function describeSelic(report: SelicSyncReport | undefined): string[] {
  if (!report) {
    return [];
  }

  return [report.state === "failed"
    ? `Selic: falha ao buscar a meta no Banco Central: ${report.message}`
    : report.state === "fetched"
      ? `Selic: meta atualizada, referência ${report.observedOn ?? "—"}.`
      : `Selic: conferência diária em dia, referência ${report.observedOn ?? "—"}.`];
}

function describeCdi(report: CdiReport | undefined): string[] {
  if (!report || (report.rates.state === "skipped" && report.valued === 0 && report.failed.length === 0)) {
    return [];
  }

  const rates =
    report.rates.state === "failed"
      ? `CDI: falha ao buscar no Banco Central: ${report.rates.message}`
      : report.rates.state === "fetched"
        ? `CDI: ${report.rates.inserted} taxas novas, conferido até ${report.rates.through ?? "—"}.`
        : report.rates.state === "fresh"
          ? `CDI: taxas em dia, conferido até ${report.rates.through ?? "—"}.`
          : null;

  return [
    ...(rates ? [rates] : []),
    `Rendimento automático: ${report.valued} posições recalculadas.`,
    ...report.failed.map((failure) => `Rendimento automático: posição ${failure.positionId} sem cálculo: ${failure.message}`),
  ];
}
