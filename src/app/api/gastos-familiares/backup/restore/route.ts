import { rejectForeignRequest } from "@/lib/same-origin-request";
import { rejectWithoutModule } from "@/modules/access/application/module-access";
import {
  FamilyBackupValidationError,
  previewFamilyBackup,
  restoreFamilyBackup,
} from "@/modules/family-expenses/application/family-backup";
import type { FamilyRestoreResponse } from "@/modules/family-expenses/domain/family-backup-format";

export const dynamic = "force-dynamic";

// Restauração do backup de Gastos familiares (spec 084), em dois passos como o
// da carteira: `check` confere e resume sem gravar; `apply` substitui só os
// gastos do usuário. Rota, e não Server Action, pelo tamanho do arquivo.
export async function POST(request: Request) {
  const rejection = rejectForeignRequest(request) ?? (await rejectWithoutModule("FAMILY_EXPENSES"));

  if (rejection) {
    return rejection;
  }

  let body: { mode?: unknown; backup?: unknown };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return invalid("O arquivo não é um JSON válido.");
  }

  if (body.mode !== "check" && body.mode !== "apply") {
    return invalid("Pedido sem o modo da restauração.");
  }

  try {
    if (body.mode === "check") {
      return respond({ state: "checked", preview: await previewFamilyBackup(body.backup) });
    }

    return respond({ state: "restored", counts: await restoreFamilyBackup(body.backup) });
  } catch (error) {
    if (error instanceof FamilyBackupValidationError) {
      return invalid(error.message);
    }

    console.error("Falha ao restaurar Gastos familiares:", error);
    return respond(
      { state: "invalid", message: "A restauração falhou e nada foi alterado. Confira se o arquivo está completo." },
      500,
    );
  }
}

function respond(body: FamilyRestoreResponse, status = 200) {
  return Response.json(body, { status });
}

function invalid(message: string) {
  return respond({ state: "invalid", message }, 400);
}
