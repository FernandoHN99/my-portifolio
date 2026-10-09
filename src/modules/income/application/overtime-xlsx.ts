import { Readable } from "node:stream";

import ExcelJS from "exceljs";

import type { SheetCell, SheetGrid } from "@/modules/income/domain/overtime-sheet";

// Leitura do .xlsx da folha de horas (spec 098), só no servidor: transforma
// cada aba numa grade de células simples para o leitor do domínio. Lê no máximo
// 20 abas, 200 linhas e 30 colunas por aba, o bastante para a folha mensal.

const MAX_SHEETS = 20;
const MAX_ROWS = 200;
const MAX_COLUMNS = 30;

export class TimesheetFileError extends Error {}

function cellOf(value: ExcelJS.CellValue): SheetCell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;

  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("error" in value) return { error: String(value.error) };
    if ("formula" in value || "sharedFormula" in value) {
      const formula = "formula" in value ? value.formula : value.sharedFormula;
      const result = (value as { result?: unknown }).result;
      return { formula: String(formula ?? ""), result: result instanceof Date || typeof result !== "object" ? result : undefined };
    }
    if ("text" in value) return String(value.text);
  }

  return null;
}

function gridOf(rows: ExcelJS.CellValue[][]): SheetCell[][] {
  return rows.map((row) => row.slice(0, MAX_COLUMNS).map(cellOf));
}

/**
 * Leitor em fluxo: ignora desenhos e imagens, que quebram o leitor comum na
 * folha de setembro (salva por outro programa, com o logotipo).
 */
async function readStreaming(data: Uint8Array): Promise<SheetGrid[]> {
  const read: { id: string; fallback: string; rows: ExcelJS.CellValue[][] }[] = [];
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(Buffer.from(data)), {
    worksheets: "emit",
    sharedStrings: "cache",
    styles: "cache",
    hyperlinks: "ignore",
    entries: "ignore",
  });

  for await (const worksheet of reader) {
    const rows: ExcelJS.CellValue[][] = [];

    // A aba é lida até o fim, para o fluxo seguir para a próxima; guarda o começo.
    for await (const row of worksheet) {
      if (read.length >= MAX_SHEETS || row.number > MAX_ROWS) continue;
      while (rows.length < row.number - 1) rows.push([]);
      const values = Array.isArray(row.values) ? row.values : [];
      rows.push(values.slice(1));
    }

    if (read.length < MAX_SHEETS) {
      const { id, name } = worksheet as unknown as { id?: string | number; name?: string };
      read.push({ id: String(id ?? ""), fallback: name ?? `Aba ${read.length + 1}`, rows });
    }
  }

  // Os nomes das abas podem chegar com o workbook.xml, depois delas: o id da aba
  // (sheetN.xml) é o mesmo da lista de abas do arquivo.
  const sheets = (reader as unknown as { model?: { sheets?: { id: number; name: string }[] } }).model?.sheets ?? [];
  return read.map(({ id, fallback, rows }) => ({ name: sheets.find((sheet) => String(sheet.id) === id)?.name ?? fallback, rows: gridOf(rows) }));
}

/** Leitor comum, para os arquivos em que o de fluxo falha (a ordem das partes do zip muda de programa para programa). */
async function readWhole(data: Uint8Array): Promise<SheetGrid[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(data) as unknown as ArrayBuffer);

  return workbook.worksheets.slice(0, MAX_SHEETS).map((sheet) => {
    const rows: ExcelJS.CellValue[][] = [];
    for (let index = 1; index <= Math.min(sheet.rowCount, MAX_ROWS); index += 1) {
      const values = sheet.getRow(index).values;
      rows.push(Array.isArray(values) ? values.slice(1) : []);
    }
    return { name: sheet.name, rows: gridOf(rows) };
  });
}

/** As abas do arquivo como grades. Arquivo que nenhum leitor abre vira erro legível. */
export async function readWorkbookGrids(data: Uint8Array): Promise<SheetGrid[]> {
  try {
    return await readStreaming(data);
  } catch {
    try {
      return await readWhole(data);
    } catch {
      throw new TimesheetFileError("não é uma planilha .xlsx válida");
    }
  }
}
