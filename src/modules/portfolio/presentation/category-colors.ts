// Paleta Okabe-Ito, desenhada para ser distinguível com qualquer tipo de
// daltonismo (spec 038), clareada onde o fundo escuro pedia. Cada grupo de
// categorias que aparece junto num gráfico usa cores bem diferentes entre si.
const OKABE_ITO = {
  orange: "#e69f00",
  sky: "#56b4e9",
  green: "#009e73",
  yellow: "#f0e442",
  blue: "#3d8fd6",
  vermillion: "#d55e00",
  purple: "#cc79a7",
  grey: "#bbbbbb",
} as const;

const CATEGORY_COLORS: Record<string, string> = {
  // Classes
  Caixa: OKABE_ITO.sky,
  Cripto: OKABE_ITO.orange,
  "Renda Fixa": OKABE_ITO.green,
  "Renda Variável": OKABE_ITO.yellow,
  Reserva: OKABE_ITO.purple,
  // Moedas
  BRL: OKABE_ITO.green,
  USD: OKABE_ITO.sky,
  BTC: OKABE_ITO.orange,
  Altcoins: OKABE_ITO.purple,
  EUR: OKABE_ITO.yellow,
  // Estratégias
  Core: OKABE_ITO.sky,
  "Core-Satellite": OKABE_ITO.orange,
  Hedge: OKABE_ITO.grey,
  Satellite: OKABE_ITO.yellow,
  // Subclasses da renda variável, que aparecem juntas no gráfico da alocação
  // (spec 078): sem cores repetidas entre elas.
  "Ações EUA": OKABE_ITO.blue,
  "Ações BR": OKABE_ITO.green,
  "Ações - Ex: USA": OKABE_ITO.vermillion,
  "Imobiliário BR": OKABE_ITO.purple,
  Commoditie: OKABE_ITO.yellow,
  // Prazos de resgate, como no gráfico da planilha: curto azul, médio laranja,
  // longo cinza.
  Curto: OKABE_ITO.sky,
  Médio: OKABE_ITO.orange,
  Longo: OKABE_ITO.grey,
  // Tipos de ativo (spec 068)
  "ETF dos EUA": OKABE_ITO.yellow,
  "Ação dos EUA": OKABE_ITO.vermillion,
  "ETF da B3": OKABE_ITO.vermillion,
  "Ação ou FII da B3": OKABE_ITO.purple,
  "Tesouro Direto": OKABE_ITO.green,
  "Renda fixa": OKABE_ITO.blue,
  Previdência: OKABE_ITO.purple,
  "Caixa em reais": OKABE_ITO.sky,
  "Caixa em dólar": OKABE_ITO.grey,
};

const FALLBACK_COLORS = [OKABE_ITO.blue, OKABE_ITO.vermillion, OKABE_ITO.purple, OKABE_ITO.yellow, OKABE_ITO.green];

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
