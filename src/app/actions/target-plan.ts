"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { saveTargetPlan, TargetPlanError } from "@/modules/portfolio/application/target-plan-editing";

const schema = z
  .array(z.object({ key: z.string().min(1).max(200), percent: z.string().trim().min(1).max(20) }))
  .min(1)
  .max(200);

export type TargetPlanActionResult = { ok: boolean; message: string };

export async function saveTargetPlanAction(input: unknown): Promise<TargetPlanActionResult> {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Revise os percentuais informados." };
  }

  try {
    const plan = await saveTargetPlan(parsed.data);
    revalidatePath("/");
    revalidatePath("/configuracao");
    return { ok: true, message: `${plan.name} passou a valer em todas as análises.` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof TargetPlanError ? error.message : "Não foi possível salvar as metas.",
    };
  }
}
