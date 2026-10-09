// Backup de Recebimentos (spec 092): um arquivo próprio, separado do backup da
// carteira e do de Gastos familiares. Restaurar um nunca apaga os outros. O
// arquivo leva só os dados do usuário, sem o usuário, e nunca concessões,
// papéis ou dados de outra área. Formato: docs/backup-format.md.

export const INCOME_BACKUP_FORMAT = "meu-portfolio-recebimentos";
export const INCOME_BACKUP_VERSION = 4;

/**
 * Versões que a restauração aceita. A 1 (spec 092) não tem `incomeHourRecords`
 * (tabela ausente vale como vazia) e as versões 1 e 2 não têm `taxable` nos
 * holerites: a conversão o preenche pelo tipo, como a regra era antes (spec 095).
 * Até a 3 não há horas extras (spec 098): as tabelas de horas extras ficam
 * vazias e as horas declaradas e trabalhadas das linhas do holerite, que nunca
 * foram preenchidas, saem (com valor, o arquivo é recusado).
 */
export const INCOME_BACKUP_ACCEPTED_VERSIONS: readonly number[] = [1, 2, 3, INCOME_BACKUP_VERSION];

/** Tabelas na ordem de gravação: cada uma depois das que ela referencia. */
export const INCOME_BACKUP_TABLES = [
  { key: "incomeMonths", label: "Meses" },
  { key: "incomePayslips", label: "Holerites" },
  { key: "incomeHourRecords", label: "Horas do holerite" },
  { key: "overtimeRules", label: "Regras das horas extras" },
  { key: "overtimeMonths", label: "Meses de horas extras" },
  { key: "overtimeDays", label: "Dias das folhas" },
  { key: "overtimePayments", label: "Pagamentos das horas extras" },
] as const;

export type IncomeBackupTableKey = (typeof INCOME_BACKUP_TABLES)[number]["key"];

export type IncomeBackupRow = Record<string, unknown>;

export type IncomeBackupFile = {
  format: typeof INCOME_BACKUP_FORMAT;
  /** A versão do arquivo; a exportação sempre grava a atual. */
  version: number;
  exportedAt: string;
  tables: Record<IncomeBackupTableKey, IncomeBackupRow[]>;
};

export type IncomeBackupCounts = Record<IncomeBackupTableKey, number>;

export type IncomeBackupPreview = {
  exportedAt: string;
  version: number;
  /** Primeiro e último mês do arquivo, AAAA-MM. */
  firstMonth: string | null;
  lastMonth: string | null;
  file: IncomeBackupCounts;
  current: IncomeBackupCounts;
  warnings?: string[];
};

export type IncomeRestoreResponse =
  | { state: "checked"; preview: IncomeBackupPreview }
  | { state: "restored"; counts: IncomeBackupCounts }
  | { state: "invalid"; message: string };

/** meu-portfolio-recebimentos-AAAA-MM-DD-HHMM.json, em UTC. */
export function incomeBackupFileName(date: Date) {
  const stamp = date.toISOString().slice(0, 16).replace("T", "-").replace(":", "");
  return `${INCOME_BACKUP_FORMAT}-${stamp}.json`;
}
