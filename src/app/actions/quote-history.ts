"use server";

import { z } from "zod";

import { getRunHistory, type QuoteRunHistoryPage } from "@/modules/quotes/application/get-run-history";

/** Próxima página do histórico de execuções da competência (spec 046). */
export async function loadRunHistoryAction(month: unknown, before: unknown): Promise<QuoteRunHistoryPage | null> {
  const parsed = z
    .object({ month: z.string().regex(/^\d{4}-\d{2}$/), before: z.string().datetime() })
    .safeParse({ month, before });
  return parsed.success
    ? getRunHistory(new Date(`${parsed.data.month}-01T00:00:00.000Z`), parsed.data.before)
    : null;
}
