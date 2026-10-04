import { Prisma } from "@/generated/prisma/client";
import { cleanName, normalizeKey, USD_SYMBOL } from "@/modules/portfolio/domain/asset-kinds";
import { MAX_LIQUIDITY_LENGTH, normalizeLiquidity } from "@/modules/portfolio/domain/liquidity";
import { AUTOMATIC_FIXED_INCOME_ENABLED } from "@/modules/portfolio/domain/fixed-income-policy";
import { isAssetType } from "@/modules/portfolio/domain/classification";

// Atributos do ativo editados pelo formulário da posição (spec 043): nome
// (spec 040), liquidez (spec 039), vencimento (spec 026) e conta corrente
// (spec 059). São do ativo, não
// da competência, e valem para todos os meses.
//
// A chave do ativo leva o nome e, no fim, o vencimento:
// `market:<nome>:<TICKER>[:vencimento]` ou
// `private:<instituição>:<nome>[:vencimento]`. Ao editar, a chave acompanha o
// nome e o vencimento novos e não pode coincidir com a de outro ativo. Nada é
// inferido do nome: o vencimento é o que o usuário informa.

const DAY_SUFFIX = /:\d{4}-\d{2}-\d{2}$/;
export const MAX_ASSET_NAME_LENGTH = 80;

export class AssetAttributeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetAttributeError";
  }
}

export type AssetAttributes = {
  name: string;
  liquidity: string | null;
  /** AAAA-MM-DD */
  maturityDate: string | null;
  /**
   * Conta corrente (spec 059): só em ativos sem cotação de mercado (saldos em
   * reais e caixa em dólar). Ausente, fica como está.
   */
  cashAccount?: boolean;
  /**
   * Percentual do CDI da renda fixa pós-fixada (spec 060), como "105"; nulo
   * desliga. Ausente, fica como está.
   */
  cdiPercent?: string | null;
  /** Tipo do ativo (spec 068), uma das chaves de `ASSET_TYPES`. Ausente, fica como está. */
  assetType?: string;
};

/** Estado do ativo antes da edição, para o desfazer. */
export type AssetState = {
  id: string;
  name: string;
  normalizedKey: string;
  liquidity: string | null;
  maturityDate: Date | null;
  cashAccount: boolean;
  cdiPercent: Prisma.Decimal | null;
  assetType: string | null;
};

/**
 * Aplica nome, liquidez e vencimento ao ativo, na transação da edição da
 * posição. Devolve o estado anterior quando algo mudou, ou nulo.
 */
