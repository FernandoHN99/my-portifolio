"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import {
  addPosition,
  cloneLatestMonth,
  editPosition,
  MonthEditError,
  removePosition,
  setMonthOpen,
  undoChange,
  updateMonthQuotes,
} from "@/modules/portfolio/application/month-editing";
import { ensureMonthsUpToDate } from "@/modules/portfolio/application/month-rollover";
import {
  addTransaction,
  liquidatePosition,
  removeTransaction,
  updateTransaction,
} from "@/modules/portfolio/application/position-transactions";
import { requireSessionUser } from "@/modules/auth/session";
import { ASSET_KINDS } from "@/modules/portfolio/domain/asset-kinds";
import { ASSET_TYPES } from "@/modules/portfolio/domain/classification";
import { TRANSACTION_KINDS } from "@/modules/portfolio/domain/position-transactions";
import { toMonthParam } from "@/modules/portfolio/presentation/reference-month";

export type EditActionResult =
  | { ok: true; message: string; undoToken?: string; month?: string }
  | { ok: false; message: string };

const value = z.string().trim().min(1).max(40);
const strategy = z.string().trim().max(60).nullable();
const monthScope = { monthId: z.string().uuid() };
const label = (max: number) => z.string().trim().min(1).max(max);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((entry) => entry >= "2000-01-01" && entry <= "2100-12-31" && !Number.isNaN(Date.parse(`${entry}T00:00:00Z`)));

// Rateio completo do formulário da posição (spec 043); o servidor confere a
// soma e a classificação fixa da spec 068.
const allocationsSchema = z
  .array(
    z.object({
      assetClass: z.string().max(80),
      subclass: z.string().max(80),
      duration: z.string().max(80),
      weightPercent: value,
    }),
  )
  .min(1)
  .max(20);

// Conta e ativo novos da inclusão (spec 026). O servidor ainda confere
// duplicados, o ticker pelo token da checagem e o vencimento.
const newAccountSchema = z
  .object({
    institutionId: z.string().uuid().nullable(),
    institutionName: label(60).nullable(),
    name: label(60),
  })
  .refine((account) => (account.institutionId === null) !== (account.institutionName === null));

const newAssetSchema = z.object({
  name: label(80),
  kind: z.enum(ASSET_KINDS),
  ticker: z.string().trim().max(120).nullable(),
  maturityDate: day.nullable(),
  liquidity: z.string().trim().max(30).nullable().optional(),
  quoteCheckToken: z.string().min(1).max(4096).nullable(),
  manualPriceBrl: value.nullable(),
  cashAccount: z.boolean().optional(),
  cdiPercent: z.string().trim().max(12).nullable().optional(),
  appliedOn: day.nullable().optional(),
});

const addSchema = z.object({
  ...monthScope,
  addition: z
    .object({
      accountId: z.string().uuid().optional(),
      newAccount: newAccountSchema.optional(),
      assetId: z.string().uuid().optional(),
      newAsset: newAssetSchema.optional(),
      value,
      valueKind: z.enum(["quantity", "amount"]).optional(),
      initialKind: z.enum(["OPENING", "CONTRIBUTION"]).optional(),
      executedPriceBrl: value.nullable().optional(),
      strategy,
      allocations: allocationsSchema,
    })
    .refine((addition) => (addition.accountId === undefined) !== (addition.newAccount === undefined))
    .refine((addition) => (addition.assetId === undefined) !== (addition.newAsset === undefined)),
});

const editSchema = z.object({
  ...monthScope,
  // Sem quantidade nem saldo: o lápis edita só atributos (spec 057).
  edit: z.object({
    positionId: z.string().uuid(),
    cdiStartDate: day.nullable().optional(),
    strategy,
    allocations: allocationsSchema,
    asset: z.object({
      name: label(120),
      liquidity: z.string().trim().max(60).nullable(),
      maturityDate: day.nullable(),
      cashAccount: z.boolean().optional(),
      cdiPercent: z.string().trim().max(12).nullable().optional(),
      assetType: z.enum(ASSET_TYPES).optional(),
    }),
  }),
});

const quotesSchema = z.object({
  ...monthScope,
  quotes: z.array(z.object({ symbol: z.string().trim().min(1).max(120), valueBrl: value })).min(1).max(100),
});

export async function addPositionAction(input: unknown): Promise<EditActionResult> {
  const parsed = addSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Revise os campos da posição e tente novamente." };
  }

  return run(async () => {
    // Um ticker novo fica cadastrado como pendente, e o job agendado carrega o
    // histórico dele (spec 053).
    const result = await addPosition(parsed.data);
    return { ok: true, message: "Posição incluída.", undoToken: result.undoToken };
  });
}

