import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getPrismaClient } from "../src/lib/prisma";
import { runAsUser } from "../src/lib/user-db";
import {
  exportIncomeBackup,
  previewIncomeBackup,
  restoreIncomeBackup,
} from "../src/modules/income/application/income-backup";
import { localToday } from "../src/modules/income/application/get-overtime-view";
import { applyOvertimeImport, previewOvertimeImport } from "../src/modules/income/application/overtime-import";
import { INCOME_BACKUP_TABLES, incomeBackupFileName } from "../src/modules/income/domain/income-backup-format";
import { formatHours } from "../src/modules/income/domain/overtime";

// Recebimentos pelo terminal (spec 092):
//
//   pnpm income:backup export --user <e-mail> [arquivo]
//   pnpm income:backup restore --user <e-mail> <arquivo> [--apply]
//       confere e resume; com --apply, substitui só os recebimentos do usuário
//   pnpm income:overtime import --user <e-mail> <arquivo.xlsx>… [--apply]
//       lê as folhas de horas (spec 098) e mostra a prévia; com --apply, grava
//       os meses novos e os que mudaram, como a importação da página
//
// O usuário precisa da concessão da área (pnpm auth:access). Com DATABASE_URL
// de um schema de teste (pnpm db:test-schema), age só nele.

async function backupCommand(args: string[]) {
  const userIndex = args.indexOf("--user");
  const email = userIndex >= 0 ? args[userIndex + 1] : undefined;
  const rest = args.filter((argument, index) => argument !== "--apply" && index !== userIndex && index !== userIndex + 1);
  const [command, file] = rest;
  const apply = args.includes("--apply");
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

  await runAsUser(user.id, async () => {
    if (command === "export") {
      const backup = await exportIncomeBackup();
      const target = file ?? path.join("backups", "recebimentos", incomeBackupFileName(new Date(backup.exportedAt)));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, JSON.stringify(backup));
      console.info(
        `Backup gravado em ${target}: ${INCOME_BACKUP_TABLES.map(({ key }) => `${key} ${backup.tables[key].length}`).join(", ")}.`,
      );
    } else if (command === "restore" && file) {
      const input = JSON.parse(await readFile(file, "utf8")) as unknown;
      const preview = await previewIncomeBackup(input);
      console.info(`Backup de ${preview.exportedAt}, meses de ${preview.firstMonth} a ${preview.lastMonth}.`);
      for (const warning of preview.warnings ?? []) console.info(warning);
      for (const { key } of INCOME_BACKUP_TABLES) {
        console.info(`  ${key}: ${preview.current[key]} hoje → ${preview.file[key]} no backup`);
      }
      if (!apply) {
        console.info("Simulação: nada foi gravado. Rode com --apply para substituir os recebimentos deste usuário.");
      } else {
        const counts = await restoreIncomeBackup(input);
        console.info(`Restaurado: ${INCOME_BACKUP_TABLES.map(({ key }) => `${key} ${counts[key]}`).join(", ")}.`);
      }
    } else {
      console.error("Uso: income:backup export --user <e-mail> [arquivo] | income:backup restore --user <e-mail> <arquivo> [--apply]");
      process.exitCode = 1;
    }
  });
}

async function userIdFor(args: string[]) {
  const userIndex = args.indexOf("--user");
  const email = userIndex >= 0 ? args[userIndex + 1] : undefined;
  const prisma = getPrismaClient();

  if (!prisma) throw new Error("DATABASE_URL não está configurada.");
  if (!email) throw new Error("Informe o usuário: --user <e-mail> (pnpm auth:user list mostra as contas).");

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } });
  if (!user) throw new Error(`Não existe conta com o e-mail ${email}.`);

  return { id: user.id, rest: args.filter((argument, index) => argument !== "--apply" && index !== userIndex && index !== userIndex + 1) };
}

async function overtimeCommand(args: string[]) {
  const { id, rest } = await userIdFor(args);
  const [command, ...paths] = rest;

  if (command !== "import" || paths.length === 0) {
    console.error("Uso: income:overtime import --user <e-mail> <arquivo.xlsx>… [--apply]");
    process.exitCode = 1;
    return;
  }

  const files = await Promise.all(paths.map(async (file) => ({ name: path.basename(file), data: new Uint8Array(await readFile(file)) })));

  await runAsUser(id, async () => {
    const preview = await previewOvertimeImport(files, localToday());
    for (const month of preview.months) {
      console.info(`${month.month} ${month.startsOn} a ${month.endsOn} ${formatHours(month.worked)} extras · ${month.state} · ${month.sourceName}`);
      for (const warning of month.warnings) console.info(`    aviso: ${warning}`);
    }
    for (const error of preview.errors) console.info(`  erro em ${error.sourceName}: ${error.message}`);
    if (preview.skipped.length > 0) console.info(`  sem folha: ${preview.skipped.join(", ")}`);

    if (!args.includes("--apply")) {
      console.info("Simulação: nada foi gravado. Rode com --apply para gravar os meses novos e os que mudaram.");
      return;
    }

    const saved = await applyOvertimeImport(files, preview.months.map((month) => month.month), localToday());
    console.info(`Gravados: ${saved.join(", ") || "nenhum"}.`);
  });
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (command === "backup") {
    await backupCommand(args);
  } else if (command === "overtime") {
    await overtimeCommand(args);
  } else {
    console.error("Uso: income:backup <export|restore> --user <e-mail> … | income:overtime import --user <e-mail> <arquivos> [--apply]");
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => getPrismaClient()?.$disconnect());
