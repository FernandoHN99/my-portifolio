import { rejectWithoutModule } from "@/modules/access/application/module-access";
import { exportFamilyBackup } from "@/modules/family-expenses/application/family-backup";
import { familyBackupFileName } from "@/modules/family-expenses/domain/family-backup-format";

export const dynamic = "force-dynamic";

// Download do backup de Gastos familiares (spec 084). Só leitura, só para quem
// tem a concessão da área (os demais recebem 404), e nunca vindo de outro site.
export async function GET(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ message: "Origem não permitida." }, { status: 403 });
  }

  const rejection = await rejectWithoutModule("FAMILY_EXPENSES");

  if (rejection) {
    return rejection;
  }

  const backup = await exportFamilyBackup().catch((error: unknown) => {
    console.error("Falha ao exportar Gastos familiares:", error);
    return null;
  });

  if (!backup) {
    return Response.json({ message: "Não foi possível ler os dados para o backup." }, { status: 503 });
  }

  return new Response(JSON.stringify(backup), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${familyBackupFileName(new Date(backup.exportedAt))}"`,
      "cache-control": "no-store",
    },
  });
}
