import type { Competence } from "@/lib/competence";
import type { IsoDate } from "@/modules/income/domain/income";
import { addDays } from "@/modules/portfolio/domain/business-days";
import { defaultDayType, MAX_DAY_HOURS, type DayType, type Hours } from "@/modules/income/domain/overtime";

// Leitura da folha de horas mensal (spec 098), a "Monthly Status Report" que o
// usuário preenche e envia à empresa: cabeçalho com Date, Week Day, Worked,
// Activities e pares Project/Hours; um dia por linha até "Total". Sem
// dependência de biblioteca: recebe a grade de células já lida do .xlsx.
//
// As folhas reais têm erros que a leitura corrige e avisa, sem inventar dado:
// anos digitados errado (2025, 2027, 2030 no lugar de 2026, porque a data foi
// arrastada no Excel), corrigidos pelo dia da semana escrito ao lado; e dia da
// semana divergente da data, em que vale a data.

/** Célula lida do arquivo. `formula` sem `result` é fórmula sem valor salvo. */
export type SheetCell = string | number | boolean | Date | null | { formula: string; result?: unknown } | { error: string };

export type SheetGrid = { name: string; rows: SheetCell[][] };

export type TimesheetDay = { date: IsoDate; hours: Hours; dayType: DayType; activity: string | null };

export type ParsedTimesheet = {
  sourceName: string;
  month: Competence;
  startsOn: IsoDate;
  endsOn: IsoDate;
  days: TimesheetDay[];
  warnings: string[];
};

export type TimesheetResult =
  | { kind: "month"; sheet: ParsedTimesheet }
  | { kind: "skipped"; sourceName: string }
  | { kind: "error"; sourceName: string; message: string };

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  dom: 0,
  sunday: 0,
  sun: 0,
  segunda: 1,
  seg: 1,
  monday: 1,
  mon: 1,
  terca: 2,
  ter: 2,
  tuesday: 2,
  tue: 2,
  quarta: 3,
  qua: 3,
  wednesday: 3,
  wed: 3,
  quinta: 4,
  qui: 4,
  thursday: 4,
  thu: 4,
  sexta: 5,
  sex: 5,
  friday: 5,
  fri: 5,
  sabado: 6,
  sab: 6,
  saturday: 6,
  sat: 6,
};

const WEEKDAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MONTH_PREFIXES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "segunda-feira", "Seg", "Monday" → 1. */
export function parseWeekday(text: string): number | null {
  const key = normalize(text).replace(/-feira$/, "").replace(/\.$/, "");
  return key in WEEKDAYS ? WEEKDAYS[key] : null;
}

/** O valor que a célula mostra: o resultado da fórmula, o texto rico já virou texto. */
function valueOf(cell: SheetCell | undefined): { value: string | number | boolean | Date | null; missingResult: boolean } {
  if (cell === undefined || cell === null) return { value: null, missingResult: false };
  if (cell instanceof Date || typeof cell !== "object") return { value: cell, missingResult: false };
  if ("error" in cell) return { value: null, missingResult: false };

  const result = cell.result;
  if (result === undefined || result === null) return { value: null, missingResult: true };
  if (result instanceof Date || typeof result === "number" || typeof result === "string" || typeof result === "boolean") {
    return { value: result, missingResult: false };
  }

  return { value: null, missingResult: false };
}

const textOf = (cell: SheetCell | undefined) => {
  const { value } = valueOf(cell);
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
};

/** Data da célula como [ano, mês, dia]; aceita data, número de série do Excel e "dd/mm/aaaa". */
function dateParts(cell: SheetCell | undefined): [number, number, number] | null {
  const { value } = valueOf(cell);

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()];
  }

  if (typeof value === "number" && value > 20_000 && value < 80_000) {
    const date = new Date(Math.round((value - 25_569) * 86_400_000));
    return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
  }

  if (typeof value === "string") {
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
    if (match) return [Number(match[3]), Number(match[2]), Number(match[1])];
  }

  return null;
}

