"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { refreshPortfolioMonth } from "@/modules/portfolio/application/refresh-portfolio-month";

export async function refreshPortfolioMonthAction() {
  const outcome = await refreshPortfolioMonth();

  revalidatePath("/");
  revalidatePath("/atualizacao");
  redirect(`/atualizacao/${outcome.runId}`);
}
