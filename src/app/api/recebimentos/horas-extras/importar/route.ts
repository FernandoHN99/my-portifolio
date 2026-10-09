import { revalidatePath } from "next/cache";

import { isCompetence } from "@/lib/competence";
import { rejectForeignRequest } from "@/lib/same-origin-request";
import { rejectWithoutModule } from "@/modules/access/application/module-access";
import { localToday } from "@/modules/income/application/get-overtime-view";
import {
  applyOvertimeImport,
  MAX_IMPORT_FILES,
  previewOvertimeImport,
  type OvertimeImportResponse,
  type TimesheetFile,
} from "@/modules/income/application/overtime-import";

export const dynamic = "force-dynamic";

/** Soma dos arquivos em base64: cabe com folga no limite de 4,5 MB das funções. */
const MAX_BASE64_CHARS = 4_000_000;

// Importação das folhas de horas (spec 098), em dois passos como o backup:
// `check` lê e mostra a prévia; `apply` grava os meses escolhidos. Os arquivos
// vêm em base64 dentro de um JSON, para a rota exigir a mesma origem das
// demais, e só quem tem Recebimentos chega aqui.
export async function POST(request: Request) {
  const rejection = rejectForeignRequest(request) ?? (await rejectWithoutModule("INCOME"));

  if (rejection) {
    return rejection;
  }

  let body: { mode?: unknown; files?: unknown; months?: unknown };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return invalid("O pedido não é um JSON válido.");
  }

  if (body.mode !== "check" && body.mode !== "apply") {
    return invalid("Pedido sem o modo da importação.");
  }

  const files = parseFiles(body.files);

  if (typeof files === "string") {
    return invalid(files);
  }

  try {
    if (body.mode === "check") {
      return respond({ state: "checked", preview: await previewOvertimeImport(files, localToday()) });
    }

    const months = Array.isArray(body.months) ? body.months.filter((month): month is string => typeof month === "string" && isCompetence(month)) : [];
    const saved = await applyOvertimeImport(files, months, localToday());
    revalidatePath("/recebimentos/horas-extras");
    return respond({ state: "imported", months: saved });
  } catch (error) {
    console.error("Falha ao importar as folhas de horas:", error);
    return respond({ state: "invalid", message: "A importação falhou e nada foi alterado." }, 500);
  }
}

function parseFiles(input: unknown): TimesheetFile[] | string {
  if (!Array.isArray(input) || input.length === 0) return "Escolha ao menos um arquivo .xlsx.";
  if (input.length > MAX_IMPORT_FILES) return `Envie até ${MAX_IMPORT_FILES} arquivos por vez.`;

  let total = 0;
  const files: TimesheetFile[] = [];

  for (const entry of input) {
    if (!entry || typeof entry !== "object") return "Arquivo inválido.";
    const { name, data } = entry as { name?: unknown; data?: unknown };
    if (typeof name !== "string" || typeof data !== "string" || name.length > 200) return "Arquivo inválido.";
    total += data.length;
    if (total > MAX_BASE64_CHARS) return "Os arquivos passam de 3 MB juntos: envie em partes.";
    files.push({ name, data: new Uint8Array(Buffer.from(data, "base64")) });
  }

  return files;
}

function respond(body: OvertimeImportResponse, status = 200) {
  return Response.json(body, { status });
}

function invalid(message: string) {
  return respond({ state: "invalid", message }, 400);
}
