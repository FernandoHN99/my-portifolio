import { exportBackup } from "@/modules/backup/application/backup";
import { backupFileName } from "@/modules/backup/domain/backup-format";

export const dynamic = "force-dynamic";

// Download do backup completo (spec 042). Só leitura; a navegação vinda de
// outro site é recusada para nenhuma página alheia disparar o download.
export async function GET(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ message: "Origem não permitida." }, { status: 403 });
  }

  const backup = await exportBackup().catch(() => null);

  if (!backup) {
    return Response.json({ message: "Não foi possível ler os dados para o backup." }, { status: 503 });
  }

  return new Response(JSON.stringify(backup), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${backupFileName(new Date(backup.exportedAt))}"`,
      "cache-control": "no-store",
    },
  });
}
