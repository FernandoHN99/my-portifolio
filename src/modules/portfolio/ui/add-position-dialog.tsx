"use client";

import { Dialog } from "@base-ui/react/dialog";
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState, type ReactNode, type RefObject } from "react";

import { Picker, type PickerOption } from "@/components/ui/picker";
import { cn } from "@/lib/utils";
import type { EditingCatalog } from "@/modules/portfolio/application/get-editing-catalog";
import type { MonthQuote } from "@/modules/portfolio/application/get-month-positions";
import {
  ASSET_KIND_DEFINITIONS,
  ASSET_KINDS,
  baseCurrencyOf,
  buildAssetKey,
  cleanName,
  defaultAllocation,
  duplicateAssetMessage,
  normalizeKey,
  normalizeTicker,
  tickerHint,
  USD_SYMBOL,
  type AllocationSeed,
  type AssetKind,
} from "@/modules/portfolio/domain/asset-kinds";
import { maturityHint } from "@/modules/portfolio/presentation/maturity";
import { formatBrl, formatPriceBrl, parseLocaleNumber } from "@/modules/portfolio/presentation/portfolio-format";
import {
  draftAccountId,
  draftAssetId,
  type AddedDraft,
  type NewAccountDraft,
  type NewAssetDraft,
  type NewPositionDraft,
} from "@/modules/portfolio/presentation/position-drafts";
import {
  AllocationPicker,
  backdropClass,
  centeredPopupClass,
  Field,
  inputClass,
  primaryButtonClass,
  RedemptionPicker,
  secondaryButtonClass,
} from "@/modules/portfolio/ui/edit-dialogs";
import { providerLabel } from "@/modules/quotes/domain/quote-refresh";
import {
  tickerCheckAllowsSaving,
  type CoinCandidate,
  type TickerCheckResponse,
} from "@/modules/quotes/domain/ticker-check";

export type AddPositionMonth = { id: string; label: string; isCurrent: boolean; quotes: MonthQuote[] };

// Valores das opções que ainda não existem no banco: instituições e contas
// novas usam "nova:<chave>" e ativos novos "novo:<chave>". O ativo digitado
// neste diálogo usa uma chave fixa até ser incluído.
const NEW_INSTITUTION = "nova:";
const NEW_ACCOUNT = "nova:";
const NEW_ASSET = "novo:";
const FORM_ASSET = "novo:\u0000este";
const DEFAULT_ACCOUNT_NAME = "Principal";
const CHECK_DEBOUNCE_MS = 500;

/**
 * Inclusão de posição (specs 017 e 026). Instituição, conta e ativo aceitam
 * valores digitados: os novos são criados ao salvar, na mesma transação da
 * posição. Um ativo novo pede o tipo, que decide o ticker, o provedor que o
 * confere, a moeda base e o rateio inicial.
 */
