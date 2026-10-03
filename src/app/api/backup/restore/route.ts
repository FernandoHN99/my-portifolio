import { rejectForeignRequest } from "@/lib/same-origin-request";
import { BackupValidationError, previewBackup, restoreBackup } from "@/modules/backup/application/backup";
import type { BackupRestoreResponse } from "@/modules/backup/domain/backup-format";

export const dynamic = "force-dynamic";

// Restauração do backup (spec 042), em dois passos: `check` confere o arquivo
// e devolve o resumo sem gravar; `apply` substitui todos os dados. É rota, e
// não Server Action, porque o arquivo passa do limite de 1 MB das actions.
export async function POST(request: Request) {
  const rejection = rejectForeignRequest(request);

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
      const preview = await previewBackup(body.backup);
      return preview ? respond({ state: "checked", preview }) : unavailable();
    }

    const counts = await restoreBackup(body.backup);
    return counts ? respond({ state: "restored", counts }) : unavailable();
  } catch (error) {
    if (error instanceof BackupValidationError) {
      return invalid(error.message);
    }

    console.error("Falha ao restaurar o backup:", error);
    return respond(
      { state: "invalid", message: "A restauração falhou e nada foi alterado. Confira se o arquivo está completo." },
      500,
    );
  }
}

function respond(body: BackupRestoreResponse, status = 200) {
  return Response.json(body, { status });
}

function invalid(message: string) {
  return respond({ state: "invalid", message }, 400);
}

function unavailable() {
  return respond({ state: "invalid", message: "O banco de dados não está disponível." }, 503);
}
