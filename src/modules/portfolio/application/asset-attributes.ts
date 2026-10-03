import { getPrismaClient } from "@/lib/prisma";
import { MonthEditError } from "@/modules/portfolio/application/month-editing";
import { cleanName, normalizeKey } from "@/modules/portfolio/domain/asset-kinds";
import { MAX_LIQUIDITY_LENGTH, normalizeLiquidity } from "@/modules/portfolio/domain/liquidity";

// Atributos do ativo editados pela página da posição: vencimento (spec 016),
// liquidez (spec 039) e nome (spec 040).
//
// Vencimento: é do ativo, não da competência, e só existe em ativos sem cotação
// de mercado (spec 026). Nada é inferido do nome: o usuário informa.
//
// A chave do ativo leva o vencimento no fim, para dois títulos de mesmo nome e
// prazos diferentes serem ativos distintos; ao editar, a chave acompanha o
// novo vencimento e não pode coincidir com a de outro ativo.

const DAY_SUFFIX = /:\d{4}-\d{2}-\d{2}$/;

export async function updateAssetMaturity({ assetId, maturityDate }: { assetId: string; maturityDate: string | null }) {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new MonthEditError("Banco de dados indisponível.");
  }

  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { normalizedKey: true, quoteSymbol: true },
  });

  if (!asset) {
    throw new MonthEditError("Ativo não encontrado.");
  }

  if (asset.quoteSymbol) {
    throw new MonthEditError("Ativos cotados não têm vencimento.");
  }

  const base = asset.normalizedKey.replace(DAY_SUFFIX, "");
  const normalizedKey = maturityDate ? `${base}:${maturityDate}` : base;
  const twin = await prisma.asset.findUnique({ where: { normalizedKey }, select: { id: true } });

  if (twin && twin.id !== assetId) {
    throw new MonthEditError(
      maturityDate
        ? "Já existe um ativo com este nome e este vencimento."
        : "Já existe um ativo com este nome sem vencimento.",
    );
  }

  await prisma.asset.update({
    where: { id: assetId },
    data: { normalizedKey, maturityDate: maturityDate ? new Date(`${maturityDate}T00:00:00.000Z`) : null },
  });
}

/**
 * Prazo de liquidez do ativo (spec 039), opcional e de qualquer tipo de ativo.
 * Vale para todas as competências.
 */
export async function updateAssetLiquidity({ assetId, liquidity }: { assetId: string; liquidity: string | null }) {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new MonthEditError("Banco de dados indisponível.");
  }

  const value = normalizeLiquidity(liquidity);

  if (value && value.length > MAX_LIQUIDITY_LENGTH) {
    throw new MonthEditError(`A liquidez aceita até ${MAX_LIQUIDITY_LENGTH} caracteres.`);
  }

  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { id: true } });

  if (!asset) {
    throw new MonthEditError("Ativo não encontrado.");
  }

  await prisma.asset.update({ where: { id: assetId }, data: { liquidity: value } });
}

const MAX_ASSET_NAME_LENGTH = 80;

/**
 * Nome do ativo (spec 040). A chave acompanha o nome novo, mantendo o resto:
 * `market:<nome>:<TICKER>[:vencimento]` ou
 * `private:<instituição>:<nome>[:vencimento]`; não pode coincidir com a de
 * outro ativo.
 */
export async function updateAssetName({ assetId, name }: { assetId: string; name: string }) {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new MonthEditError("Banco de dados indisponível.");
  }

  const clean = cleanName(name);
  const normalized = normalizeKey(clean);

  if (!normalized || clean.length > MAX_ASSET_NAME_LENGTH) {
    throw new MonthEditError(`Informe um nome com até ${MAX_ASSET_NAME_LENGTH} caracteres.`);
  }

  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { normalizedKey: true } });

  if (!asset) {
    throw new MonthEditError("Ativo não encontrado.");
  }

  const parts = asset.normalizedKey.split(":");
  const nameIndex = parts[0] === "private" ? 2 : 1;

  if (parts.length <= nameIndex) {
    throw new MonthEditError("Não foi possível identificar a chave deste ativo.");
  }

  parts[nameIndex] = normalized;
  const normalizedKey = parts.join(":");
  const twin = await prisma.asset.findUnique({ where: { normalizedKey }, select: { id: true } });

  if (twin && twin.id !== assetId) {
    throw new MonthEditError("Já existe um ativo com este nome.");
  }

  await prisma.asset.update({ where: { id: assetId }, data: { name: clean, normalizedKey } });
}
