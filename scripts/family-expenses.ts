import "dotenv/config";

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getPrismaClient } from "../src/lib/prisma";
import { runAsUser } from "../src/lib/user-db";
import {
  exportFamilyBackup,
  parseFamilyBackup,
  previewFamilyBackup,
  restoreFamilyBackup,
} from "../src/modules/family-expenses/application/family-backup";
import { formatCompetence } from "../src/modules/family-expenses/domain/competence";
import {
  FAMILY_BACKUP_FORMAT,
  FAMILY_BACKUP_TABLES,
  FAMILY_BACKUP_VERSION,
  familyBackupFileName,
  type FamilyBackupFile,
} from "../src/modules/family-expenses/domain/family-backup-format";
import { normalizeText } from "../src/modules/family-expenses/domain/ledger";
import { centsToDecimal, formatCents } from "../src/modules/family-expenses/domain/money";
import {
  convertSourceRows,
  identicalRows,
  parseSourceSheet,
  type ConvertedRow,
  type NegativeValueDecision,
} from "../src/modules/family-expenses/domain/source-sheet";

// Gastos familiares pelo terminal (spec 084):
//
//   pnpm family:convert <arquivo.txt> [--saida <pasta>]
//       converte a aba colada em texto num backup da área e grava o relatório
//       de conferência ao lado; não toca no banco
//   pnpm family:backup export --user <e-mail> [arquivo]
//   pnpm family:backup restore --user <e-mail> <arquivo> [--apply]
//       confere e resume; com --apply, substitui só os gastos do usuário
//
// O usuário precisa da concessão da área (pnpm access). Com DATABASE_URL de um
// schema de teste (pnpm db:test-schema), age só nele.

/**
 * Decisões do usuário de 2026-10-07 para os dois valores negativos do arquivo
 * de dados corretos: trocar o tipo e usar o valor positivo, mantendo o saldo.
 * Cada uma vale só para a linha com exatamente estes campos.
 */
const NEGATIVE_VALUE_DECISIONS: NegativeValueDecision[] = [
  { line: 168, competence: "2024-07", description: "Gasolina", person: "Marcela", sourceType: "DEVE", valueCents: -1528 },
  { line: 296, competence: "2025-04", description: "Gasolina Corolla", person: "Sandra", sourceType: "DEVO", valueCents: -3150 },
];

