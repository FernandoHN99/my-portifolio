import type { PrismaClient } from "@/generated/prisma/client";
import { competenceDate, type Competence } from "@/lib/competence";
import { decimalToCents } from "@/lib/money";
import { SCOPED_USER } from "@/lib/user-db";
import { getIncomeContext, getIncomeDb } from "@/modules/income/application/income-db";
import {
  dateOf,
  hoursDecimal,
  readOvertimeRules,
  readWorkMonths,
  recomputeImportedTotals,
  type StoredWorkMonth,
} from "@/modules/income/application/overtime-data";
import { readWorkbookGrids, TimesheetFileError } from "@/modules/income/application/overtime-xlsx";
import type { IsoDate } from "@/modules/income/domain/income";
import { overtimeHours, ruleFor, totalsFromDays, type Hours, type OvertimeTotals } from "@/modules/income/domain/overtime";
import { parseTimesheetGrid, sameTimesheet, type ParsedTimesheet } from "@/modules/income/domain/overtime-sheet";

// Importação das folhas de horas (spec 098): o usuário envia os .xlsx que já
// preenche para a empresa (um por mês, ou o arquivo de controle com várias
// abas) e o app lê os dias, sem redigitar nada. Dois passos, como o backup:
// a prévia confere e mostra o que muda; a gravação substitui só os meses
// escolhidos, mantendo as horas compensadas, a observação e os dias que o
// usuário reclassificou à mão.

export type TimesheetFile = { name: string; data: Uint8Array };

export type ImportMonthState = "new" | "replace" | "same" | "conflict";

export type ImportPreviewMonth = {
  month: Competence;
  startsOn: IsoDate;
  endsOn: IsoDate;
  sourceName: string;
  days: number;
  totals: OvertimeTotals;
  worked: Hours;
  warnings: string[];
  state: ImportMonthState;
  /** Horas extras do mês que já está gravado, para comparar. */
  currentWorked: Hours | null;
  currentSource: "IMPORT" | "MANUAL" | null;
};

export type ImportPreview = {
  months: ImportPreviewMonth[];
  /** Abas sem a folha de horas (como "Resumo"). */
  skipped: string[];
  errors: { sourceName: string; message: string }[];
};

export type OvertimeImportResponse =
  | { state: "checked"; preview: ImportPreview }
  | { state: "imported"; months: Competence[] }
  | { state: "invalid"; message: string };

export const MAX_IMPORT_FILES = 12;

async function parseFiles(files: TimesheetFile[], today: IsoDate) {
  const sheets: ParsedTimesheet[] = [];
  const skipped: string[] = [];
  const errors: ImportPreview["errors"] = [];

  for (const file of files) {
    let grids;

    try {
      grids = await readWorkbookGrids(file.data);
    } catch (error) {
      errors.push({ sourceName: file.name, message: error instanceof TimesheetFileError ? `O arquivo ${error.message}.` : "Não foi possível ler o arquivo." });
      continue;
    }

    for (const grid of grids) {
      const result = parseTimesheetGrid(grid, file.name, today);
      if (result.kind === "month") sheets.push(result.sheet);
      else if (result.kind === "skipped") skipped.push(result.sourceName);
      else errors.push({ sourceName: result.sourceName, message: result.message });
    }
  }

  // A mesma folha em dois arquivos (o mensal e o de controle) conta uma vez;
  // duas folhas diferentes para o mesmo mês ficam em conflito, sem gravar.
  const byMonth = new Map<Competence, { sheet: ParsedTimesheet; conflict: boolean }>();

  for (const sheet of sheets) {
    const seen = byMonth.get(sheet.month);
    if (!seen) byMonth.set(sheet.month, { sheet, conflict: false });
    else if (!sameTimesheet(seen.sheet, sheet)) seen.conflict = true;
  }

  return { byMonth, skipped, errors };
}

/** Igual ao gravado: mesmo período e os mesmos dias com as mesmas horas. */
function sameAsStored(sheet: ParsedTimesheet, stored: StoredWorkMonth) {
  return (
    stored.source === "IMPORT" &&
    stored.startsOn === sheet.startsOn &&
    stored.endsOn === sheet.endsOn &&
    stored.days.length === sheet.days.length &&
    stored.days.every((day, index) => day.date === sheet.days[index].date && day.hours === sheet.days[index].hours)
  );
}