export async function applyAssetAttributes(
  transaction: Prisma.TransactionClient,
  assetId: string,
  next: AssetAttributes,
): Promise<AssetState | null> {
  const asset = await transaction.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      name: true,
      normalizedKey: true,
      liquidity: true,
      maturityDate: true,
      quoteSymbol: true,
      cashAccount: true,
      cdiPercent: true,
      assetType: true,
    },
  });

  if (!asset) {
    throw new AssetAttributeError("Ativo não encontrado.");
  }

  const name = cleanName(next.name);
  const normalizedName = normalizeKey(name);

  if (!normalizedName || name.length > MAX_ASSET_NAME_LENGTH) {
    throw new AssetAttributeError(`Informe um nome com até ${MAX_ASSET_NAME_LENGTH} caracteres.`);
  }

  const liquidity = normalizeLiquidity(next.liquidity);

  if (liquidity && liquidity.length > MAX_LIQUIDITY_LENGTH) {
    throw new AssetAttributeError(`A liquidez aceita até ${MAX_LIQUIDITY_LENGTH} caracteres.`);
  }

  const maturity = next.maturityDate;

  // Saldos em dólar, como o Time Deposit, aceitam vencimento (spec 040).
  const treasuryMaturity = asset.quoteSymbol?.startsWith("TD:") ? asset.quoteSymbol.slice(-10) : null;
  if (treasuryMaturity && maturity !== treasuryMaturity) {
    throw new AssetAttributeError("O vencimento do Tesouro é definido pelo título selecionado.");
  }
  if (maturity && asset.quoteSymbol && asset.quoteSymbol !== USD_SYMBOL && !treasuryMaturity) {
    throw new AssetAttributeError("Ativos cotados não têm vencimento.");
  }

  if (maturity && !isValidDay(maturity)) {
    throw new AssetAttributeError("Informe uma data de vencimento válida.");
  }

  const currentMaturity = asset.maturityDate ? asset.maturityDate.toISOString().slice(0, 10) : null;
  const cashAccount = next.cashAccount ?? asset.cashAccount;

  if (cashAccount && asset.quoteSymbol && asset.quoteSymbol !== USD_SYMBOL) {
    throw new AssetAttributeError("Só caixas em reais ou em dólar podem ser conta corrente.");
  }

  const cdiPercent = !AUTOMATIC_FIXED_INCOME_ENABLED || next.cdiPercent === undefined ? asset.cdiPercent : parseCdiPercent(next.cdiPercent);

  if (cdiPercent && asset.quoteSymbol) {
    throw new AssetAttributeError("Só a renda fixa sem cotação de mercado é calculada pelo CDI.");
  }

  const sameCdi = (asset.cdiPercent === null && cdiPercent === null) || Boolean(asset.cdiPercent && cdiPercent?.equals(asset.cdiPercent));

  if (next.assetType !== undefined && !isAssetType(next.assetType)) {
    throw new AssetAttributeError("Escolha um tipo de ativo da lista.");
  }

  const assetType = next.assetType ?? asset.assetType;

  if (
    asset.name === name &&
    asset.liquidity === liquidity &&
    currentMaturity === maturity &&
    asset.cashAccount === cashAccount &&
    sameCdi &&
    asset.assetType === assetType
  ) {
    return null;
  }

  const parts = asset.normalizedKey.replace(DAY_SUFFIX, "").split(":");
  const nameIndex = parts[0] === "private" ? 2 : 1;

  if (parts.length <= nameIndex) {
    throw new AssetAttributeError("Não foi possível identificar a chave deste ativo.");
  }

  parts[nameIndex] = normalizedName;
  const normalizedKey = `${parts.join(":")}${maturity ? `:${maturity}` : ""}`;

  if (normalizedKey !== asset.normalizedKey) {
    const twin = await transaction.asset.findFirst({ where: { normalizedKey }, select: { id: true } });

    if (twin && twin.id !== asset.id) {
      throw new AssetAttributeError(
        maturity ? "Já existe um ativo com este nome e este vencimento." : "Já existe um ativo com este nome.",
      );
    }
  }

  await transaction.asset.update({
    where: { id: asset.id },
    data: {
      name,
      normalizedKey,
      liquidity,
      maturityDate: maturity ? new Date(`${maturity}T00:00:00.000Z`) : null,
      cashAccount,
      cdiPercent,
      assetType,
    },
  });

  return {
    id: asset.id,
    name: asset.name,
    normalizedKey: asset.normalizedKey,
    liquidity: asset.liquidity,
    maturityDate: asset.maturityDate,
    cashAccount: asset.cashAccount,
    cdiPercent: asset.cdiPercent,
    assetType: asset.assetType,
  };
}

/** Volta o ativo ao estado de antes da edição, se a chave antiga ainda estiver livre. */
export async function restoreAssetState(transaction: Prisma.TransactionClient, state: AssetState) {
  const twin = await transaction.asset.findFirst({ where: { normalizedKey: state.normalizedKey }, select: { id: true } });

  if (twin && twin.id !== state.id) {
    throw new AssetAttributeError("Outro ativo passou a usar o nome anterior; o desfazer não é possível.");
  }

  await transaction.asset.updateMany({
    where: { id: state.id },
    data: {
      name: state.name,
      normalizedKey: state.normalizedKey,
      liquidity: state.liquidity,
      maturityDate: state.maturityDate,
      cashAccount: state.cashAccount,
      cdiPercent: state.cdiPercent,
      assetType: state.assetType,
    },
  });
}

function isValidDay(day: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    day >= "2000-01-01" &&
    day <= "2100-12-31" &&
    !Number.isNaN(Date.parse(`${day}T00:00:00Z`))
  );
}

/** Percentual do CDI: maior que zero, até 1.000%, com até três casas (spec 060). */
export function parseCdiPercent(raw: string | null) {
  if (raw === null || raw.trim() === "") {
    return null;
  }

  const normalized = raw.trim().replace(/\s/g, "").replace("%", "");
  const text = normalized.includes(",") ? normalized.replace(/\./g, "").replace(",", ".") : normalized;

  if (!/^\d+(?:\.\d+)?$/.test(text)) {
    throw new AssetAttributeError("Informe o percentual do CDI, como 105 para 105% do CDI.");
  }

  const value = new Prisma.Decimal(text);

  if (!value.greaterThan(0) || value.greaterThan(1000) || value.decimalPlaces() > 3) {
    throw new AssetAttributeError("Use um percentual do CDI maior que zero e até 1.000%, com até três casas.");
  }

  return value;
}
