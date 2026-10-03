const CATEGORY_COLORS: Record<string, string> = {
  Caixa: "#6ea8ff",
  Cripto: "#f2a65a",
  "Renda Fixa": "#9aa4b2",
  "Renda Variável": "#f2d06b",
  Reserva: "#7fd1e8",
  BRL: "#5ce4a4",
  USD: "#6ea8ff",
  BTC: "#f2a65a",
  Altcoins: "#b394ff",
  EUR: "#7fd1e8",
  Core: "#6ea8ff",
  "Core-Satellite": "#f2a65a",
  Hedge: "#9aa4b2",
  Satellite: "#f2d06b",
  // Prazos da renda fixa, nas cores do gráfico da planilha: curto azul, médio laranja, longo cinza.
  Curto: "#6ea8ff",
  Médio: "#f2a65a",
  Longo: "#9aa4b2",
};

const FALLBACK_COLORS = ["#b394ff", "#e2799c", "#5ce4a4", "#f2d06b", "#7fd1e8"];

export const UNCLASSIFIED_COLOR = "#6b7280";

export function categoryColor(label: string) {
  if (CATEGORY_COLORS[label]) {
    return CATEGORY_COLORS[label];
  }

  if (label === "Sem classificação" || label === "Sem estratégia") {
    return UNCLASSIFIED_COLOR;
  }

  let hash = 0;

  for (let index = 0; index < label.length; index += 1) {
    hash = (hash * 31 + label.charCodeAt(index)) % 997;
  }

  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}