export function AddPositionDialog({
  open,
  onOpenChange,
  catalog,
  month,
  drafts,
  occupied,
  onAdd,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: EditingCatalog;
  month: AddPositionMonth;
  drafts: AddedDraft[];
  occupied: Set<string>;
  onAdd: (draft: NewPositionDraft) => void;
  /**
   * Para onde o foco volta ao fechar. O diálogo abre sem gatilho próprio, às
   * vezes depois da confirmação de histórico, cujo botão some ao entrar em
   * edição.
   */
  finalFocus?: RefObject<HTMLElement | null>;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup
          finalFocus={finalFocus}
          className={cn(
            centeredPopupClass,
            "max-h-[calc(100dvh-2rem)] w-[min(520px,calc(100vw-2rem))] overflow-y-auto overscroll-contain",
          )}
        >
          <AddPositionForm
            catalog={catalog}
            month={month}
            drafts={drafts}
            occupied={occupied}
            onAdd={(draft) => {
              onAdd(draft);
              onOpenChange(false);
            }}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type NamedEntry = { key: string; name: string };
type AccountEntry = NamedEntry & { institutionRef: string };

function AddPositionForm({
  catalog,
  month,
  drafts,
  occupied,
  onAdd,
}: {
  catalog: EditingCatalog;
  month: AddPositionMonth;
  drafts: AddedDraft[];
  occupied: Set<string>;
  onAdd: (draft: NewPositionDraft) => void;
}) {
  const [institutionValue, setInstitutionValue] = useState<string | null>(null);
  const [createdInstitution, setCreatedInstitution] = useState<NamedEntry | null>(null);
  const [accountValue, setAccountValue] = useState<string | null>(null);
  const [createdAccount, setCreatedAccount] = useState<AccountEntry | null>(null);
  const [assetValue, setAssetValue] = useState<string | null>(null);
  const [newAssetName, setNewAssetName] = useState<string | null>(null);
  const [kind, setKind] = useState<AssetKind | null>(null);
  const [tickerText, setTickerText] = useState("");
  const [maturity, setMaturity] = useState("");
  const [allocationDraft, setAllocationDraft] = useState<AllocationSeed | null>(null);
  const [manualPrice, setManualPrice] = useState("");
  // Moeda da CoinGecko escolhida para um símbolo e as candidatas da última
  // conferência (spec 033); valem só enquanto o ticker não muda.
  const [coinChoice, setCoinChoice] = useState<{ symbol: string; id: string } | null>(null);
  const [coinCandidates, setCoinCandidates] = useState<{ symbol: string; coins: CoinCandidate[] } | null>(null);
  const [value, setValue] = useState("");
  const [strategy, setStrategy] = useState("");

  const quoteOf = (symbol: string) => month.quotes.find((entry) => entry.symbol === symbol)?.valueBrl ?? null;

  // Instituições e contas novas de outras posições ainda não salvas também
  // aparecem, para que duas posições possam usar o mesmo cadastro novo.
  const newInstitutions = uniqueByKey([
    ...drafts.flatMap((draft) =>
      draft.newAccount && draft.newAccount.institutionId === null
        ? [{ key: normalizeKey(draft.newAccount.institutionName), name: draft.newAccount.institutionName }]
        : [],
    ),
    ...(createdInstitution ? [createdInstitution] : []),
  ]);
  const institutionOptions: PickerOption[] = [
    ...catalog.institutions.map((institution) => ({ value: institution.id, label: institution.name })),
    ...newInstitutions.map((institution) => ({
      value: `${NEW_INSTITUTION}${institution.key}`,
      label: institution.name,
      hint: "nova",
    })),
  ];

  const institutionNameOf = (institutionRef: string | null) =>
    institutionRef === null
      ? null
      : institutionRef.startsWith(NEW_INSTITUTION)
        ? (newInstitutions.find((entry) => `${NEW_INSTITUTION}${entry.key}` === institutionRef)?.name ?? null)
        : (catalog.institutions.find((entry) => entry.id === institutionRef)?.name ?? null);
  const institutionName = institutionNameOf(institutionValue);

  const accountsOf = (institutionRef: string | null) => {
    if (!institutionRef) {
      return { existing: [], pending: [] as AccountEntry[] };
    }

    const existing = institutionRef.startsWith(NEW_INSTITUTION)
      ? []
      : catalog.accounts.filter((account) => account.institutionId === institutionRef);
    const pending = uniqueByKey([
      ...drafts.flatMap((draft): AccountEntry[] =>
        draft.newAccount && institutionRefOf(draft.newAccount) === institutionRef
          ? [{ key: draft.newAccount.key, name: draft.newAccount.name, institutionRef }]
          : [],
      ),
      ...(createdAccount?.institutionRef === institutionRef ? [createdAccount] : []),
    ]);

    return { existing, pending };
  };
  const accounts = accountsOf(institutionValue);
  const accountOptions: PickerOption[] = [
    ...accounts.existing.map((account) => ({ value: account.id, label: account.name })),
    ...accounts.pending.map((account) => ({ value: `${NEW_ACCOUNT}${account.key}`, label: account.name, hint: "nova" })),
  ];

  // Ativos novos de outras posições ainda não salvas. Um ativo sem ticker é da
  // instituição em que foi criado, como na importação, e só aparece nela; com
  // ticker, vale em qualquer instituição.
  const pendingAssets = uniqueByKey(drafts.flatMap((draft) => (draft.newAsset ? [draft.newAsset] : [])));
  const pendingAssetsAt = (name: string | null) =>
    pendingAssets.filter((asset) => pendingAssetKeyAt(asset, name) === asset.key);
  const availablePendingAssets = pendingAssetsAt(institutionName);
  const assetOptions: PickerOption[] = [
    ...catalog.assets.map((asset) => ({
      value: asset.id,
      label: asset.name,
      hint: asset.ticker ?? (asset.maturityDate ? maturityHint(asset.maturityDate) : undefined),
    })),
    ...availablePendingAssets.map((asset) => ({
      value: `${NEW_ASSET}${asset.key}`,
      label: asset.name,
      hint: asset.maturityDate ? `novo · ${maturityHint(asset.maturityDate)}` : "novo",
    })),
    ...(newAssetName ? [{ value: FORM_ASSET, label: newAssetName, hint: "novo" }] : []),
  ];
  const strategyOptions: PickerOption[] = [
    { value: "", label: "Sem estratégia" },
    ...catalog.strategies.map((entry) => ({ value: entry, label: entry })),
  ];

  const selectInstitution = (next: string, name = institutionNameOf(next)) => {
    if (next === institutionValue) {
      return;
    }

    setInstitutionValue(next);

    // Um ativo novo sem ticker de outra posição pertence à instituição dela.
    if (
      assetValue?.startsWith(NEW_ASSET) &&
      assetValue !== FORM_ASSET &&
      !pendingAssetsAt(name).some((asset) => `${NEW_ASSET}${asset.key}` === assetValue)
    ) {
      setAssetValue(null);
    }

    const { existing, pending } = accountsOf(next);

    if (existing.length + pending.length === 1) {
      setAccountValue(existing[0]?.id ?? `${NEW_ACCOUNT}${pending[0].key}`);
    } else if (existing.length + pending.length === 0) {
      // Instituição nova começa com a conta "Principal", como as importadas.
      const account = { key: accountKey(next, DEFAULT_ACCOUNT_NAME), name: DEFAULT_ACCOUNT_NAME, institutionRef: next };
      setCreatedAccount(account);
      setAccountValue(`${NEW_ACCOUNT}${account.key}`);
    } else {
      setAccountValue(null);
    }
  };

  const createInstitution = (text: string) => {
    const name = cleanName(text);
    const key = normalizeKey(name);

    if (!key) {
      return;
    }

    // Um nome igual sem acentos, maiúsculas ou pontuação é a mesma instituição.
    const existing = catalog.institutions.find((institution) => normalizeKey(institution.name) === key);
    if (existing) {
      selectInstitution(existing.id);
      return;
    }

    if (!newInstitutions.some((institution) => institution.key === key)) {
      setCreatedInstitution({ key, name });
    }
    selectInstitution(`${NEW_INSTITUTION}${key}`, name);
  };

  const createAccount = (text: string) => {
    const name = cleanName(text);

    if (!institutionValue || !normalizeKey(name)) {
      return;
    }

    const existing = accounts.existing.find((account) => normalizeKey(account.name) === normalizeKey(name));
    if (existing) {
      setAccountValue(existing.id);
      return;
    }

    const key = accountKey(institutionValue, name);
    if (!accounts.pending.some((account) => account.key === key)) {
      setCreatedAccount({ key, name, institutionRef: institutionValue });
    }
    setAccountValue(`${NEW_ACCOUNT}${key}`);
  };

  const createAsset = (text: string) => {
    const name = cleanName(text);

    if (!normalizeKey(name)) {
      return;
    }

    setNewAssetName(name);
    setAssetValue(FORM_ASSET);
  };

  const chooseKind = (next: string) => {
    setKind(next as AssetKind);
    setAllocationDraft(null);
    setManualPrice("");

    if (!ASSET_KIND_DEFINITIONS[next as AssetKind].allowsMaturity) {
      setMaturity("");
    }
  };

  // Conta escolhida, existente ou nova.
  const accountRef = resolveAccount(accountValue, institutionValue, catalog, newInstitutions, accounts.pending);

  // Ativo escolhido: existente, novo de outra posição pendente ou digitado aqui.
  const catalogAsset = assetValue ? catalog.assets.find((asset) => asset.id === assetValue) : undefined;
  const pendingAsset = assetValue?.startsWith(NEW_ASSET)
    ? availablePendingAssets.find((asset) => `${NEW_ASSET}${asset.key}` === assetValue)
    : undefined;
  const isFormAsset = assetValue === FORM_ASSET && newAssetName !== null;
  const definition = isFormAsset && kind ? ASSET_KIND_DEFINITIONS[kind] : null;
  const symbol =
    definition?.ticker === "usd"
      ? USD_SYMBOL
      : definition?.ticker === "market" && kind
        ? normalizeTicker(kind, tickerText)
        : null;
  const chosenCoinId = kind === "crypto" && symbol && coinChoice?.symbol === symbol ? coinChoice.id : null;
  const check = useTickerCheck(month.id, definition?.ticker === "market" ? kind : null, symbol, chosenCoinId);
  const checkedCoins = check.state === "done" && check.response.status === "found" ? check.response.coins : undefined;

  if (symbol && checkedCoins && coinCandidates?.symbol !== symbol) {
    setCoinCandidates({ symbol, coins: checkedCoins });
  }

  const coins = kind === "crypto" && symbol && coinCandidates?.symbol === symbol ? coinCandidates.coins : null;
  const checkedCoinId =
    check.state === "done" && check.response.status === "found" ? (check.response.coinId ?? null) : null;
  const allocation = allocationDraft ?? (kind ? defaultAllocation(kind, symbol) : null);
  const maturityDate = definition?.allowsMaturity && maturity ? maturity : null;

  // Identidade do ativo novo, a mesma que o servidor calcula: um ativo igual,
  // existente ou de outra posição pendente, bloqueia a inclusão aqui em vez de
  // recusar o salvamento inteiro depois.
  const assetKey =
    isFormAsset && definition && (definition.ticker === null ? institutionName : symbol)
      ? buildAssetKey({
          name: newAssetName,
          ticker: symbol,
          institutionName: institutionName ?? "",
          maturityDate,
        })
      : null;
  const existingTwin = assetKey ? catalog.assets.find((asset) => asset.normalizedKey === assetKey) : undefined;
  const twin = existingTwin ?? (assetKey ? pendingAssets.find((asset) => asset.key === assetKey) : undefined);
  const twinWarning =
    kind && twin
      ? duplicateAssetMessage({ name: twin.name, kind, symbol, maturityDate, pending: !existingTwin })
      : null;

  const response = check.state === "done" ? check.response : null;
  const needsManualPrice =
    definition?.ticker === "market" &&
    (response?.status === "unavailable" || (response?.status === "found" && !month.isCurrent));
  const manualPriceValue = parseLocaleNumber(manualPrice);

  let price: number | null = null;
  let assetReady = false;
  let quoted = false;
  let missingQuoteSymbol: string | null = null;

  if (catalogAsset) {
    quoted = Boolean(catalogAsset.quoteSymbol);
    price = catalogAsset.quoteSymbol ? quoteOf(catalogAsset.quoteSymbol) : null;
    missingQuoteSymbol = catalogAsset.quoteSymbol && !price ? catalogAsset.quoteSymbol : null;
    assetReady = !missingQuoteSymbol;
  } else if (pendingAsset) {
    quoted = Boolean(pendingAsset.ticker);
    price = pendingAsset.ticker ? (quoteOf(pendingAsset.ticker) ?? pendingAsset.priceBrl) : null;
    assetReady = true;
  } else if (isFormAsset && definition && allocation) {
    quoted = definition.ticker !== null;
    const allocationComplete = Boolean(
      allocation.assetClass.trim() && allocation.subclass.trim() && allocation.duration.trim(),
    );

    if (definition.ticker === "usd") {
      price = quoteOf(USD_SYMBOL);
      missingQuoteSymbol = price ? null : USD_SYMBOL;
    } else if (definition.ticker === "market" && tickerCheckAllowsSaving(response)) {
      if (response.status === "known") {
        price = response.priceBrl;
      } else if (response.status === "found" && month.isCurrent) {
        price = response.priceBrl;
      } else if (needsManualPrice) {
        price = manualPriceValue !== null && manualPriceValue > 0 ? manualPriceValue : null;
      }
    }

    const priceReady = definition.ticker === null || price !== null;
    assetReady = allocationComplete && priceReady && !missingQuoteSymbol && assetKey !== null && !twinWarning;
  }

  const parsedValue = parseLocaleNumber(value);
  const validValue = parsedValue !== null;
  // Um ativo digitado aqui é novo e ainda não pode ter posição nesta conta.
  const assetIdentity = catalogAsset
    ? catalogAsset.id
    : pendingAsset
      ? draftAssetId({ assetId: null, newAsset: pendingAsset })
      : null;
  const duplicate =
    accountRef !== null && assetIdentity !== null && occupied.has(`${draftAccountId(accountRef)}:${assetIdentity}`);
  const canAdd = Boolean(accountRef) && assetReady && validValue && !duplicate;
  // Um ativo cotado pelo USD, novo ou existente, guarda o saldo em dólares.
  const selectedQuoteSymbol = catalogAsset?.quoteSymbol ?? pendingAsset?.ticker ?? symbol;
  const valueLabel = !assetValue
    ? "Quantidade ou saldo"
    : selectedQuoteSymbol === USD_SYMBOL
      ? "Saldo (US$)"
      : quoted
        ? "Quantidade"
        : "Saldo (R$)";

  const submit = () => {
    if (!canAdd || !accountRef) {
      return;
    }

    let newAsset: NewAssetDraft | null = null;

    if (isFormAsset && kind && allocation && newAssetName && assetKey) {
      newAsset = {
        key: assetKey,
        name: newAssetName,
        kind,
        ticker: symbol,
        baseCurrency: baseCurrencyOf(kind, symbol),
        maturityDate,
        allocation: {
          assetClass: allocation.assetClass.trim(),
          subclass: allocation.subclass.trim(),
          duration: allocation.duration.trim(),
        },
        quoteCheckToken:
          response?.status === "found" || response?.status === "unavailable" ? response.token : null,
        manualPriceBrl: needsManualPrice ? manualPrice.trim() : null,
        priceBrl: price,
      };
    }

    onAdd({
      ...accountRef,
      assetId: catalogAsset?.id ?? null,
      newAsset: newAsset ?? pendingAsset ?? null,
      value: value.trim(),
      strategy: strategy || null,
    });
  };

  return (
    <>
      <Dialog.Title className="text-base font-semibold tracking-[-0.02em]">Adicionar posição</Dialog.Title>
      <Dialog.Description className="mt-1 text-xs leading-5 text-muted-foreground">
        Escolha ou digite instituição, conta e ativo; os novos são criados ao salvar. Um ativo existente copia o
        rateio da posição mais recente dele.
      </Dialog.Description>

      <div className="mt-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Instituição">
            <Picker
              aria-label="Instituição"
              options={institutionOptions}
              value={institutionValue}
              onValueChange={selectInstitution}
              onCreate={createInstitution}
              placeholder="Selecione ou digite"
              emptyMessage="Digite para criar uma instituição"
            />
          </Field>
          <Field label="Conta">
            <Picker
              aria-label="Conta"
              options={accountOptions}
              value={accountValue}
              onValueChange={setAccountValue}
              onCreate={createAccount}
              disabled={!institutionValue}
              placeholder={institutionValue ? "Selecione ou digite" : "Escolha a instituição"}
              emptyMessage="Digite para criar uma conta"
            />
          </Field>
        </div>

        <Field label="Ativo">
          <Picker
            aria-label="Ativo"
            options={assetOptions}
            value={assetValue}
            onValueChange={setAssetValue}
            onCreate={createAsset}
            createOnMatch
            placeholder="Selecione ou digite um ativo novo"
            emptyMessage="Nenhum ativo encontrado"
          />
        </Field>

        {isFormAsset ? (
          <section
            aria-label="Novo ativo"
            className="space-y-3 rounded-xl border border-primary/25 bg-primary/[0.03] p-3"
          >
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Novo ativo
              </span>
              <span className="min-w-0 truncate text-xs text-foreground/85">{newAssetName}</span>
            </div>

            <div className={cn("grid gap-3", definition?.ticker === "market" ? "grid-cols-2" : "grid-cols-1")}>
              <Field label="Tipo">
                <Picker
                  aria-label="Tipo do ativo"
                  options={ASSET_KINDS.map((entry) => ({
                    value: entry,
                    label: ASSET_KIND_DEFINITIONS[entry].label,
                    hint: ASSET_KIND_DEFINITIONS[entry].hint,
                  }))}
                  value={kind}
                  onValueChange={chooseKind}
                  placeholder="Escolha o tipo"
                />
              </Field>
              {definition?.ticker === "market" && kind ? (
                <Field label="Ticker">
                  <input
                    aria-label="Ticker"
                    value={tickerText}
                    onChange={(event) => setTickerText(event.target.value.toUpperCase())}
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={kind === "crypto" ? "ETH" : kind.startsWith("br") ? "GPCA11" : "VOO"}
                    className={cn(inputClass, "font-mono uppercase")}
                  />
                </Field>
              ) : null}
            </div>

            {definition?.ticker === "market" && kind ? (
              <TickerStatus
                kind={kind}
                text={tickerText}
                symbol={symbol}
                check={check}
                monthLabel={month.label}
                isCurrent={month.isCurrent}
              />
            ) : null}

            {coins && coins.length > 1 && symbol ? (
              <Field label={`Moeda · ${coins.length} com o símbolo ${symbol}`}>
                <Picker
                  aria-label="Moeda na CoinGecko"
                  options={coins.map((coin) => ({ value: coin.id, label: coin.name, hint: coin.id }))}
                  value={chosenCoinId ?? checkedCoinId ?? coins[0].id}
                  onValueChange={(id) => setCoinChoice({ symbol, id })}
                />
              </Field>
            ) : null}

            {needsManualPrice ? (
              <Field label="Cotação em R$">
                <input
                  aria-label="Cotação em R$"
                  inputMode="decimal"
                  value={manualPrice}
                  onChange={(event) => setManualPrice(event.target.value)}
                  placeholder="0,00"
                  className={cn(
                    inputClass,
                    "text-right font-mono",
                    manualPrice.trim() !== "" && (manualPriceValue === null || manualPriceValue <= 0) && "border-destructive",
                  )}
                />
              </Field>
            ) : null}

            {definition?.allowsMaturity ? (
              <Field label="Vencimento (opcional)">
                <input
                  type="date"
                  aria-label="Vencimento"
                  value={maturity}
                  min="2000-01-01"
                  max="2100-12-31"
                  onChange={(event) => setMaturity(event.target.value)}
                  className={cn(inputClass, "font-mono")}
                />
              </Field>
            ) : null}

            {twinWarning ? (
              <div data-asset-duplicate>
                <StatusLine tone="error">{twinWarning}</StatusLine>
              </div>
            ) : null}

            {allocation ? (
              <div>
                <p className="mb-1.5 text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
                  Rateio inicial · 100%
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Field label="Classe">
                    <AllocationPicker
                      label="Classe"
                      values={catalog.allocation.classes}
                      value={allocation.assetClass}
                      onChange={(next) => setAllocationDraft({ ...allocation, assetClass: next })}
                      allowCreate={false}
                    />
                  </Field>
                  <Field label="Subclasse">
                    <AllocationPicker
                      label="Subclasse"
                      values={catalog.allocation.subclasses}
                      value={allocation.subclass}
                      onChange={(next) => setAllocationDraft({ ...allocation, subclass: next })}
                    />
                  </Field>
                  <Field label="Resgate">
                    <RedemptionPicker
                      label="Resgate"
                      value={allocation.duration}
                      onChange={(next) => setAllocationDraft({ ...allocation, duration: next })}
                    />
                  </Field>
                </div>
                {!allocation.subclass || !allocation.duration ? (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Escolha a subclasse e o resgate para a posição entrar nas análises.
                  </p>
                ) : (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Para dividir entre classes, ajuste depois no rateio da posição.
                  </p>
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label={valueLabel}>
            <input
              aria-label={valueLabel}
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className={cn(inputClass, "text-right font-mono")}
            />
          </Field>
          <Field label="Estratégia">
            <Picker aria-label="Estratégia" options={strategyOptions} value={strategy} onValueChange={setStrategy} />
          </Field>
        </div>

        {missingQuoteSymbol ? (
          <p className="text-xs text-warning-foreground">
            Não há cotação de {missingQuoteSymbol} nesta competência. Informe-a na página de cotações antes.
          </p>
        ) : null}
        {duplicate ? <p className="text-xs text-warning-foreground">Este ativo já tem posição nesta conta.</p> : null}
        {quoted && price !== null && validValue ? (
          <p className="font-mono text-xs text-muted-foreground">
            {formatBrl((parsedValue ?? 0) * price)} a {formatPriceBrl(price)}
          </p>
        ) : null}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Dialog.Close className={secondaryButtonClass}>Cancelar</Dialog.Close>
        <button type="button" disabled={!canAdd} onClick={submit} className={primaryButtonClass}>
          Adicionar
        </button>
      </div>
    </>
  );
}

type TickerCheckState =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "error"; retry: () => void }
  | { state: "done"; response: TickerCheckResponse };

/**
 * Confere o ticker no provedor do tipo escolhido, meio segundo depois da última
 * tecla. Um texto que mudou cancela a consulta anterior, e só o resultado do
 * texto atual é mostrado.
 */
function useTickerCheck(
  monthId: string,
  kind: AssetKind | null,
  symbol: string | null,
  coinId: string | null,
): TickerCheckState {
  const key = kind && symbol ? `${kind}:${symbol}:${coinId ?? ""}` : null;
  const [result, setResult] = useState<{ key: string; response: TickerCheckResponse | null } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!key || !kind || !symbol) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/quotes/ticker-check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ monthId, kind, ticker: symbol, ...(coinId ? { coinId } : {}) }),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as TickerCheckResponse | null;
        setResult({ key, response: payload && "status" in payload ? payload : null });
      } catch {
        if (!controller.signal.aborted) {
          setResult({ key, response: null });
        }
      }
    }, CHECK_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key, kind, symbol, coinId, monthId, attempt]);

  if (!key) {
    return { state: "idle" };
  }

  if (result?.key !== key) {
    return { state: "checking" };
  }

  if (!result.response) {
    return {
      state: "error",
      retry: () => {
        setResult(null);
        setAttempt((value) => value + 1);
      },
    };
  }

  return { state: "done", response: result.response };
}

