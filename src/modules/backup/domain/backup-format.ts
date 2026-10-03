// Formato do arquivo de backup (spec 042): a carteira de um usuário num JSON
// versionado (spec 052). Sem dependências de banco, para servir também à
// interface. Como evoluir o formato: docs/backup-format.md.

export const BACKUP_FORMAT = "meu-portfolio-backup";
/**
 * Versão 4 (specs 051 e 052): os dados de um usuário, sem `userId`, com as
 * cotações digitadas à mão e, das compartilhadas, só as dos símbolos dele; sem
 * as execuções da atualização, que são de todos.
 */
export const BACKUP_VERSION = 4;

/**
 * Tabelas do backup, na ordem em que a restauração as grava: cada uma depois
 * das que ela referencia. A limpeza segue a ordem inversa. `label` aparece no
 * resumo da restauração; as auxiliares ficam fora do resumo. `shared`: as
 * cotações automáticas, de todos os usuários, que a restauração só completa.
 */
export const BACKUP_TABLES = [
  { key: "dataImports", label: null, shared: false },
  { key: "institutions", label: "Instituições", shared: false },
  { key: "accounts", label: null, shared: false },
  { key: "assets", label: "Ativos", shared: false },
  { key: "portfolioMonths", label: "Competências", shared: false },
  { key: "positions", label: "Posições", shared: false },
  { key: "positionAllocations", label: "Rateios", shared: false },
  { key: "targetPlans", label: "Versões das metas", shared: false },
  { key: "allocationTargets", label: null, shared: false },
  { key: "manualQuotes", label: "Cotações digitadas", shared: false },
  { key: "marketQuotes", label: "Cotações mensais", shared: true },
  { key: "dailyQuotes", label: "Cotações diárias", shared: true },
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
  /** Hoje: os dados do usuário e, das cotações compartilhadas, as dos símbolos dele. */
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
