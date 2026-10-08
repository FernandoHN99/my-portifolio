import { rejectWithoutModule } from "@/modules/access/application/module-access";
import { exportIncomeBackup } from "@/modules/income/application/income-backup";
import { incomeBackupFileName } from "@/modules/income/domain/income-backup-format";

export const dynamic = "force-dynamic";

// Download do backup de Recebimentos (spec 092). Só leitura, só para quem
// tem a concessão da área (os demais recebem 404), e nunca vindo de outro site.
export async function GET(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ message: "Origem não permitida." }, { status: 403 });
  }

  const rejection = await rejectWithoutModule("INCOME");

  if (rejection) {
    return rejection;
  }

  const backup = await exportIncomeBackup().catch((error: unknown) => {
    console.error("Falha ao exportar Recebimentos:", error);
    return null;
  });

  if (!backup) {
    return Response.json({ message: "Não foi possível ler os dados para o backup." }, { status: 503 });
  }

  return new Response(JSON.stringify(backup), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${incomeBackupFileName(new Date(backup.exportedAt))}"`,
      "cache-control": "no-store",
    },
  });
}
