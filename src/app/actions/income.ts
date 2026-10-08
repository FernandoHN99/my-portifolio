"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { isCompetence } from "@/lib/competence";
import { MAX_AMOUNT_CENTS, parseAmountInput } from "@/lib/money";
import { ModuleAccessError } from "@/modules/access/application/module-access";
import { requireSessionUser } from "@/modules/auth/session";
import {
  createIncomeMonth,
  deleteIncomeMonth,
  IncomeEditError,
  undoIncomeChange,
  updateIncomeMonth,
} from "@/modules/income/application/income-editing";
import { isIsoDate, PAYSLIP_KINDS } from "@/modules/income/domain/income";

// Ações de Recebimentos (spec 088). Cada uma confere a sessão, valida a
// entrada aqui no servidor e grava pelo cliente da área, que confere a
// concessão e o dono. Valores chegam como texto e viram centavos exatos.

export type IncomeActionResult =
  | { ok: true; message: string; undoToken?: string }
  | { ok: false; message: string };

const id = z.string().uuid();

/** Campo opcional do mês: vazio é não lançado; zero é um valor. */
const optionalAmount = z
  .string()
  .max(24)
  .transform((text, context) => {
    if (text.trim() === "") {
      return null;
    }

    const cents = parseAmountInput(text);

    if (cents === null || cents < 0 || cents > MAX_AMOUNT_CENTS) {
      context.addIssue({ code: "custom", message: "valor" });
      return z.NEVER;
    }

    return cents;
  });

const grossAmount = z
  .string()
  .max(24)
  .transform((text, context) => {
    const cents = parseAmountInput(text);

    if (cents === null || cents <= 0 || cents > MAX_AMOUNT_CENTS) {
      context.addIssue({ code: "custom", message: "valor" });
      return z.NEVER;
    }

    return cents;
  });

const isoDate = z.string().refine(isIsoDate);

const payslip = z.object({
  kind: z.enum(PAYSLIP_KINDS),
  label: z.string().trim().max(60).nullable(),
  employer: z.string().trim().min(1).max(80),
  startsOn: isoDate,
  endsOn: isoDate,
  gross: grossAmount,
  prorated: z.boolean(),
  taxable: z.boolean(),
});

const fields = {
  month: z.string().refine(isCompetence),
  netIncome: optionalAmount,
  mealVoucher: optionalAmount,
  cardSpend: optionalAmount,
  pixSpend: optionalAmount,
  mealVoucherSpend: optionalAmount,
  payslips: z.array(payslip).max(12),
};

const saveSchema = z.union([
  z.object({ ...fields, id }),
  z.object({ ...fields, requestId: id }),
]);

const INVALID = "Revise os campos do mês e tente novamente.";

export async function saveIncomeMonthAction(input: unknown): Promise<IncomeActionResult> {
  const parsed = saveSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: INVALID };
  }

  return run(async () => {
    const data = parsed.data;
    const month = {
      month: data.month,
      values: {
        netIncomeCents: data.netIncome,
        mealVoucherCents: data.mealVoucher,
        cardSpendCents: data.cardSpend,
        pixSpendCents: data.pixSpend,
        mealVoucherSpendCents: data.mealVoucherSpend,
      },
      payslips: data.payslips.map(({ gross, label, ...rest }) => ({ ...rest, label: label || null, grossCents: gross })),
    };

    if ("id" in data) {
      await updateIncomeMonth(data.id, month);
      return { ok: true, message: "Mês salvo." };
    }

    const result = await createIncomeMonth({ ...month, requestId: data.requestId });
    return { ok: true, message: result.repeated ? "Este mês já tinha sido incluído." : "Mês incluído." };
  });
}

export async function deleteIncomeMonthAction(input: unknown): Promise<IncomeActionResult> {
  const parsed = z.object({ id }).safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Escolha o mês para excluir." };
  }

  return run(async () => {
    const result = await deleteIncomeMonth(parsed.data.id);
    return { ok: true, message: "Mês excluído.", undoToken: result.undoToken };
  });
}

export async function undoIncomeChangeAction(token: unknown): Promise<IncomeActionResult> {
  const parsed = id.safeParse(token);

  if (!parsed.success) {
    return { ok: false, message: "Não é mais possível desfazer esta alteração." };
  }

  return run(async () => {
    await undoIncomeChange(parsed.data);
    return { ok: true, message: "Alteração desfeita." };
  });
}

async function run(operation: () => Promise<IncomeActionResult>): Promise<IncomeActionResult> {
  // Sem sessão, leva à entrada (spec 050), fora do try para não virar erro.
  await requireSessionUser();

  try {
    const result = await operation();
    // A Previdência lê os holerites daqui (spec 089).
    revalidatePath("/recebimentos");
    revalidatePath("/previdencia");
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
