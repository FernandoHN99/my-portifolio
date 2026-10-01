const SOURCE_LABELS: Record<string, string> = {
  Table_Investimentos_Main: "Posições mensais",
  Table_Investimentos_Porcent: "Classificações",
  Table_Cotacoes: "Cotações",
};

const ISSUE_LABELS: Record<string, string> = {
  INVALID_NUMERIC_VALUE: "Valor numérico inválido",
  AMBIGUOUS_POSITION_IDENTITY: "Identidade ambígua",
  LOOKUP_IGNORES_INSTITUTION: "Vínculo sem instituição",
  MISSING_EXPECTED_COLUMN: "Coluna obrigatória ausente",
  MISSING_SOURCE_TABLE: "Tabela de origem ausente",
  DUPLICATE_SOURCE_POSITION: "Posição duplicada",
};

export function getSourceLabel(source: string) {
  return SOURCE_LABELS[source] ?? source;
}

export function getIssueLabel(code: string) {
  return ISSUE_LABELS[code] ?? code;
}

export function formatImportDate(date: Date | null) {
  if (!date) {
    return "Ainda não concluída";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
