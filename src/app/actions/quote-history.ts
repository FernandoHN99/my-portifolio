"use server";

import { z } from "zod";

import { getRunHistory, type QuoteRunHistoryPage } from "@/modules/quotes/application/get-run-history";

/** Próxima página do histórico de execuções da página de cotações (spec 028). */
export async function loadRunHistoryAction(before: unknown): Promise<QuoteRunHistoryPage | null> {
  const parsed = z.string().datetime().safeParse(before);
  return parsed.success ? getRunHistory(parsed.data) : null;
}