function TickerStatus({
  kind,
  text,
  symbol,
  check,
  monthLabel,
  isCurrent,
}: {
  kind: AssetKind;
  text: string;
  symbol: string | null;
  check: TickerCheckState;
  monthLabel: string;
  isCurrent: boolean;
}) {
  const provider = providerLabel(ASSET_KIND_DEFINITIONS[kind].provider ?? "provider");
  let content: ReactNode;

  if (!text.trim()) {
    content = <StatusLine tone="muted">{tickerHint(kind)}</StatusLine>;
  } else if (!symbol && ASSET_KIND_DEFINITIONS[kind].provider === "alpha-vantage" && /^[A-Z0-9]{1,4}$/.test(text.trim())) {
    // Na B3 só o ticker completo é conferido; "PETR" ainda está sendo digitado.
    content = <StatusLine tone="muted">Digite o ticker completo, como PETR4 ou GPCA11.</StatusLine>;
  } else if (!symbol) {
    content = <StatusLine tone="error">Ticker inválido para {ASSET_KIND_DEFINITIONS[kind].label}.</StatusLine>;
  } else if (check.state === "checking" || check.state === "idle") {
    content = <StatusLine tone="checking">Verificando {symbol} no {provider}…</StatusLine>;
  } else if (check.state === "error") {
    content = (
      <StatusLine tone="warning">
        Não foi possível conferir o ticker agora.{" "}
        <button
          type="button"
          onClick={check.retry}
          className="inline-flex items-center gap-1 font-semibold underline-offset-2 outline-none hover:underline focus-visible:underline"
        >
          <ArrowClockwiseIcon aria-hidden="true" size={11} weight="bold" />
          Tentar de novo
        </button>
      </StatusLine>
    );
  } else {
    const response = check.response;

    switch (response.status) {
      case "found":
        content = (
          <StatusLine tone="success">
            {symbol} encontrado{response.name ? ` (${response.name})` : ""} no {providerLabel(response.provider)}:{" "}
            {formatPriceBrl(response.priceBrl)} hoje.
            {isCurrent ? null : ` Informe a cotação de ${monthLabel}.`}
          </StatusLine>
        );
        break;
      case "known":
        content = (
          <StatusLine tone="success">
            {symbol} já tem cotação nesta competência: {formatPriceBrl(response.priceBrl)}.
          </StatusLine>
        );
        break;
      case "unavailable":
        content = (
          <StatusLine tone="warning">
            {providerLabel(response.provider)} indisponível: {response.message} Informe a cotação para salvar.
          </StatusLine>
        );
        break;
      case "not-found":
      case "conflict":
      case "invalid":
        content = <StatusLine tone="error">{response.message}</StatusLine>;
        break;
    }
  }

  return (
    <div aria-live="polite" data-ticker-status={check.state === "done" ? check.response.status : check.state}>
      {content}
    </div>
  );
}

