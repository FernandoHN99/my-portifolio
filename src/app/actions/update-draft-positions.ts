"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  DraftPositionUpdateError,
  updateDraftPositions,
} from "@/modules/portfolio/application/update-draft-positions";

const positionUpdateSchema = z.object({
  positionId: z.string().uuid(),
  kind: z.enum(["QUANTITY", "BALANCE"]),
  value: z.string().trim().min(1),
});

const updateDraftSchema = z.object({
  monthId: z.string().uuid(),
  updates: z.array(positionUpdateSchema).min(1),
});

export type DraftPositionActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export async function updateDraftPositionsAction(
  _previousState: DraftPositionActionState,
  formData: FormData,
): Promise<DraftPositionActionState> {
  let rawUpdates: unknown;
  try {
    rawUpdates = JSON.parse(String(formData.get("updates") ?? "[]"));
  } catch {
    return failure("Não foi possível interpretar as alterações.");
  }

  const input = updateDraftSchema.safeParse({
    monthId: formData.get("monthId"),
    updates: rawUpdates,
  });

  if (!input.success) {
    return failure("Revise os valores informados e tente novamente.");
  }

  try {
    await updateDraftPositions(input.data);
  } catch (error) {
    return failure(
      error instanceof DraftPositionUpdateError
        ? error.message
        : "Não foi possível salvar as posições.",
    );
  }

  revalidatePath("/");
  revalidatePath("/carteira/editar");
  revalidatePath("/atualizacao");
  redirect("/carteira/editar?salvo=1");
}

function failure(message: string): DraftPositionActionState {
  return { status: "error", message };
}
