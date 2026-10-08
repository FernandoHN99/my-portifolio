import { rejectForeignRequest } from "@/lib/same-origin-request";
import { rejectWithoutModule } from "@/modules/access/application/module-access";
import {
  IncomeBackupValidationError,
  previewIncomeBackup,
  restoreIncomeBackup,
} from "@/modules/income/application/income-backup";
import type { IncomeRestoreResponse } from "@/modules/income/domain/income-backup-format";

export const dynamic = "force-dynamic";

// Restauração do backup de Recebimentos (spec 092), em dois passos como o
// da carteira: `check` confere e resume sem gravar; `apply` substitui só os
// recebimentos do usuário. Rota, e não Server Action, pelo tamanho do arquivo.
export async function POST(request: Request) {
  const rejection = rejectForeignRequest(request) ?? (await rejectWithoutModule("INCOME"));

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
      return respond({ state: "checked", preview: await previewIncomeBackup(body.backup) });
    }

    return respond({ state: "restored", counts: await restoreIncomeBackup(body.backup) });
  } catch (error) {
    if (error instanceof IncomeBackupValidationError) {
      return invalid(error.message);
    }

    console.error("Falha ao restaurar Recebimentos:", error);
    return respond(
      { state: "invalid", message: "A restauração falhou e nada foi alterado. Confira se o arquivo está completo." },
      500,
    );
  }
}

function respond(body: IncomeRestoreResponse, status = 200) {
  return Response.json(body, { status });
}

function invalid(message: string) {
  return respond({ state: "invalid", message }, 400);
}
