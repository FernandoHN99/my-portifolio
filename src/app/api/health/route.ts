import { getDatabaseStatus } from "@/lib/database-status";

export const dynamic = "force-dynamic";

export async function GET() {
  const database = await getDatabaseStatus();
  const healthy = database.state === "online";

  return Response.json(
    {
      application: "online",
      database: database.state,
      ...(database.latencyMs === undefined
        ? {}
        : { databaseLatencyMs: database.latencyMs }),
    },
    { status: healthy ? 200 : 503 },
  );
}