/** Horas da célula em centésimos: número, "8,5" ou "8:30"; vazio é zero. */
function hoursOf(cell: SheetCell | undefined): Hours | "missing" | "invalid" {
  const { value, missingResult } = valueOf(cell);

  if (missingResult) return "missing";
  if (value === null || value === "" || value === "-") return 0;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : "invalid";
  if (value instanceof Date) return value.getUTCHours() * 100 + Math.round((value.getUTCMinutes() * 100) / 60);

  if (typeof value === "string") {
    const text = value.trim();
    const clock = /^(\d{1,2}):([0-5]\d)$/.exec(text);
    if (clock) return Number(clock[1]) * 100 + Math.round((Number(clock[2]) * 100) / 60);
    if (/^\d{1,2}([.,]\d{1,2})?$/.test(text)) return Math.round(Number(text.replace(",", ".")) * 100);
  }

  return "invalid";
}

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const isValidDate = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const weekdayOf = (date: IsoDate) => new Date(`${date}T00:00:00.000Z`).getUTCDay();
const br = (date: IsoDate) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

type RawDay = { parts: [number, number, number]; weekday: number | null; hours: Hours; activity: string | null; row: number };

/**
 * Datas com o ano reconstruído: a primeira linha recebe o ano candidato e as
 * seguintes o acompanham, virando o ano quando o mês volta (dezembro → janeiro).
 * Ganha o ano em que mais linhas batem com o dia da semana escrito.
 */
function rebuildDates(days: RawDay[], today: IsoDate) {
  const rawYears = days.map((day) => day.parts[0]);
  const thisYear = Number(today.slice(0, 4));
  const candidates = new Set<number>();

  for (const year of [...rawYears, thisYear]) {
    for (const offset of [-2, -1, 0, 1]) candidates.add(year + offset);
  }

  const build = (startYear: number) => {
    let year = startYear;
    return days.map((day, index) => {
      if (index > 0 && day.parts[1] < days[index - 1].parts[1]) year += 1;
      return isValidDate(year, day.parts[1], day.parts[2]) ? iso(year, day.parts[1], day.parts[2]) : null;
    });
  };

  let best: { dates: (IsoDate | null)[]; score: number; year: number } | null = null;

  for (const year of [...candidates].sort()) {
    const dates = build(year);
    if (dates.some((date) => date === null)) continue;
    const score = days.filter((day, index) => day.weekday !== null && day.weekday === weekdayOf(dates[index]!)).length;
    // Empate (o calendário se repete a cada poucos anos): fica o ano escrito na
    // primeira linha e, se ele não é um dos empatados, o mais próximo de hoje.
    const written = days[0].parts[0];
    const better =
      !best ||
      score > best.score ||
      (score === best.score && best.year !== written && (year === written || Math.abs(year - thisYear) < Math.abs(best.year - thisYear)));
    if (better) best = { dates, score, year };
  }

  return best?.dates.map((date) => date!) ?? null;
}

/** Mês citado no nome da aba ou do arquivo ("03-Marco", "Setemro"), só para conferir. */
function monthHint(text: string): number | null {
  const tokens = normalize(text).split(/[^a-z]+/).filter((token) => token.length >= 3);
  const found = tokens.map((token) => MONTH_PREFIXES.indexOf(token.slice(0, 3))).filter((index) => index >= 0);
  return found.length === 1 ? found[0] + 1 : null;
}

/**
 * Lê uma aba. Aba sem o cabeçalho da folha (como "Resumo") é ignorada; aba com
 * a folha mas com dado que não dá para confiar (hora calculada sem valor salvo,
 * dia repetido) volta como erro, sem meio-termo.
 */
