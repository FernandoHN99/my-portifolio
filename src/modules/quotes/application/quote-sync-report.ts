import type { QuoteSyncOutcome } from "@/modules/quotes/application/sync-quotes";

// Linhas de registro de uma execução do job de cotações (spec 053), iguais no
// terminal, na função do Neon e no GitHub Actions, para os logs de cada lugar
// contarem a mesma coisa.
export function describeQuoteSync(outcome: QuoteSyncOutcome): string[] {
  switch (outcome.state) {
    case "idle":
      return ["Cotações em dia: nenhum símbolo devido."];
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
      ];
  }
}

/** Execução que deve aparecer como falha para quem agendou (código de saída 1). */
export function isQuoteSyncFailure(outcome: QuoteSyncOutcome) {
  return outcome.state === "unavailable" || (outcome.state === "done" && outcome.status === "FAILED");
}
