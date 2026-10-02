import type { EditingCatalog } from "@/modules/portfolio/application/get-editing-catalog";
import type { MonthPosition, MonthPositions } from "@/modules/portfolio/application/get-month-positions";
import type { AllocationSeed, AssetKind } from "@/modules/portfolio/domain/asset-kinds";
import { parseLocaleNumber } from "@/modules/portfolio/presentation/portfolio-format";

export type PendingEdit = { value?: string; strategy?: string | null };

/**
 * Conta nova digitada na inclusão (spec 026), numa instituição existente
 * (`institutionId`) ou também nova. `key` identifica o cadastro pendente para
 * que outra posição nova possa escolhê-lo antes de salvar.
 */
export type NewAccountDraft = {
  key: string;
  institutionId: string | null;
  institutionName: string;
  name: string;
};

export type NewAssetDraft = {
  key: string;
  name: string;
  kind: AssetKind;
  /** Símbolo de cotação já normalizado, como GPCA11.SAO; nulo sem ticker. */
  ticker: string | null;
  baseCurrency: string;
  maturityDate: string | null;
  allocation: AllocationSeed;
  quoteCheckToken: string | null;
  manualPriceBrl: string | null;
  /** Cotação mostrada na prévia: a conferida, a digitada ou a do mês. */
  priceBrl: number | null;
};

export type NewPositionDraft = {
  accountId: string | null;
  newAccount: NewAccountDraft | null;
  assetId: string | null;
  newAsset: NewAssetDraft | null;
  value: string;
  strategy: string | null;
};

export type AddedDraft = NewPositionDraft & { tempId: string };

/** Identidade de conta e ativo de uma posição nova, para recusar repetidas. */
export function draftAccountId(draft: Pick<NewPositionDraft, "accountId" | "newAccount">) {
  return draft.accountId ?? `nova:${draft.newAccount?.key ?? ""}`;
}

export function draftAssetId(draft: Pick<NewPositionDraft, "assetId" | "newAsset">) {
  return draft.assetId ?? `novo:${draft.newAsset?.key ?? ""}`;
}

export type DisplayPosition = MonthPosition & {
  isAdded: boolean;
  isRemoved: boolean;
  valueChanged: boolean;
  strategyChanged: boolean;
};

export function isQuoted(position: Pick<MonthPosition, "quoteSymbol">) {
  return Boolean(position.quoteSymbol);
}

export function editableValueText(position: MonthPosition) {
  return isQuoted(position) ? position.quantityText : position.totalBrl.toFixed(2);
}

export function sameValue(position: MonthPosition, text: string) {
  const parsed = parseLocaleNumber(text);
  const original = isQuoted(position) ? position.quantity : position.totalBrl;
  return parsed !== null && Math.abs(parsed - original) < 1e-12;
}

export function countChanges(
  pending: Record<string, PendingEdit>,
  removed: string[],
  added: AddedDraft[],
) {
  return (
    Object.keys(pending).filter((id) => !removed.includes(id)).length + removed.length + added.length
  );
}

export function buildDisplayPositions({
  month,
  catalog,
  pending,
  removed,
  added,
}: {
  month: MonthPositions;
  catalog: EditingCatalog;
  pending: Record<string, PendingEdit>;
  removed: string[];
  added: AddedDraft[];
}): DisplayPosition[] {
  const quoteBySymbol = new Map(month.quotes.map((quote) => [quote.symbol, quote.valueBrl]));

  const persisted = month.positions.map((position): DisplayPosition => {
    const edit = pending[position.id];
    const draftValue = edit?.value !== undefined ? parseLocaleNumber(edit.value) : null;
    let quantity = position.quantity;
    let quantityText = position.quantityText;
    let totalBrl = position.totalBrl;

    if (draftValue !== null && edit?.value !== undefined) {
      quantityText = edit.value;
      if (isQuoted(position)) {
        quantity = draftValue;
        totalBrl = round2(draftValue * (position.unitPriceBrl ?? 0));
      } else {
        quantity = round2(draftValue);
        totalBrl = quantity;
      }
    }

    return {
      ...position,
      quantity,
      quantityText,
      totalBrl,
      strategy: edit?.strategy !== undefined ? edit.strategy : position.strategy,
      isAdded: false,
      isRemoved: removed.includes(position.id),
      valueChanged: edit?.value !== undefined,
      strategyChanged: edit?.strategy !== undefined,
    };
  });

  const drafts = added.flatMap((draft): DisplayPosition[] => {
    const catalogAccount = draft.accountId ? catalog.accounts.find((entry) => entry.id === draft.accountId) : null;
    const account = catalogAccount
      ? { institutionName: catalogAccount.label.split(" · ")[0], name: catalogAccount.name }
      : draft.newAccount
        ? { institutionName: draft.newAccount.institutionName, name: draft.newAccount.name }
        : null;
    const catalogAsset = draft.assetId ? catalog.assets.find((entry) => entry.id === draft.assetId) : null;
    const asset = catalogAsset
      ? { ...catalogAsset, ownPrice: null, allocation: null }
      : draft.newAsset
        ? {
            name: draft.newAsset.name,
            ticker: draft.newAsset.ticker,
            quoteSymbol: draft.newAsset.ticker,
            baseCurrency: draft.newAsset.baseCurrency,
            maturityDate: draft.newAsset.maturityDate,
            ownPrice: draft.newAsset.priceBrl,
            allocation: draft.newAsset.allocation,
          }
        : null;
    const value = parseLocaleNumber(draft.value) ?? 0;

    if (!asset || !account) {
      return [];
    }

    const price = asset.quoteSymbol ? (quoteBySymbol.get(asset.quoteSymbol) ?? asset.ownPrice) : null;
    const totalBrl = asset.quoteSymbol ? round2(value * (price ?? 0)) : round2(value);

    return [
      {
        id: draft.tempId,
        accountId: draftAccountId(draft),
        assetId: draftAssetId(draft),
        assetName: asset.name,
        ticker: asset.ticker,
        quoteSymbol: asset.quoteSymbol,
        institutionName: account.institutionName,
        accountName: account.name,
        strategy: draft.strategy,
        baseCurrency: asset.baseCurrency,
        maturityDate: asset.maturityDate,
        quantity: asset.quoteSymbol ? value : totalBrl,
        quantityText: draft.value,
        unitPriceBrl: price,
        totalBrl,
        totalUsd: null,
        share: 0,
        // O ativo novo já tem o rateio escolhido; o existente herda ao salvar.
        allocations: asset.allocation ? [{ ...asset.allocation, weight: 100 }] : [],
        isAdded: true,
        isRemoved: false,
        valueChanged: true,
        strategyChanged: true,
      },
    ];
  });

  const all = [...persisted, ...drafts];
  const total = all.reduce((sum, position) => sum + (position.isRemoved ? 0 : position.totalBrl), 0);

  return all.map((position) => ({
    ...position,
    totalUsd: month.usdRate ? position.totalBrl / month.usdRate : null,
    share: total === 0 || position.isRemoved ? 0 : (position.totalBrl / total) * 100,
  }));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
