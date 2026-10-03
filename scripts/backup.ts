import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getPrismaClient } from "../src/lib/prisma";
import { exportBackup, previewBackup, restoreBackup } from "../src/modules/backup/application/backup";
import { BACKUP_TABLES, backupFileName } from "../src/modules/backup/domain/backup-format";

// Backup pelo terminal, com as mesmas funções da tela de Configuração (spec 042).
//
//   pnpm backup:export [arquivo]            grava em backups/ quando sem arquivo
//   pnpm backup:restore <arquivo>           confere e mostra o resumo
//   pnpm backup:restore <arquivo> --apply   substitui todos os dados
//
// Com DATABASE_URL de um schema de teste (pnpm db:test-schema), age só nele.

async function main() {
  const [command, file] = process.argv.slice(2).filter((argument) => argument !== "--apply");
  const apply = process.argv.includes("--apply");

  if (command === "export") {
    const backup = await exportBackup();
    if (!backup) {
      throw new Error("DATABASE_URL não está configurada.");
    }
    const target = file ?? path.join("backups", backupFileName(new Date(backup.exportedAt)));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(backup));
    console.info(
      `Backup gravado em ${target}: ${BACKUP_TABLES.map(({ key }) => `${key} ${backup.tables[key].length}`).join(", ")}.`,
    );
  } else if (command === "restore" && file) {
    const input = JSON.parse(await readFile(file, "utf8")) as unknown;
    const preview = await previewBackup(input);
    if (!preview) {
      throw new Error("DATABASE_URL não está configurada.");
    }
    console.info(`Backup de ${preview.exportedAt}, competências de ${preview.firstMonth} a ${preview.lastMonth}.`);
    for (const { key } of BACKUP_TABLES) {
      console.info(`  ${key}: ${preview.current[key]} hoje → ${preview.file[key]} no backup`);
    }
    if (!apply) {
      console.info("Simulação: nada foi gravado. Rode com --apply para restaurar.");
    } else {
      await restoreBackup(input);
      console.info("Restaurado.");
    }
  } else {
    console.error("Uso: backup:export [arquivo] | backup:restore <arquivo> [--apply]");
    process.exitCode = 1;
  }

  await getPrismaClient()?.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