/** A prévia e a gravação mantêm os mesmos tipos que o usuário marcou nos dias. */
function daysWithStoredTypes(sheet: ParsedTimesheet, current: StoredWorkMonth | null | undefined) {
  const manualTypes = new Map((current?.days ?? []).filter((day) => day.manualType).map((day) => [day.date, day.dayType]));

  return sheet.days.map((day) => {
    const manual = manualTypes.get(day.date);
    return { ...day, dayType: manual ?? day.dayType, manualType: manual !== undefined };
  });
}

async function buildPreview(prisma: PrismaClient, files: TimesheetFile[], today: IsoDate) {
  const [{ byMonth, skipped, errors }, rules, stored] = await Promise.all([parseFiles(files, today), readOvertimeRules(prisma), readWorkMonths(prisma)]);
  const storedByMonth = new Map(stored.map((month) => [month.month, month]));
  const months = [...byMonth.values()]
    .sort((a, b) => a.sheet.month.localeCompare(b.sheet.month))
    .map(({ sheet, conflict }): ImportPreviewMonth => {
      const current = storedByMonth.get(sheet.month) ?? null;
      const totals = totalsFromDays(daysWithStoredTypes(sheet, current), ruleFor(sheet.month, rules).dailyHours);

      return {
        month: sheet.month,
        startsOn: sheet.startsOn,
        endsOn: sheet.endsOn,
        sourceName: sheet.sourceName,
        days: sheet.days.length,
        totals,
        worked: overtimeHours(totals),
        warnings: sheet.warnings,
        state: conflict ? "conflict" : !current ? "new" : sameAsStored(sheet, current) ? "same" : "replace",
        currentWorked: current ? overtimeHours(current.totals) : null,
        currentSource: current?.source ?? null,
      };
    });

  return { preview: { months, skipped, errors } satisfies ImportPreview, sheets: byMonth, stored: storedByMonth };
}

/** Lê os arquivos e mostra o que entraria, sem gravar. */
export async function previewOvertimeImport(files: TimesheetFile[], today: IsoDate): Promise<ImportPreview> {
  return (await buildPreview((await getIncomeDb()) as PrismaClient, files, today)).preview;
}

/**
 * Grava os meses escolhidos da prévia (os novos e os que mudaram). Conflitos e
 * meses iguais ao gravado não são tocados. Devolve os meses gravados.
 */
export async function applyOvertimeImport(files: TimesheetFile[], months: Competence[], today: IsoDate): Promise<Competence[]> {
  const { prisma } = await getIncomeContext();
  const { preview, sheets, stored } = await buildPreview(prisma as PrismaClient, files, today);
  const chosen = preview.months.filter((month) => months.includes(month.month) && (month.state === "new" || month.state === "replace"));

  await (prisma as PrismaClient).$transaction(
    async (transaction) => {
      for (const entry of chosen) {
        const sheet = sheets.get(entry.month)!.sheet;
        const current = stored.get(entry.month);
        const data = {
          month: competenceDate(sheet.month),
          startsOn: dateOf(sheet.startsOn),
          endsOn: dateOf(sheet.endsOn),
          source: "IMPORT" as const,
          sourceName: sheet.sourceName.slice(0, 200),
          importWarnings: sheet.warnings,
        };
        let monthId = current?.id;

        if (current) {
          await transaction.overtimeMonth.updateMany({ where: { id: current.id }, data });
          await transaction.overtimeDay.deleteMany({ where: { overtimeMonthId: current.id } });
        } else {
          monthId = (await transaction.overtimeMonth.create({ data: { ...data, userId: SCOPED_USER }, select: { id: true } })).id;
        }

        await transaction.overtimeDay.createMany({
          data: daysWithStoredTypes(sheet, current).map((day) => ({
            userId: SCOPED_USER,
            overtimeMonthId: monthId!,
            date: dateOf(day.date),
            hours: hoursDecimal(day.hours),
            dayType: day.dayType,
            manualType: day.manualType,
            activity: day.activity,
          })),
        });

        await recomputeImportedTotals(transaction, sheet.month);

        // As horas compensadas ficam, mas nunca acima das extras da folha nova.
        if (current && current.compensated > 0) {
          const fresh = await transaction.overtimeMonth.findFirst({
            where: { id: monthId },
            select: { weekdayHours: true, weekdayBeyondHours: true, saturdayHours: true, sundayHours: true, holidayHours: true },
          });
          const worked = fresh ? Object.values(fresh).reduce((sum, value) => sum + decimalToCents(value), 0) : 0;
          if (current.compensated > worked) {
            await transaction.overtimeMonth.updateMany({ where: { id: monthId }, data: { compensatedHours: hoursDecimal(worked) } });
          }
        }
      }
    },
    { maxWait: 10_000, timeout: 60_000 },
  );

  return chosen.map((month) => month.month);
}
