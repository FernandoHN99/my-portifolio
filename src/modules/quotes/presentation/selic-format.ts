import type { SelicMonthView } from "@/modules/quotes/application/selic-reference";

const percentFormat = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Meta Selic como "13,75% a.a."; um traço sem taxa conhecida. */
export function formatSelic(rate: SelicMonthView | null) {
  return rate ? `${percentFormat.format(rate.percentAnnual)}% a.a.` : "—";
}

/** Origem da taxa, para o texto de apoio: meta do Copom, dia e fonte. */
export function describeSelic(rate: SelicMonthView | null) {
  if (!rate) {
    return "Meta Selic do Copom · aguardando o job";
  }

  const day = rate.asOf.split("-").reverse().join("/");
  return `Meta Selic do Copom em ${day} · Banco Central${rate.stale ? " · última disponível" : ""}`;
}
