// Backup de Gastos familiares (spec 084): um arquivo próprio, separado do
// backup da carteira. Assim restaurar a carteira (que substitui as tabelas de
// Investimentos) nunca apaga os gastos, e restaurar os gastos nunca toca na
// carteira. O arquivo leva só os dados do usuário, sem o usuário, e nunca
// concessões, papéis ou dados de outra área. Formato: docs/backup-format.md.

export const FAMILY_BACKUP_FORMAT = "meu-portfolio-gastos-familiares";
export const FAMILY_BACKUP_VERSION = 1;

/** Tabelas na ordem de gravação: cada uma depois das que ela referencia. */
export const FAMILY_BACKUP_TABLES = [
  { key: "familyContacts", label: "Pessoas" },
  { key: "familySeries", label: "Séries" },
  { key: "familyEntries", label: "Lançamentos" },
] as const;

export type FamilyBackupTableKey = (typeof FAMILY_BACKUP_TABLES)[number]["key"];

export type FamilyBackupRow = Record<string, unknown>;

export type FamilyBackupFile = {
  format: typeof FAMILY_BACKUP_FORMAT;
  version: typeof FAMILY_BACKUP_VERSION;
  exportedAt: string;
  tables: Record<FamilyBackupTableKey, FamilyBackupRow[]>;
};

export type FamilyBackupCounts = Record<FamilyBackupTableKey, number>;

export type FamilyBackupPreview = {
  exportedAt: string;
  version: number;
  /** Primeira e última competência dos lançamentos, AAAA-MM. */
  firstCompetence: string | null;
  lastCompetence: string | null;
  /** Saldo pendente do arquivo, em centavos. */
  pendingCents: number;
  file: FamilyBackupCounts;
  current: FamilyBackupCounts;
};

export type FamilyRestoreResponse =
  | { state: "checked"; preview: FamilyBackupPreview }
  | { state: "restored"; counts: FamilyBackupCounts }
  | { state: "invalid"; message: string };

/** meu-portfolio-gastos-familiares-AAAA-MM-DD-HHMM.json, em UTC. */
export function familyBackupFileName(date: Date) {
  const stamp = date.toISOString().slice(0, 16).replace("T", "-").replace(":", "");
  return `${FAMILY_BACKUP_FORMAT}-${stamp}.json`;
}
