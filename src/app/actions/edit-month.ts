"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  applyPositionChanges,
  cloneLatestMonth,
  MonthEditError,
  replaceAllocations,
  undoChange,
  updateMonthQuotes,
} from "@/modules/portfolio/application/month-editing";
import { toMonthParam } from "@/modules/portfolio/presentation/reference-month";

export type EditActionResult =
  | { ok: true; message: string; undoToken?: string; month?: string }
  | { ok: false; message: string };

const value = z.string().trim().min(1).max(40);
const strategy = z.string().trim().max(60).nullable();
const monthScope = { monthId: z.string().uuid(), confirmHistory: z.boolean() };

const positionChangesSchema = z
  .object({
    ...monthScope,
    updates: z
      .array(
        z
          .object({ positionId: z.string().uuid(), value: value.optional(), strategy: strategy.optional() })
          .refine((update) => update.value !== undefined || update.strategy !== undefined),
      )
      .max(500),
    removals: z.array(z.string().uuid()).max(500),
    additions: z
      .array(z.object({ accountId: z.string().uuid(), assetId: z.string().uuid(), value, strategy }))
      .max(100),
  });

const allocationsSchema = z.object({
  ...monthScope,
  positionId: z.string().uuid(),
  allocations: z
    .array(
      z.object({
        assetClass: z.string().max(80),
        subclass: z.string().max(80),
        duration: z.string().max(80),
        weightPercent: value,
      }),
    )
    .min(1)
    .max(20),
});

const quotesSchema = z.object({
  ...monthScope,
  quotes: z.array(z.object({ symbol: z.string().trim().min(1).max(20), valueBrl: value })).min(1).max(100),
});

export async function savePositionChangesAction(input: unknown): Promise<EditActionResult> {
  const parsed = positionChangesSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Revise os valores informados e tente novamente." };
  }

  return run(async () => {
    const result = await applyPositionChanges(parsed.data);
    return { ok: true, message: "Alterações salvas.", undoToken: result.undoToken };
  });
}

export async function saveAllocationsAction(input: unknown): Promise<EditActionResult> {
  const parsed = allocationsSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Revise as classificações informadas." };
  }

  return run(async () => {
    const result = await replaceAllocations(parsed.data);
    return { ok: true, message: "Rateio salvo.", undoToken: result.undoToken };
  });
}

export async function saveQuotesAction(input: unknown): Promise<EditActionResult> {
  const parsed = quotesSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Revise as cotações informadas." };
  }

  return run(async () => {
    const result = await updateMonthQuotes(parsed.data);
    return { ok: true, message: "Cotações salvas e posições recalculadas.", undoToken: result.undoToken };
  });
}

export async function cloneLatestMonthAction(): Promise<EditActionResult> {
  return run(async () => {
    const result = await cloneLatestMonth();
    return {
      ok: true,
      message: "Competência criada a partir da anterior.",
      undoToken: result.undoToken,
      month: toMonthParam(result.referenceDate),
    };
  });
}

export async function undoChangeAction(token: unknown): Promise<EditActionResult> {
  const parsed = z.string().uuid().safeParse(token);

  if (!parsed.success) {
    return { ok: false, message: "Não é mais possível desfazer esta alteração." };
  }

  return run(async () => {
    const result = await undoChange(parsed.data);
    return {
      ok: true,
      message: result.deleted ? "Competência removida." : "Alteração desfeita.",
      month: result.deleted ? undefined : toMonthParam(result.referenceDate),
    };
  });
}

async function run(operation: () => Promise<EditActionResult>): Promise<EditActionResult> {
  try {
    const result = await operation();
    revalidatePath("/");
    revalidatePath("/posicoes");
    return result;
  } catch (error) {
    return {
      ok: false,
      message: error instanceof MonthEditError ? error.message : "Não foi possível concluir a operação.",
    };
  }
}