export function parseTimesheetGrid(grid: SheetGrid, fileName: string, today: IsoDate): TimesheetResult {
  const sourceName = grid.name && !fileName.includes(grid.name) ? `${fileName} › ${grid.name}` : fileName;
  const headerIndex = grid.rows.slice(0, 40).findIndex((row) => {
    const texts = row.map((cell) => normalize(textOf(cell)));
    return texts.some((text) => text === "date" || text === "data") && texts.some((text) => text === "hours" || text === "horas");
  });

  if (headerIndex < 0) {
    return { kind: "skipped", sourceName };
  }

  const header = grid.rows[headerIndex].map((cell) => normalize(textOf(cell)));
  const dateColumn = header.findIndex((text) => text === "date" || text === "data");
  const weekdayColumn = header.findIndex((text) => ["week day", "weekday", "dia da semana", "dia"].includes(text));
  const activityColumn = header.findIndex((text) => ["activities", "activity", "atividades", "atividade"].includes(text));
  const hourColumns = header.flatMap((text, index) => (["hours", "horas", "hrs"].includes(text) ? [index] : []));
  const raw: RawDay[] = [];

  for (let index = headerIndex + 1; index < grid.rows.length; index += 1) {
    const row = grid.rows[index];
    const first = normalize(row.map((cell) => textOf(cell)).find((text) => text !== "") ?? "");

    if (first.startsWith("total")) break;

    const parts = dateParts(row[dateColumn]);
    if (!parts) continue;

    let hours = 0;
    for (const column of hourColumns) {
      const value = hoursOf(row[column]);
      if (value === "missing") {
        return {
          kind: "error",
          sourceName,
          message: `A linha ${index + 1} tem horas calculadas por fórmula sem o valor salvo. Abra o arquivo no Excel, salve e envie de novo.`,
        };
      }
      if (value === "invalid") {
        return { kind: "error", sourceName, message: `A linha ${index + 1} tem um valor de horas que não é número.` };
      }
      hours += value;
    }

    const activity = activityColumn >= 0 ? textOf(row[activityColumn]) : "";
    raw.push({
      parts,
      weekday: weekdayColumn >= 0 ? parseWeekday(textOf(row[weekdayColumn])) : null,
      hours,
      activity: activity === "" || activity === "-" ? null : activity.slice(0, 300),
      row: index + 1,
    });
  }

  if (raw.length === 0) {
    return { kind: "error", sourceName, message: "A folha não tem dias com data." };
  }

  if (raw.length > 45) {
    return { kind: "error", sourceName, message: `A folha tem ${raw.length} dias; o período vai até 45.` };
  }

  const dates = rebuildDates(raw, today);

  if (!dates) {
    return { kind: "error", sourceName, message: "As datas da folha não formam um período válido." };
  }

  const warnings: string[] = [];
  const fixedYears = raw.filter((day, index) => day.parts[0] !== Number(dates[index].slice(0, 4)));

  if (fixedYears.length > 0) {
    const sample = fixedYears[0];
    const index = raw.indexOf(sample);
    warnings.push(
      `${fixedYears.length} ${fixedYears.length === 1 ? "data estava" : "datas estavam"} com o ano errado e ${fixedYears.length === 1 ? "foi corrigida" : "foram corrigidas"} pelo dia da semana (ex.: ${br(iso(...sample.parts))} → ${br(dates[index])}).`,
    );
  }

  const seen = new Set<IsoDate>();
  for (const [index, date] of dates.entries()) {
    if (seen.has(date)) {
      return { kind: "error", sourceName, message: `O dia ${br(date)} aparece duas vezes (linha ${raw[index].row}).` };
    }
    seen.add(date);

    if (index > 0 && date !== addDays(dates[index - 1], 1)) {
      warnings.push(`A sequência pula de ${br(dates[index - 1])} para ${br(date)}.`);
    }

    const written = raw[index].weekday;
    if (written !== null && written !== weekdayOf(date)) {
      warnings.push(`${br(date)} está marcado como ${WEEKDAY_NAMES[written]}, mas é ${WEEKDAY_NAMES[weekdayOf(date)]}; vale a data.`);
    }
  }

  for (const [index, day] of raw.entries()) {
    if (day.hours > MAX_DAY_HOURS) {
      return { kind: "error", sourceName, message: `${br(dates[index])} tem mais de 24 horas.` };
    }
  }

  const endsOn = dates.at(-1)!;
  const month = endsOn.slice(0, 7);
  const hint = monthHint(grid.name) ?? monthHint(fileName);

  if (hint !== null && hint !== Number(month.slice(5, 7))) {
    warnings.push(`O nome indica ${MONTH_PREFIXES[hint - 1]}, mas o período termina em ${br(endsOn)}; vale o período.`);
  }

  return {
    kind: "month",
    sheet: {
      sourceName,
      month,
      startsOn: dates[0],
      endsOn,
      days: raw.map((day, index) => ({
        date: dates[index],
        hours: day.hours,
        dayType: defaultDayType(dates[index]),
        activity: day.activity,
      })),
      warnings,
    },
  };
}

/** Duas folhas do mesmo mês com os mesmos dias e horas são a mesma folha. */
export function sameTimesheet(a: ParsedTimesheet, b: ParsedTimesheet) {
  return (
    a.month === b.month &&
    a.days.length === b.days.length &&
    a.days.every((day, index) => day.date === b.days[index].date && day.hours === b.days[index].hours)
  );
}
