// Backup de Recebimentos (spec 092): um arquivo próprio, separado do backup da
// carteira e do de Gastos familiares. Restaurar um nunca apaga os outros. O
// arquivo leva só os dados do usuário, sem o usuário, e nunca concessões,
// papéis ou dados de outra área. Formato: docs/backup-format.md.

export const INCOME_BACKUP_FORMAT = "meu-portfolio-recebimentos";
export const INCOME_BACKUP_VERSION = 1;

/** Tabelas na ordem de gravação: cada uma depois das que ela referencia. */
export const INCOME_BACKUP_TABLES = [
  { key: "incomeMonths", label: "Meses" },
  { key: "incomePayslips", label: "Holerites" },
] as const;

export type IncomeBackupTableKey = (typeof INCOME_BACKUP_TABLES)[number]["key"];

export type IncomeBackupRow = Record<string, unknown>;

export type IncomeBackupFile = {
  format: typeof INCOME_BACKUP_FORMAT;
  version: typeof INCOME_BACKUP_VERSION;
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
