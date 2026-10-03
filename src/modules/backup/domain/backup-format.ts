// Formato do arquivo de backup (spec 042): todos os dados do aplicativo num
// JSON versionado, que a restauração grava de volta com os mesmos
// identificadores. Sem dependências de banco, para servir também à interface.
// Como evoluir o formato: docs/backup-format.md.

export const BACKUP_FORMAT = "meu-portfolio-backup";
/** Versão 3 (spec 049): sem as tabelas da atualização mensal manual nem o status IMPORTED. */
export const BACKUP_VERSION = 3;

/**
 * Tabelas do backup, na ordem em que a restauração as grava: cada uma depois
 * das que ela referencia. A limpeza segue a ordem inversa. `label` aparece no
 * resumo da restauração; as auxiliares ficam fora do resumo.
 */
export const BACKUP_TABLES = [
  { key: "dataImports", label: null },
  { key: "institutions", label: "Instituições" },
  { key: "accounts", label: null },
  { key: "assets", label: "Ativos" },
  { key: "portfolioMonths", label: "Competências" },
  { key: "positions", label: "Posições" },
  { key: "positionAllocations", label: "Rateios" },
  { key: "marketQuotes", label: "Cotações mensais" },
  { key: "targetPlans", label: "Versões das metas" },
  { key: "allocationTargets", label: null },
  { key: "quoteRefreshRuns", label: "Execuções de cotação" },
  { key: "quoteRefreshResults", label: null },
  { key: "dailyQuotes", label: "Cotações diárias" },
] as const;

export type BackupTableKey = (typeof BACKUP_TABLES)[number]["key"];

export type BackupRow = Record<string, unknown>;

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  tables: Record<BackupTableKey, BackupRow[]>;
};

export type BackupCounts = Record<BackupTableKey, number>;

export type BackupPreview = {
  exportedAt: string;
  /** Versão do arquivo; as anteriores são convertidas na leitura. */
  version: number;
  /** Primeira e última competência do arquivo, AAAA-MM. */
  firstMonth: string | null;
  lastMonth: string | null;
  file: BackupCounts;
  current: BackupCounts;
};

export type BackupRestoreResponse =
  | { state: "checked"; preview: BackupPreview }
  | { state: "restored"; counts: BackupCounts }
  | { state: "invalid"; message: string };

/** Nome do arquivo baixado: meu-portfolio-backup-AAAA-MM-DD-HHMM.json, em UTC. */
export function backupFileName(date: Date) {
  const stamp = date.toISOString().slice(0, 16).replace("T", "-").replace(":", "");
  return `${BACKUP_FORMAT}-${stamp}.json`;
}