function StatusLine({
  tone,
  children,
}: {
  tone: "muted" | "checking" | "success" | "warning" | "error";
  children: ReactNode;
}) {
  const icon =
    tone === "checking" ? (
      <CircleNotchIcon aria-hidden="true" className="mt-px shrink-0 animate-spin" size={13} weight="bold" />
    ) : tone === "success" ? (
      <CheckCircleIcon aria-hidden="true" className="mt-px shrink-0" size={13} weight="fill" />
    ) : tone === "warning" ? (
      <WarningCircleIcon aria-hidden="true" className="mt-px shrink-0" size={13} weight="fill" />
    ) : tone === "error" ? (
      <XCircleIcon aria-hidden="true" className="mt-px shrink-0" size={13} weight="fill" />
    ) : null;

  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-[11px] leading-snug",
        tone === "success" && "text-primary",
        tone === "warning" && "text-warning-foreground",
        tone === "error" && "text-destructive",
        (tone === "muted" || tone === "checking") && "text-muted-foreground",
      )}
    >
      {icon}
      <span>{children}</span>
    </p>
  );
}

function resolveAccount(
  accountValue: string | null,
  institutionValue: string | null,
  catalog: EditingCatalog,
  newInstitutions: NamedEntry[],
  pendingAccounts: AccountEntry[],
): Pick<NewPositionDraft, "accountId" | "newAccount"> | null {
  if (!accountValue || !institutionValue) {
    return null;
  }

  if (!accountValue.startsWith(NEW_ACCOUNT)) {
    return catalog.accounts.some((account) => account.id === accountValue)
      ? { accountId: accountValue, newAccount: null }
      : null;
  }

  const account = pendingAccounts.find((entry) => `${NEW_ACCOUNT}${entry.key}` === accountValue);

  if (!account) {
    return null;
  }

  if (institutionValue.startsWith(NEW_INSTITUTION)) {
    const institution = newInstitutions.find((entry) => `${NEW_INSTITUTION}${entry.key}` === institutionValue);

    return institution
      ? {
          accountId: null,
          newAccount: { key: account.key, institutionId: null, institutionName: institution.name, name: account.name },
        }
      : null;
  }

  const institution = catalog.institutions.find((entry) => entry.id === institutionValue);

  return institution
    ? {
        accountId: null,
        newAccount: {
          key: account.key,
          institutionId: institution.id,
          institutionName: institution.name,
          name: account.name,
        },
      }
    : null;
}

/** Chave que o ativo pendente teria numa posição desta instituição. */
function pendingAssetKeyAt(asset: NewAssetDraft, institutionName: string | null) {
  if (!asset.ticker && institutionName === null) {
    return null;
  }

  return buildAssetKey({
    name: asset.name,
    ticker: asset.ticker,
    institutionName: institutionName ?? "",
    maturityDate: asset.maturityDate,
  });
}

function institutionRefOf(account: NewAccountDraft) {
  return account.institutionId ?? `${NEW_INSTITUTION}${normalizeKey(account.institutionName)}`;
}

function accountKey(institutionRef: string, name: string) {
  return `${institutionRef}|${normalizeKey(name)}`;
}

function uniqueByKey<T extends { key: string }>(entries: T[]) {
  return [...new Map(entries.map((entry) => [entry.key, entry])).values()];
}
