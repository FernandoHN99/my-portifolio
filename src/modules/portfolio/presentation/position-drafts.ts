import type { EditingCatalog } from "@/modules/portfolio/application/get-editing-catalog";
import type { MonthPosition, MonthPositions } from "@/modules/portfolio/application/get-month-positions";
import { parseLocaleNumber } from "@/modules/portfolio/presentation/portfolio-format";

export type PendingEdit = { value?: string; strategy?: string | null };

export type AddedDraft = {
  tempId: string;
  accountId: string;
  assetId: string;
  value: string;
  strategy: string | null;
};

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
    const asset = catalog.assets.find((entry) => entry.id === draft.assetId);
    const account = catalog.accounts.find((entry) => entry.id === draft.accountId);
    const value = parseLocaleNumber(draft.value) ?? 0;

    if (!asset || !account) {
      return [];
    }

    const price = asset.quoteSymbol ? (quoteBySymbol.get(asset.quoteSymbol) ?? null) : null;
    const [institutionName, accountName] = account.label.split(" · ");
    const totalBrl = asset.quoteSymbol ? round2(value * (price ?? 0)) : round2(value);

    return [
      {
        id: draft.tempId,
        accountId: draft.accountId,
        assetId: draft.assetId,
        assetName: asset.name,
        ticker: asset.ticker,
        quoteSymbol: asset.quoteSymbol,
        institutionName,
        accountName: accountName ?? "",
        strategy: draft.strategy,
        baseCurrency: asset.baseCurrency,
        quantity: asset.quoteSymbol ? value : totalBrl,
        quantityText: draft.value,
        unitPriceBrl: price,
        totalBrl,
        totalUsd: null,
        share: 0,
        allocations: [],
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