/** UUID estável a partir do conteúdo do arquivo: repetir a conversão dá os mesmos ids. */
function stableId(seed: string) {
  const hex = createHash("sha256").update(seed).digest("hex");
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function signed(row: Pick<ConvertedRow, "direction" | "amountCents">) {
  return row.direction === "RECEIVABLE" ? row.amountCents : -row.amountCents;
}

function sumBy<T>(items: readonly T[], key: (item: T) => string, value: (item: T) => number) {
  const totals = new Map<string, number>();
  for (const item of items) totals.set(key(item), (totals.get(key(item)) ?? 0) + value(item));
  return totals;
}

async function convert(input: string, outputDir: string | undefined) {
  const bytes = await readFile(input);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const parsed = parseSourceSheet(bytes.toString("utf8"));
  const { converted, issues: conversionIssues } = convertSourceRows(parsed.rows, NEGATIVE_VALUE_DECISIONS);
  const issues = [...parsed.issues, ...conversionIssues].sort((left, right) => left.line - right.line);
  const receivedOn = /(\d{4}-\d{2}-\d{2})/.exec(path.basename(input))?.[1] ?? new Date().toISOString().slice(0, 10);
  const base = Date.parse(`${receivedOn}T12:00:00.000Z`);
  const at = (offset: number) => new Date(base + offset).toISOString();

  const people = [...new Map(converted.map((row) => [normalizeText(row.person), row])).values()];
  const contactIds = new Map(people.map((row) => [normalizeText(row.person), stableId(`${hash}:contato:${normalizeText(row.person)}`)]));

  const backup: FamilyBackupFile = {
    format: FAMILY_BACKUP_FORMAT,
    version: FAMILY_BACKUP_VERSION,
    exportedAt: at(0),
    tables: {
      familyContacts: people.map((row) => ({
        id: contactIds.get(normalizeText(row.person)),
        name: row.person,
        normalizedName: normalizeText(row.person),
        createdAt: at(row.line),
      })),
      familySeries: [],
      familyEntries: converted.map((row) => ({
        id: stableId(`${hash}:linha:${row.line}`),
        contactId: contactIds.get(normalizeText(row.person)),
        competence: `${row.competence}-01T00:00:00.000Z`,
        description: row.description,
        direction: row.direction,
        amount: centsToDecimal(row.amountCents),
        status: row.status,
        seriesId: null,
        installment: null,
        createdAt: at(row.line),
        updatedAt: at(row.line),
      })),
    },
  };

  // O arquivo passa pela mesma conferência da restauração antes de ser gravado.
  parseFamilyBackup(backup);

  const dir = outputDir ?? path.dirname(input);
  const stem = path.basename(input).replace(/\.[^.]+$/, "");
  const target = path.join(dir, `${stem}.backup.json`);
  const report = path.join(dir, `${stem}.relatorio.md`);
  await mkdir(dir, { recursive: true });

  const competences = [...new Set(converted.map((row) => row.competence))].sort();
  const pending = converted.filter((row) => row.status === "PENDING");
  const settled = converted.filter((row) => row.status === "SETTLED");
  const byPerson = (rows: ConvertedRow[]) => sumBy(rows, (row) => row.person, signed);
  const pendingByPerson = byPerson(pending);
  const settledByPerson = byPerson(settled);
  const totalByPerson = byPerson(converted);
  const pendingByMonth = sumBy(pending, (row) => row.competence, signed);
  const totalByMonth = sumBy(converted, (row) => row.competence, signed);
  const countByMonth = sumBy(converted, (row) => row.competence, () => 1);
  const money = (cents: number) => formatCents(cents, { signed: true });
  const lastTwo = competences.slice(-2);

  const lines = [
    `# Conversão de Gastos familiares`,
    ``,
    `Gerado pelo \`pnpm family:convert\` (spec 084). Nenhum dado foi gravado no banco.`,
    ``,
    `- Fonte: \`${path.basename(input)}\` (sha256 \`${hash}\`), preservada sem alteração.`,
    `- Backup: \`${path.basename(target)}\` (${FAMILY_BACKUP_FORMAT}, versão ${FAMILY_BACKUP_VERSION}).`,
    `- Linhas de dados: ${parsed.rows.length + parsed.issues.length}; convertidas: ${converted.length}; com problema: ${issues.length}.`,
    `- Pessoas: ${people.length} (${people.map((row) => row.person).join(", ")}).`,
    `- Competências: ${competences.length}, de ${formatCompetence(competences[0])} a ${formatCompetence(competences.at(-1)!)}.`,
    `- DEVE na fonte: ${parsed.rows.filter((row) => row.sourceType === "DEVE").length}; DEVO: ${parsed.rows.filter((row) => row.sourceType === "DEVO").length}.`,
    `- OK (acertado): ${settled.length}; NOK (pendente): ${pending.length}.`,
    ``,
    `## Problemas que pedem decisão`,
    ``,
    ...(issues.length ? issues.map((issue) => `- Linha ${issue.line}: ${issue.message}`) : ["Nenhum."]),
    ``,
    `## Decisões aplicadas`,
    ``,
    ...(converted.some((row) => row.decision)
      ? converted
          .filter((row) => row.decision)
          .map(
            (row) =>
              `- Linha ${row.line}: ${formatCompetence(row.competence)} · ${row.description} · ${row.person} · ${row.sourceType} ${formatCents(row.valueCents)} → ${row.direction === "RECEIVABLE" ? "DEVE" : "DEVO"} ${formatCents(row.amountCents)}; saldo mantido em ${money(row.balanceCents)} (decisão do usuário em 2026-10-07).`,
          )
      : ["Nenhuma."]),
    ``,
    `## Linhas iguais preservadas`,
    ``,
    ...(identicalRows(parsed.rows).length
      ? identicalRows(parsed.rows).map((group) => `- Linhas ${group.join(" e ")}: mantidas como lançamentos distintos.`)
      : ["Nenhuma."]),
    ``,
    `## Saldo por pessoa`,
    ``,
    `| Pessoa | Pendente | Acertado | Total |`,
    `| --- | ---: | ---: | ---: |`,
    ...[...totalByPerson.keys()].map(
      (person) =>
        `| ${person} | ${money(pendingByPerson.get(person) ?? 0)} | ${money(settledByPerson.get(person) ?? 0)} | ${money(totalByPerson.get(person) ?? 0)} |`,
    ),
    `| **Total** | ${money(sumAll(pendingByPerson))} | ${money(sumAll(settledByPerson))} | ${money(sumAll(totalByPerson))} |`,
    ``,
    ...lastTwo.flatMap((competence) => {
      const rows = pending.filter((row) => row.competence === competence);
      const totals = byPerson(rows);
      return [
        `## Pendente em ${formatCompetence(competence)}`,
        ``,
        ...[...totals.entries()].map(([person, cents]) => `- ${person}: ${money(cents)}`),
        `- **Total: ${money(sumAll(totals))}**`,
        ``,
      ];
    }),
    `## Por competência`,
    ``,
    `| Competência | Lançamentos | Pendente | Total |`,
    `| --- | ---: | ---: | ---: |`,
    ...competences.map(
      (competence) =>
        `| ${formatCompetence(competence)} | ${countByMonth.get(competence)} | ${money(pendingByMonth.get(competence) ?? 0)} | ${money(totalByMonth.get(competence) ?? 0)} |`,
    ),
    ``,
  ];

  await writeFile(target, JSON.stringify(backup));
  await writeFile(report, lines.join("\n"));
  console.info(`Backup: ${target}`);
  console.info(`Relatório: ${report}`);
  console.info(`${converted.length} lançamentos de ${people.length} pessoas; ${issues.length} problemas.`);

  if (issues.length > 0) {
    console.error("Há linhas que pedem decisão: o backup não as inclui. Veja o relatório.");
    process.exitCode = 1;
  }
}

function sumAll(totals: Map<string, number>) {
  return [...totals.values()].reduce((sum, value) => sum + value, 0);
}

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
      const backup = await exportFamilyBackup();
      const target = file ?? path.join("backups", "gastos-familia", familyBackupFileName(new Date(backup.exportedAt)));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, JSON.stringify(backup));
      console.info(
        `Backup gravado em ${target}: ${FAMILY_BACKUP_TABLES.map(({ key }) => `${key} ${backup.tables[key].length}`).join(", ")}.`,
      );
    } else if (command === "restore" && file) {
      const input = JSON.parse(await readFile(file, "utf8")) as unknown;
      const preview = await previewFamilyBackup(input);
      console.info(
        `Backup de ${preview.exportedAt}, competências de ${preview.firstCompetence} a ${preview.lastCompetence}, pendente ${formatCents(preview.pendingCents, { signed: true })}.`,
      );
      for (const { key } of FAMILY_BACKUP_TABLES) {
        console.info(`  ${key}: ${preview.current[key]} hoje → ${preview.file[key]} no backup`);
      }
      if (!apply) {
        console.info("Simulação: nada foi gravado. Rode com --apply para substituir os gastos deste usuário.");
      } else {
        const counts = await restoreFamilyBackup(input);
        console.info(`Restaurado: ${FAMILY_BACKUP_TABLES.map(({ key }) => `${key} ${counts[key]}`).join(", ")}.`);
      }
    } else {
      console.error("Uso: family:backup export --user <e-mail> [arquivo] | family:backup restore --user <e-mail> <arquivo> [--apply]");
      process.exitCode = 1;
    }
  });
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (command === "convert" && args[0]) {
    const outputIndex = args.indexOf("--saida");
    await convert(args[0], outputIndex >= 0 ? args[outputIndex + 1] : undefined);
  } else if (command === "backup") {
    await backupCommand(args);
  } else {
    console.error("Uso: family:convert <arquivo.txt> [--saida <pasta>] | family:backup <export|restore> --user <e-mail> …");
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => getPrismaClient()?.$disconnect());