export async function editPositionAction(input: unknown): Promise<EditActionResult> {
  const parsed = editSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Revise os campos da posição e tente novamente." };
  }

  return run(async () => {
    const result = await editPosition(parsed.data);
    return { ok: true, message: "Posição salva.", undoToken: result.undoToken };
  });
}

export async function removePositionAction(input: unknown): Promise<EditActionResult> {
  const parsed = z.object({ ...monthScope, positionId: z.string().uuid() }).safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Posição inválida." };
  }

  return run(async () => {
    const result = await removePosition(parsed.data);
    return { ok: true, message: "Posição removida.", undoToken: result.undoToken };
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

export async function setMonthOpenAction(input: unknown): Promise<EditActionResult> {
  const parsed = z.object({ monthId: z.string().uuid(), open: z.boolean() }).safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Competência inválida." };
  }

  return run(async () => {
    await setMonthOpen(parsed.data);
    return { ok: true, message: parsed.data.open ? "Mês aberto para edição." : "Mês fechado." };
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

const transactionSchema = z.object({
  ...monthScope,
  transaction: z.object({
    positionId: z.string().uuid(),
    kind: z.enum(TRANSACTION_KINDS),
    occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    quantity: z.string().trim().max(40).nullable(),
    unitPriceBrl: z.string().trim().max(40).nullable(),
    amountBrl: z.string().trim().min(1).max(40),
    note: z.string().trim().max(200).nullable().optional(),
  }),
});

const transactionRemovalSchema = z.object({ ...monthScope, transactionId: z.string().uuid() });
const transactionUpdateSchema = transactionSchema.extend({ transactionId: z.string().uuid() });

const TRANSACTION_DONE: Record<(typeof TRANSACTION_KINDS)[number], string> = {
  CONTRIBUTION: "Aporte registrado.",
  WITHDRAWAL: "Retirada registrada.",
  INCOME: "Rendimento registrado.",
};

/** Aporte, retirada ou rendimento numa posição do mês aberto (spec 056). */
export async function addTransactionAction(input: unknown): Promise<EditActionResult> {
  const parsed = transactionSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Revise os campos da movimentação e tente novamente." };
  }

  return run(async () => {
    const result = await addTransaction(parsed.data);
    return { ok: true, message: TRANSACTION_DONE[parsed.data.transaction.kind], undoToken: result.undoToken };
  });
}

/** Corrige uma movimentação do mês aberto, no lugar (spec 057). */
export async function updateTransactionAction(input: unknown): Promise<EditActionResult> {
  const parsed = transactionUpdateSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Revise os campos da movimentação e tente novamente." };
  }

  return run(async () => {
    const result = await updateTransaction(parsed.data);
    return { ok: true, message: "Movimentação corrigida.", undoToken: result.undoToken };
  });
}

/** Apaga uma movimentação do mês aberto, desfazendo o efeito no saldo. */
export async function removeTransactionAction(input: unknown): Promise<EditActionResult> {
  const parsed = transactionRemovalSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Não foi possível identificar a movimentação." };
  }

  return run(async () => {
    const result = await removeTransaction(parsed.data);
    return { ok: true, message: "Movimentação apagada.", undoToken: result.undoToken };
  });
}

const liquidationSchema = z.object({
  ...monthScope,
  liquidation: z.object({
    positionId: z.string().uuid(),
    destinationPositionId: z.string().uuid(),
    occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amountBrl: z.string().trim().min(1).max(40),
  }),
});

/** Liquida um título vencido na conta corrente escolhida (spec 059). */
export async function liquidatePositionAction(input: unknown): Promise<EditActionResult> {
  const parsed = liquidationSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Revise os campos da liquidação e tente novamente." };
  }

  return run(async () => {
    const result = await liquidatePosition(parsed.data);
    return { ok: true, message: "Título liquidado na conta corrente.", undoToken: result.undoToken };
  });
}

/**
 * Primeira competência de um usuário novo (spec 055), quando ele quer incluir a
 * primeira posição antes da checagem de abertura criá-la.
 */
export async function startPortfolioAction(): Promise<EditActionResult> {
  return run(async () => {
    const outcome = await ensureMonthsUpToDate();

    if (outcome.state === "unavailable") {
      return { ok: false, message: outcome.message };
    }

    return { ok: true, message: "Competência do mês criada." };
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
  // Sem sessão, leva à entrada (spec 050), fora do try para não virar erro.
  await requireSessionUser();

  try {
    const result = await operation();
    revalidatePath("/");
    revalidatePath("/posicoes");
    revalidatePath("/posicoes/cotacoes");
    revalidatePath("/posicoes/[accountId]/[assetId]", "page");
    return result;
  } catch (error) {
    unstable_rethrow(error);
    return {
      ok: false,
      message: error instanceof MonthEditError ? error.message : "Não foi possível concluir a operação.",
    };
  }
}
