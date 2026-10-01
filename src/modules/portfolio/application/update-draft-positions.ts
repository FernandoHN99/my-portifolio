import { PortfolioMonthStatus, Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";

export type DraftPositionUpdate = {
  positionId: string;
  kind: "QUANTITY" | "BALANCE";
  value: string;
};

export async function updateDraftPositions({
  monthId,
  updates,
}: {
  monthId: string;
  updates: DraftPositionUpdate[];
}) {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new DraftPositionUpdateError("O banco de dados não está disponível.");
  }

  const uniquePositionIds = new Set(updates.map((update) => update.positionId));
  if (uniquePositionIds.size !== updates.length) {
    throw new DraftPositionUpdateError("A lista contém posições repetidas.");
  }

  const month = await prisma.portfolioMonth.findUnique({
    where: { id: monthId },
    select: {
      status: true,
      positions: {
        select: {
          id: true,
          unitPriceBrl: true,
          asset: { select: { quoteSymbol: true } },
        },
      },
    },
  });

  if (!month || month.status !== PortfolioMonthStatus.DRAFT) {
    throw new DraftPositionUpdateError("Esta competência não está disponível para edição.");
  }

  if (month.positions.length !== updates.length) {
    throw new DraftPositionUpdateError(
      "A carteira mudou desde que esta tela foi aberta. Recarregue a página.",
    );
  }

  const positions = new Map(month.positions.map((position) => [position.id, position]));
  const parsedUpdates: Array<{
    positionId: string;
    kind: "QUANTITY" | "BALANCE";
    value: Prisma.Decimal;
  }> = [];

  for (const update of updates) {
    const position = positions.get(update.positionId);
    if (!position) {
      throw new DraftPositionUpdateError("Uma das posições não pertence a esta competência.");
    }

    const expectedKind = position.asset.quoteSymbol ? "QUANTITY" : "BALANCE";
    if (update.kind !== expectedKind) {
      throw new DraftPositionUpdateError("O tipo de edição de uma das posições é inválido.");
    }

    const value = parseDecimal(update.value);
    if (!value || value.isNegative()) {
      throw new DraftPositionUpdateError(
        "Use apenas valores numéricos maiores ou iguais a zero.",
      );
    }

    if (value.decimalPlaces() > 12 || value.precision() > 30) {
      throw new DraftPositionUpdateError(
        "Um dos valores excede o limite de precisão permitido.",
      );
    }

    if (expectedKind === "QUANTITY" && !position.unitPriceBrl) {
      throw new DraftPositionUpdateError(
        "Uma posição cotada está sem preço e não pode ser recalculada.",
      );
    }

    parsedUpdates.push({ ...update, value });
  }

  try {
    await prisma.$transaction(async (transaction) => {
      for (const update of parsedUpdates) {
        const position = positions.get(update.positionId)!;

        if (update.kind === "BALANCE") {
          const balance = update.value.toDecimalPlaces(2);
          await transaction.position.update({
            where: { id: update.positionId },
            data: { quantity: balance, totalBrl: balance },
          });
          continue;
        }

        const totalBrl = update.value.mul(position.unitPriceBrl!).toDecimalPlaces(2);
        await transaction.position.update({
          where: { id: update.positionId },
          data: { quantity: update.value, totalBrl },
        });
      }
    });
  } catch (error) {
    if (error instanceof DraftPositionUpdateError) {
      throw error;
    }

    throw new DraftPositionUpdateError(
      "Não foi possível salvar as posições. Nenhuma alteração foi aplicada.",
    );
  }

  return { updatedPositions: parsedUpdates.length };
}

export class DraftPositionUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftPositionUpdateError";
  }
}

function parseDecimal(value: string) {
  const trimmed = value.trim().replace(/\s/g, "");
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }

  try {
    return new Prisma.Decimal(normalized);
  } catch {
    return null;
  }
}
