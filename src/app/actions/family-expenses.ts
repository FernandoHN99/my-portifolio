"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { ModuleAccessError } from "@/modules/access/application/module-access";
import { requireSessionUser } from "@/modules/auth/session";
import {
  createContact,
  createEntry,
  deleteContact,
  deleteEntries,
  FamilyEditError,
  renameContact,
  reopenEntry,
  settleEntries,
  undoFamilyChange,
  updateEntry,
  updateSeries,
} from "@/modules/family-expenses/application/family-editing";
import { isCompetence } from "@/lib/competence";
import { MAX_AMOUNT_CENTS, parseAmountInput } from "@/lib/money";
import { MAX_SERIES_COUNT } from "@/modules/family-expenses/domain/series";

// Ações de Gastos familiares (specs 082 e 083). Cada uma confere a sessão, valida
// a entrada aqui no servidor e grava pelo cliente da área, que confere a
// concessão e o dono. Valores chegam como texto e viram centavos exatos.

export type FamilyActionResult =
  | { ok: true; message: string; undoToken?: string }
  | { ok: false; message: string };

const id = z.string().uuid();
const competence = z.string().refine(isCompetence);
const name = z.string().trim().min(1).max(60);
const amount = z
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
const contact = z.union([z.object({ contactId: id }), z.object({ newContactName: name })]);
const fields = {
  competence,
  description: z.string().trim().min(1).max(120),
  contact,
  direction: z.enum(["RECEIVABLE", "PAYABLE"]),
  amount,
};
const status = z.enum(["PENDING", "SETTLED"]);
const repeat = z.object({ kind: z.enum(["INSTALLMENTS", "MONTHLY"]), count: z.number().int().min(2).max(MAX_SERIES_COUNT) });

const createSchema = z.object({ ...fields, status, repeat: repeat.nullable(), requestId: id });
const updateSchema = z.object({ id, ...fields, status });
const seriesSchema = z.object({ seriesId: id, ...fields, kind: repeat.shape.kind, count: z.number().int().min(1).max(MAX_SERIES_COUNT) });
const idsSchema = z.array(id).min(1).max(1_000);

const INVALID = "Revise os campos do lançamento e tente novamente.";

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export async function createFamilyEntryAction(input: unknown): Promise<FamilyActionResult> {
  const parsed = createSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: INVALID };
  }

  return run(async () => {
    const { amount: amountCents, ...rest } = parsed.data;
    const result = await createEntry({ ...rest, amountCents });

    if (result.repeated) {
      return { ok: true, message: "Este lançamento já tinha sido incluído." };
    }

    return {
      ok: true,
      message: result.created === 1 ? "Lançamento incluído." : `${plural(result.created, "lançamento", "lançamentos")} incluídos.`,
    };
  });
}

export async function updateFamilyEntryAction(input: unknown): Promise<FamilyActionResult> {
  const parsed = updateSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: INVALID };
  }

  return run(async () => {
    const { id: entryId, amount: amountCents, ...rest } = parsed.data;
    await updateEntry(entryId, { ...rest, amountCents });
    return { ok: true, message: "Lançamento salvo." };
  });
}

export async function updateFamilySeriesAction(input: unknown): Promise<FamilyActionResult> {
  const parsed = seriesSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: INVALID };
  }

  return run(async () => {
    const { seriesId, amount: amountCents, ...rest } = parsed.data;
    const result = await updateSeries(seriesId, { ...rest, amountCents });
    const changes = [
      result.updated > 0 ? `${plural(result.updated, "pendente atualizado", "pendentes atualizados")}` : null,
      result.created > 0 ? `${plural(result.created, "novo", "novos")}` : null,
      result.removed > 0 ? `${plural(result.removed, "excluído", "excluídos")}` : null,
    ].filter(Boolean);
    return { ok: true, message: changes.length > 0 ? `Série salva: ${changes.join(", ")}.` : "Série salva." };
  });
}

export async function deleteFamilyEntriesAction(input: unknown): Promise<FamilyActionResult> {
  const parsed = z.union([z.object({ ids: idsSchema }), z.object({ seriesId: id })]).safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Escolha o que excluir." };
  }

  return run(async () => {
    const result = await deleteEntries(parsed.data);
    return {
      ok: true,
      message: result.removed === 1 ? "Lançamento excluído." : `${plural(result.removed, "lançamento excluído", "lançamentos excluídos")}.`,
      undoToken: result.undoToken,
    };
  });
}

export async function settleFamilyEntriesAction(input: unknown): Promise<FamilyActionResult> {
  const parsed = z.object({ ids: idsSchema }).safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Escolha os lançamentos para acertar." };
  }

  return run(async () => {
    const result = await settleEntries(parsed.data.ids);
    return {
      ok: true,
      message: result.settled === 1 ? "Lançamento acertado." : `${plural(result.settled, "lançamento acertado", "lançamentos acertados")}.`,
      undoToken: result.undoToken,
    };
  });
}

export async function undoFamilyChangeAction(token: unknown): Promise<FamilyActionResult> {
  const parsed = id.safeParse(token);

  if (!parsed.success) {
    return { ok: false, message: "Não é mais possível desfazer esta alteração." };
  }

  return run(async () => {
    await undoFamilyChange(parsed.data);
    return { ok: true, message: "Alteração desfeita." };
  });
}

export async function reopenFamilyEntryAction(input: unknown): Promise<FamilyActionResult> {
  const parsed = z.object({ id }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Escolha o lançamento para reverter." };
  return run(async () => {
    const result = await reopenEntry(parsed.data.id);
    return { ok: true, message: "Lançamento voltou a pendente.", undoToken: result.undoToken };
  });
}

export async function createFamilyContactAction(input: unknown): Promise<FamilyActionResult> {
  const parsed = z.object({ name }).safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Informe o nome da pessoa." };
  }

  return run(async () => {
    await createContact(parsed.data.name);
    return { ok: true, message: "Pessoa incluída." };
  });
}

export async function renameFamilyContactAction(input: unknown): Promise<FamilyActionResult> {
  const parsed = z.object({ id, name }).safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Informe o nome da pessoa." };
  }

  return run(async () => {
    await renameContact(parsed.data.id, parsed.data.name);
    return { ok: true, message: "Pessoa renomeada." };
  });
}

export async function deleteFamilyContactAction(input: unknown): Promise<FamilyActionResult> {
  const parsed = z.object({ id }).safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Pessoa não encontrada." };
  }

  return run(async () => {
    await deleteContact(parsed.data.id);
    return { ok: true, message: "Pessoa excluída." };
  });
}

async function run(operation: () => Promise<FamilyActionResult>): Promise<FamilyActionResult> {
  // Sem sessão, leva à entrada (spec 050), fora do try para não virar erro.
  await requireSessionUser();

  try {
    const result = await operation();
    revalidatePath("/gastos-familiares");
    return result;
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof ModuleAccessError) {
      return { ok: false, message: "Esta área não está disponível para a sua conta." };
    }

    return {
      ok: false,
      message: error instanceof FamilyEditError ? error.message : "Não foi possível concluir a operação.",
    };
  }
}
