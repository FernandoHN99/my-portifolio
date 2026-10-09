"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import type { IncomeActionResult } from "@/app/actions/income";
import { isCompetence } from "@/lib/competence";
import { ModuleAccessError } from "@/modules/access/application/module-access";
import { requireSessionUser } from "@/modules/auth/session";
import { IncomeEditError } from "@/modules/income/application/income-db";
import { deleteOvertimeMonth, saveOvertimeEntry, saveOvertimeRules, undoOvertimeChange } from "@/modules/income/application/overtime-editing";
import { isIsoDate } from "@/modules/income/domain/income";
import { DAY_TYPES, MAX_MONTH_OVERTIME, MAX_PERCENT, OVERTIME_PAY_KINDS, parseHoursInput } from "@/modules/income/domain/overtime";

// Ações das Horas extras (spec 098). Como as de Recebimentos: conferem a
// sessão, validam aqui e gravam pelo cliente da área, que confere a concessão
// e o dono. Horas chegam como texto ("9", "9,5", "9:30") e viram centésimos.

const id = z.string().uuid();

function hoursField({ required = false, max = MAX_MONTH_OVERTIME } = {}) {
  return z
    .string()
    .max(12)
    .transform((text, context) => {
      const hours = parseHoursInput(text);

      if (hours === null) {
        if (!required) return 0;
        context.addIssue({ code: "custom", message: "horas" });
        return z.NEVER;
      }

      if (Number.isNaN(hours) || hours < 0 || hours > max) {
        context.addIssue({ code: "custom", message: "horas" });
        return z.NEVER;
      }

      return hours;
    });
}

/** Limite diário opcional: vazio é "desconhecido". */
const optionalLimit = z
  .string()
  .max(12)
  .transform((text, context) => {
    const hours = parseHoursInput(text);
    if (hours === null) return null;
    if (Number.isNaN(hours) || hours < 0 || hours > 1600) {
      context.addIssue({ code: "custom", message: "limite" });
      return z.NEVER;
    }
    return hours;
  });

const isoDate = z.string().refine(isIsoDate);
const note = z.string().max(500).nullable();

const payment = z.object({
  id: id.optional(),
  paymentMonth: z.string().refine(isCompetence),
  lines: z.array(z.object({ kind: z.enum(OVERTIME_PAY_KINDS), hours: hoursField() })).max(OVERTIME_PAY_KINDS.length),
  note,
});

const entrySchema = z.object({
  id: id.optional(),
  requestId: id,
  attached: z.boolean(),
  month: z.string().refine(isCompetence),
  startsOn: isoDate,
  endsOn: isoDate,
  weekday: hoursField(),
  weekdayBeyond: hoursField(),
  saturday: hoursField(),
  sunday: hoursField(),
  holiday: hoursField(),
  compensated: hoursField(),
  note,
  dayTypes: z.array(z.object({ dayId: id, dayType: z.enum(DAY_TYPES) })).max(62),
  payments: z.array(payment).max(12),
});

/**
 * O formulário único do mês (declaração, folha e pagamentos). A folha, quando
 * anexada, já foi gravada pela rota de importação; aqui entram as horas como
 * estão nos campos, o tipo dos dias, os ajustes e os pagamentos (só as horas).
 */
export async function saveOvertimeEntryAction(input: unknown): Promise<IncomeActionResult> {
  const parsed = entrySchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Revise as horas do mês e dos pagamentos." };
  }

  return run(async () => {
    const { weekday, weekdayBeyond, saturday, sunday, holiday, ...data } = parsed.data;
    await saveOvertimeEntry({ ...data, totals: { weekday, weekdayBeyond, saturday, sunday, holiday } });
    return { ok: true, message: data.id ? "Mês salvo." : "Mês declarado." };
  });
}

export async function deleteOvertimeMonthAction(input: unknown): Promise<IncomeActionResult> {
  const parsed = z.object({ id }).safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Escolha o mês para excluir." };
  }

  return run(async () => {
    const result = await deleteOvertimeMonth(parsed.data.id);
    return { ok: true, message: "Mês excluído.", undoToken: result.undoToken };
  });
}

export async function undoOvertimeChangeAction(token: unknown): Promise<IncomeActionResult> {
  const parsed = id.safeParse(token);

  if (!parsed.success) {
    return { ok: false, message: "Não é mais possível desfazer esta alteração." };
  }

  return run(async () => {
    await undoOvertimeChange(parsed.data);
    return { ok: true, message: "Alteração desfeita." };
  });
}

const percent = z.number().int().min(0).max(MAX_PERCENT);

const rule = z.object({
  effectiveFrom: z.string().refine(isCompetence),
  dailyHours: hoursField({ required: true, max: 1200 }),
  weekdayPercent: percent,
  weekdayBeyondPercent: percent,
  saturdayPercent: percent,
  sundayPercent: percent,
  holidayPercent: percent,
  usualDailyLimit: optionalLimit,
  exceptionalDailyLimit: optionalLimit,
  netShortfall: z.boolean(),
  note: z.string().max(300).nullable(),
});

export async function saveOvertimeRulesAction(input: unknown): Promise<IncomeActionResult> {
  const parsed = z.object({ rules: z.array(rule).max(24) }).safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Revise os campos da regra e tente novamente." };
  }

  return run(async () => {
    await saveOvertimeRules(parsed.data.rules);
    return { ok: true, message: "Regras salvas." };
  });
}

async function run(operation: () => Promise<IncomeActionResult>): Promise<IncomeActionResult> {
  await requireSessionUser();

  try {
    const result = await operation();
    revalidatePath("/recebimentos/horas-extras");
    return result;
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof ModuleAccessError) {
      return { ok: false, message: "Esta área não está disponível para a sua conta." };
    }

    return {
      ok: false,
      message: error instanceof IncomeEditError ? error.message : "Não foi possível concluir a operação.",
    };
  }
}
