import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getPrismaClient } from "../src/lib/prisma";
import { runAsUser } from "../src/lib/user-db";
import { exportBackup, previewBackup, restoreBackup } from "../src/modules/backup/application/backup";
import { BACKUP_TABLES, backupFileName } from "../src/modules/backup/domain/backup-format";

// Backup pelo terminal, com as mesmas funções da tela de Configuração (spec 042),
// sempre com os dados de um usuário (spec 050):
//
//   pnpm backup:export --user <e-mail> [arquivo]            grava em backups/ quando sem arquivo
//   pnpm backup:restore --user <e-mail> <arquivo>           confere e mostra o resumo
//   pnpm backup:restore --user <e-mail> <arquivo> --apply   substitui os dados do usuário
//
// Com DATABASE_URL de um schema de teste (pnpm db:test-schema), age só nele.

function readArguments() {
  const args = process.argv.slice(2);
  const userIndex = args.indexOf("--user");
  const email = userIndex >= 0 ? args[userIndex + 1] : undefined;
  const rest = args.filter((argument, index) => argument !== "--apply" && index !== userIndex && index !== userIndex + 1);
  return { command: rest[0], file: rest[1], email, apply: args.includes("--apply") };
}

async function main() {
  const { command, file, email, apply } = readArguments();
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("DATABASE_URL não está configurada.");
  }

  if (!email) {
    throw new Error("Informe o usuário: --user <e-mail> (pnpm auth:user list mostra as contas).");
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } });

  if (!user) {
    throw new Error(`Não existe conta com o e-mail ${email}.`);
  }

  await runAsUser(user.id, () => run(command, file, apply));
}

async function run(command: string | undefined, file: string | undefined, apply: boolean) {

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
    console.error("Uso: backup:export --user <e-mail> [arquivo] | backup:restore --user <e-mail> <arquivo> [--apply]");
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => getPrismaClient()?.$disconnect());
