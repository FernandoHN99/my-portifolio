"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  LockSimpleIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
  XCircleIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState, useTransition, type ReactNode } from "react";

import { addPositionAction, editPositionAction, type EditActionResult } from "@/app/actions/edit-month";
import { Picker, type PickerOption } from "@/components/ui/picker";
import { cn } from "@/lib/utils";
import type { EditingCatalog } from "@/modules/portfolio/application/get-editing-catalog";
import type { MonthPosition, MonthQuote } from "@/modules/portfolio/application/get-month-positions";
import {
  ASSET_KIND_DEFINITIONS,
  ASSET_KINDS,
  baseCurrencyOf,
  buildAssetKey,
  cleanName,
  defaultAllocation,
  describeAsset,
  normalizeKey,
  normalizeTicker,
  tickerHint,
  USD_SYMBOL,
  type AssetKind,
} from "@/modules/portfolio/domain/asset-kinds";
import { normalizeLiquidity } from "@/modules/portfolio/domain/liquidity";
import { categoryColor } from "@/modules/portfolio/presentation/category-colors";
import { formatBrl, formatPriceBrl, parseLocaleNumber } from "@/modules/portfolio/presentation/portfolio-format";
import {
  AllocationPicker,
  backdropClass,
  Field,
  inputClass,
  LiquidityPicker,
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

// Formulário único da posição (spec 043): a mesma estrutura para incluir e
// editar, num diálogo com três abas. Geral tem o que toda posição tem; Ativo,
// o que depende do tipo; Rateio, a divisão entre classificações. Na edição,
// tipo, instituição e ticker são só leitura, e nome, vencimento e liquidez,
// que são do ativo, valem para todos os meses. Na inclusão, Ativo e Rateio
// ficam com cadeado até o tipo ser escolhido, porque dependem dele (spec 048).
// Salvar grava na hora, com desfazer; só um mês aberto aceita edição (spec 034).

export type PositionFormMonth = { id: string; label: string; isCurrent: boolean; quotes: MonthQuote[] };
export type PositionFormTarget = { mode: "add" } | { mode: "edit"; position: MonthPosition };

type TabKey = "geral" | "ativo" | "rateio";
type AllocationRow = { key: number; assetClass: string; subclass: string; duration: string; weight: string };
type Issue = { tab: TabKey; message: string };

const TABS: { key: TabKey; label: string }[] = [
  { key: "geral", label: "Geral" },
  { key: "ativo", label: "Ativo" },
  { key: "rateio", label: "Rateio" },
];
const NEW_INSTITUTION = "nova:";
const DEFAULT_ACCOUNT_NAME = "Principal";
const CHECK_DEBOUNCE_MS = 500;

const popupClass =
  "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[min(600px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0";

export function PositionFormDialog({
  open,
  onOpenChange,
  target,
  formKey,
  catalog,
  month,
  occupied,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Continua definido depois de fechar, para o conteúdo não sumir na animação. */
  target: PositionFormTarget | null;
  /** Muda a cada abertura e recomeça o formulário. */
  formKey: number;
  catalog: EditingCatalog;
  month: PositionFormMonth;
  /** Conta e ativo (`conta:ativo`) que já têm posição na competência. */
  occupied: Set<string>;
  onSaved: (result: EditActionResult) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup className={popupClass} data-testid="position-form">
          {target ? (
            <PositionForm
              key={formKey}
              target={target}
              catalog={catalog}
              month={month}
              occupied={occupied}
              onSaved={(result) => {
                onSaved(result);
                onOpenChange(false);
              }}
            />
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PositionForm({
  target,
  catalog,
  month,
  occupied,
  onSaved,
}: {
  target: PositionFormTarget;
  catalog: EditingCatalog;
  month: PositionFormMonth;
  occupied: Set<string>;
  onSaved: (result: EditActionResult) => void;
}) {
  const editing = target.mode === "edit" ? target.position : null;
  const [tab, setTab] = useState<TabKey>("geral");
  const [showIssues, setShowIssues] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  // Geral.
  const [kind, setKind] = useState<AssetKind | null>(null);
  const [institutionValue, setInstitutionValue] = useState<string | null>(null);
  const [createdInstitution, setCreatedInstitution] = useState<{ key: string; name: string } | null>(null);
  const [assetName, setAssetName] = useState(editing?.assetName ?? "");
  const [value, setValue] = useState(editing ? editableValue(editing) : "");
  const [strategy, setStrategy] = useState(editing?.strategy ?? "");
  // Ativo.
  const [tickerText, setTickerText] = useState("");
  const [coinChoice, setCoinChoice] = useState<{ symbol: string; id: string } | null>(null);
  const [coinCandidates, setCoinCandidates] = useState<{ symbol: string; coins: CoinCandidate[] } | null>(null);
  const [manualPrice, setManualPrice] = useState("");
  const [maturity, setMaturity] = useState(editing?.maturityDate ?? "");
  const [liquidity, setLiquidity] = useState(editing?.liquidity ?? "");
  // Rateio: na inclusão, segue o tipo e o ativo escolhidos até ser mexido.
  const [rows, setRows] = useState<AllocationRow[] | null>(() =>
    editing
      ? editing.allocations.map((allocation, index) => ({
          key: index,
          assetClass: allocation.assetClass,
          subclass: allocation.subclass,
          duration: allocation.duration,
          weight: formatWeight(allocation.weight),
        }))
      : null,
  );
  const [nextRowKey, setNextRowKey] = useState(100);

  const quoteOf = (symbol: string) => month.quotes.find((entry) => entry.symbol === symbol)?.valueBrl ?? null;

  // Instituição: existente ou nova, criada ao salvar com a conta "Principal"
  // (spec 040); a conta não aparece na interface.
  const institutionOptions: PickerOption[] = [
    ...catalog.institutions.map((institution) => ({ value: institution.id, label: institution.name })),
    ...(createdInstitution
      ? [{ value: `${NEW_INSTITUTION}${createdInstitution.key}`, label: createdInstitution.name, hint: "nova" }]
      : []),
  ];
  const institutionName = editing
    ? editing.institutionName
    : institutionValue?.startsWith(NEW_INSTITUTION)
      ? (createdInstitution?.name ?? null)
      : (catalog.institutions.find((entry) => entry.id === institutionValue)?.name ?? null);
  const account = resolveAccount(institutionValue, createdInstitution, catalog);

  const createInstitution = (text: string) => {
    const name = cleanName(text);
    const key = normalizeKey(name);

    if (!key) {
      return;
    }

    // Um nome igual sem acentos, maiúsculas ou pontuação é a mesma instituição.
    const existing = catalog.institutions.find((institution) => normalizeKey(institution.name) === key);

    if (existing) {
      setInstitutionValue(existing.id);
      return;
    }

    setCreatedInstitution({ key, name });
    setInstitutionValue(`${NEW_INSTITUTION}${key}`);
  };

  const chooseKind = (next: string) => {
    setKind(next as AssetKind);
    setManualPrice("");

    if (!ASSET_KIND_DEFINITIONS[next as AssetKind].allowsMaturity) {
      setMaturity("");
    }
  };

  // Ativo da inclusão: a identidade é a mesma que o servidor calcula, e um
  // ativo existente com a mesma chave é reaproveitado (spec 040).
  const definition = kind ? ASSET_KIND_DEFINITIONS[kind] : null;
  const typedName = cleanName(assetName);
  const symbol =
    definition?.ticker === "usd"
      ? USD_SYMBOL
      : definition?.ticker === "market" && kind
        ? normalizeTicker(kind, tickerText)
        : null;
  const chosenCoinId = kind === "crypto" && symbol && coinChoice?.symbol === symbol ? coinChoice.id : null;
  const check = useTickerCheck(
    month.id,
    !editing && definition?.ticker === "market" ? kind : null,
    symbol,
    chosenCoinId,
  );
  const checkedCoins = check.state === "done" && check.response.status === "found" ? check.response.coins : undefined;

  if (symbol && checkedCoins && coinCandidates?.symbol !== symbol) {
    setCoinCandidates({ symbol, coins: checkedCoins });
  }

  const coins = kind === "crypto" && symbol && coinCandidates?.symbol === symbol ? coinCandidates.coins : null;
  const checkedCoinId =
    check.state === "done" && check.response.status === "found" ? (check.response.coinId ?? null) : null;
  const maturityDate = (editing ? allowsMaturityOf(editing) : definition?.allowsMaturity) && maturity ? maturity : null;
  const assetKey =
    !editing && definition && normalizeKey(typedName) && (definition.ticker === null ? institutionName : symbol)
      ? buildAssetKey({ name: typedName, ticker: symbol, institutionName: institutionName ?? "", maturityDate })
      : null;
  const catalogAsset = assetKey ? catalog.assets.find((asset) => asset.normalizedKey === assetKey) : undefined;
  const isNewAsset = !editing && assetKey !== null && !catalogAsset;
  const response = check.state === "done" ? check.response : null;
  const needsManualPrice =
    isNewAsset &&
    definition?.ticker === "market" &&
    (response?.status === "unavailable" || (response?.status === "found" && !month.isCurrent));
  const manualPriceValue = parseLocaleNumber(manualPrice);

  // Cotação para a prévia do total e para saber se o ativo pode ser salvo.
  let price: number | null = null;
  let missingQuoteSymbol: string | null = null;
  let tickerIssue: string | null = null;

  if (editing) {
    price = editing.unitPriceBrl;
  } else if (catalogAsset) {
    price = catalogAsset.quoteSymbol ? quoteOf(catalogAsset.quoteSymbol) : null;
    missingQuoteSymbol = catalogAsset.quoteSymbol && !price ? catalogAsset.quoteSymbol : null;
  } else if (definition?.ticker === "usd") {
    price = quoteOf(USD_SYMBOL);
    missingQuoteSymbol = price ? null : USD_SYMBOL;
  } else if (definition?.ticker === "market") {
    if (!symbol) {
      tickerIssue = "Informe um ticker válido.";
    } else if (!tickerCheckAllowsSaving(response)) {
      tickerIssue = check.state === "checking" || check.state === "idle" ? "Aguarde a conferência do ticker." : "Confira o ticker.";
    } else if (response.status === "known" || (response.status === "found" && month.isCurrent)) {
      price = response.priceBrl;
    } else if (needsManualPrice) {
      price = manualPriceValue !== null && manualPriceValue > 0 ? manualPriceValue : null;
    }
  }

  const quoted = editing ? Boolean(editing.quoteSymbol) : catalogAsset ? Boolean(catalogAsset.quoteSymbol) : Boolean(definition?.ticker);
  const quoteSymbol = editing ? editing.quoteSymbol : (catalogAsset?.quoteSymbol ?? symbol);
  const valueLabel =
    !editing && !kind ? "Quantidade ou saldo" : quoteSymbol === USD_SYMBOL ? "Saldo (US$)" : quoted ? "Quantidade" : "Saldo (R$)";
  const parsedValue = parseLocaleNumber(value);
  const duplicate = Boolean(
    account?.accountId && catalogAsset && occupied.has(`${account.accountId}:${catalogAsset.id}`),
  );

  // Rateio da inclusão: o do ativo existente ou o padrão do tipo.
  const derivedRows: AllocationRow[] =
    catalogAsset && catalogAsset.allocations.length > 0
      ? catalogAsset.allocations.map((allocation, index) => ({
          key: index,
          assetClass: allocation.assetClass,
          subclass: allocation.subclass,
          duration: allocation.duration,
          weight: formatWeight(allocation.weight),
        }))
      : kind
        ? [{ key: 0, ...defaultAllocation(kind, symbol), weight: "100" }]
        : [{ key: 0, assetClass: "", subclass: "", duration: "", weight: "100" }];
  const allocationRows = rows ?? derivedRows;
  const weightSum = allocationRows.reduce((total, row) => total + (parseLocaleNumber(row.weight) ?? 0), 0);
  const rowsComplete = allocationRows.every(
    (row) =>
      row.assetClass.trim() &&
      row.subclass.trim() &&
      row.duration.trim() &&
      (parseLocaleNumber(row.weight) ?? 0) > 0,
  );
  const balanced = Math.abs(weightSum - 100) <= 0.01;

  const changeRows = (change: (current: AllocationRow[]) => AllocationRow[]) => setRows(change(allocationRows));
  const updateRow = (key: number, field: keyof Omit<AllocationRow, "key">, text: string) =>
    changeRows((current) => current.map((row) => (row.key === key ? { ...row, [field]: text } : row)));

  const issues: Issue[] = [];

  if (!editing) {
    if (!kind) {
      issues.push({ tab: "geral", message: "Escolha o tipo do ativo." });
    }
    if (!institutionName) {
      issues.push({ tab: "geral", message: "Escolha a instituição." });
    }
  }
  if (!typedName) {
    issues.push({ tab: "geral", message: "Informe o nome do ativo." });
  }
  if (parsedValue === null || parsedValue < 0) {
    issues.push({
      tab: "geral",
      message: !editing && !kind ? "Informe a quantidade ou o saldo." : quoted && quoteSymbol !== USD_SYMBOL ? "Informe a quantidade." : "Informe o saldo.",
    });
  }
  if (duplicate) {
    issues.push({ tab: "geral", message: "Este ativo já tem posição nesta instituição." });
  }
  if (!editing && kind) {
    if (tickerIssue && !catalogAsset) {
      issues.push({ tab: "ativo", message: tickerIssue });
    }
    if (needsManualPrice && (manualPriceValue === null || manualPriceValue <= 0)) {
      issues.push({ tab: "ativo", message: "Informe a cotação em R$." });
    }
    if (missingQuoteSymbol) {
      issues.push({
        tab: "ativo",
        message: `Não há cotação de ${missingQuoteSymbol} nesta competência. Informe-a na página de cotações antes.`,
      });
    }
  }
  if (!rowsComplete) {
    issues.push({ tab: "rateio", message: "Preencha classe, subclasse, resgate e peso de cada classificação." });
  } else if (!balanced) {
    issues.push({ tab: "rateio", message: `O rateio soma ${formatWeight(weightSum)}%; precisa somar 100%.` });
  }

  const tabsWithIssues = new Set(issues.map((issue) => issue.tab));
  const visibleIssue = showIssues ? (issues.find((issue) => issue.tab === tab) ?? issues[0] ?? null) : null;

  const submit = () => {
    setError(null);

    if (issues.length > 0) {
      setShowIssues(true);
      if (!tabsWithIssues.has(tab)) {
        setTab(issues[0].tab);
      }
      return;
    }

    const allocations = allocationRows.map((row) => ({
      assetClass: row.assetClass.trim(),
      subclass: row.subclass.trim(),
      duration: row.duration.trim(),
      weightPercent: row.weight.trim().replace(",", "."),
    }));

    startSaving(async () => {
      let result: EditActionResult;

      if (editing) {
        result = await editPositionAction({
          monthId: month.id,
          edit: {
            positionId: editing.id,
            value: value.trim(),
            strategy: strategy || null,
            allocations,
            asset: { name: typedName, liquidity: normalizeLiquidity(liquidity), maturityDate },
          },
        });
      } else if (kind && account) {
        result = await addPositionAction({
          monthId: month.id,
          addition: {
            ...(account.accountId ? { accountId: account.accountId } : { newAccount: account.newAccount }),
            ...(catalogAsset
              ? { assetId: catalogAsset.id }
              : {
                  newAsset: {
                    name: typedName,
                    kind,
                    ticker: symbol,
                    maturityDate,
                    liquidity: normalizeLiquidity(liquidity),
                    quoteCheckToken:
                      response?.status === "found" || response?.status === "unavailable" ? response.token : null,
                    manualPriceBrl: needsManualPrice ? manualPrice.trim() : null,
                  },
                }),
            value: value.trim(),
            strategy: strategy || null,
            allocations,
          },
        });
      } else {
        return;
      }

      if (result.ok) {
        onSaved(result);
      } else {
        setError(result.message);
      }
    });
  };

  const strategyOptions: PickerOption[] = [
    { value: "", label: "Sem estratégia" },
    ...catalog.strategies.map((entry) => ({ value: entry, label: entry })),
  ];
  const market = !editing && definition?.ticker === "market";
  const baseCurrency = editing?.baseCurrency ?? catalogAsset?.baseCurrency ?? (kind ? baseCurrencyOf(kind, symbol) : null);
  const canEditMaturity = editing ? allowsMaturityOf(editing) : Boolean(definition?.allowsMaturity);

  return (
    <>
      <header className="flex items-start gap-4 border-b border-border/70 px-5 pt-5 pb-4 sm:px-6">
        <div className="min-w-0">
          <Dialog.Title className="truncate text-base font-semibold tracking-[-0.02em]">
            {editing ? `Editar ${editing.assetName}` : "Adicionar posição"}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs leading-5 text-muted-foreground">
            {editing
              ? `${editing.institutionName} · ${month.label}`
              : `${month.label} · comece pelo tipo do ativo; os campos dele aparecem na aba Ativo.`}
          </Dialog.Description>
        </div>
        <Dialog.Close
          aria-label="Fechar"
          className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <XIcon aria-hidden="true" size={14} weight="bold" />
        </Dialog.Close>
      </header>

      <Tabs.Root value={tab} onValueChange={(next) => setTab(next as TabKey)} className="flex min-h-0 flex-1 flex-col">
        <Tabs.List
          aria-label="Seções da posição"
          className="relative mx-5 mt-4 grid shrink-0 grid-cols-3 rounded-xl border border-border bg-background/40 p-1 sm:mx-6"
        >
          <Tabs.Indicator className="absolute top-1 bottom-1 left-[var(--active-tab-left)] w-[var(--active-tab-width)] rounded-lg bg-white/[0.07] transition-[left,width] duration-200 ease-out" />
          {TABS.map((entry) => {
            const locked = entry.key !== "geral" && !editing && kind === null;

            return (
              <Tabs.Tab
                key={entry.key}
                value={entry.key}
                disabled={locked}
                title={locked ? "Escolha o tipo do ativo na aba Geral para liberar." : undefined}
                data-locked={locked ? "" : undefined}
                className="relative z-10 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-active:text-foreground data-disabled:cursor-not-allowed data-disabled:text-muted-foreground/50 data-disabled:hover:text-muted-foreground/50"
              >
                {locked ? (
                  <LockSimpleIcon aria-hidden="true" size={12} weight="bold" className="shrink-0" />
                ) : null}
                {entry.label}
                {entry.key === "rateio" && !locked ? (
                  <span
                    className={cn(
                      "font-mono text-[10px]",
                      balanced && rowsComplete ? "text-muted-foreground" : "text-warning-foreground",
                    )}
                  >
                    {formatWeight(weightSum)}%
                  </span>
                ) : null}
                {showIssues && !locked && tabsWithIssues.has(entry.key) ? (
                  <span aria-label="com pendências" className="size-1.5 rounded-full bg-warning-foreground" />
                ) : null}
              </Tabs.Tab>
            );
          })}
        </Tabs.List>

        {!editing && assetKey ? (
          <div className="mx-5 mt-3 sm:mx-6" data-asset-existing={catalogAsset ? "" : undefined}>
            <StatusLine tone={catalogAsset ? "success" : "muted"}>
              {catalogAsset
                ? `${catalogAsset.name} já existe: a posição usa este ativo e o rateio da posição mais recente dele.`
                : `Ativo novo: ${typedName}, criado ao salvar.`}
            </StatusLine>
          </div>
        ) : null}

        {/* Altura mínima: trocar de aba não faz o diálogo pular de tamanho. */}
        <div className="min-h-[min(19rem,40dvh)] flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
          <Tabs.Panel value="geral" className="space-y-3 outline-none">
            {editing ? (
              <div className="grid grid-cols-2 gap-3">
                <ReadOnly label="Tipo do ativo" value={describeAsset(editing)} />
                <ReadOnly label="Instituição" value={editing.institutionName} />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Tipo do ativo">
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
                <Field label="Instituição">
                  <Picker
                    aria-label="Instituição"
                    options={institutionOptions}
                    value={institutionValue}
                    onValueChange={setInstitutionValue}
                    onCreate={createInstitution}
                    placeholder="Selecione ou digite"
                    emptyMessage="Digite para criar uma instituição"
                  />
                </Field>
              </div>
            )}

            <Field label="Nome do ativo">
              <input
                aria-label="Nome do ativo"
                value={assetName}
                onChange={(event) => setAssetName(event.target.value)}
                autoComplete="off"
                placeholder={market ? "Como ETF - VOO" : "Como CDB Banco X 110%"}
                className={inputClass}
              />
            </Field>
            {editing ? (
              <p className="-mt-1.5 text-[11px] text-muted-foreground">O nome é do ativo e vale para todos os meses.</p>
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
            {quoted && price !== null && parsedValue !== null ? (
              <p className="font-mono text-xs text-muted-foreground" data-testid="position-form-total">
                {formatBrl(parsedValue * price)} a {formatPriceBrl(price)}
              </p>
            ) : null}
          </Tabs.Panel>

          <Tabs.Panel value="ativo" className="space-y-3 outline-none">
            {!editing && !kind ? (
              <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-xs text-muted-foreground">
                Escolha o tipo do ativo na aba Geral.
              </p>
            ) : (
              <>
                {editing ? (
                  <div className="grid grid-cols-2 gap-3">
                    <ReadOnly label="Ticker" value={editing.ticker ?? "Sem ticker · saldo"} mono />
                    <ReadOnly label="Moeda base" value={editing.baseCurrency} mono />
                    {editing.unitPriceBrl !== null ? (
                      <ReadOnly label={`Cotação de ${month.label}`} value={formatPriceBrl(editing.unitPriceBrl)} mono />
                    ) : null}
                  </div>
                ) : null}

                {market && kind ? (
                  <>
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
                    <TickerStatus
                      kind={kind}
                      text={tickerText}
                      symbol={symbol}
                      check={check}
                      monthLabel={month.label}
                      isCurrent={month.isCurrent}
                    />
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
                  </>
                ) : null}

                {!editing && baseCurrency ? <ReadOnly label="Moeda base" value={baseCurrency} mono /> : null}

                {/* Na inclusão, o vencimento faz parte da identidade do ativo:
                    um título de mesmo nome e outro prazo é um ativo novo. */}
                {canEditMaturity ? (
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

                {editing || isNewAsset ? (
                  <Field label="Liquidez (opcional)">
                    <LiquidityPicker value={liquidity} onChange={setLiquidity} />
                  </Field>
                ) : catalogAsset ? (
                  <ReadOnly label="Liquidez do ativo" value={catalogAsset.liquidity ?? "Não informada"} />
                ) : null}

                {editing ? (
                  <p className="text-[11px] leading-5 text-muted-foreground">
                    Vencimento e liquidez são do ativo e valem para todos os meses.
                  </p>
                ) : null}
              </>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="rateio" className="outline-none">
            <p className="text-[11px] leading-5 text-muted-foreground">
              Divida a posição entre classificações. A soma dos pesos precisa dar 100%.
            </p>
            <div className="mt-3 space-y-2.5">
              {allocationRows.map((row, index) => (
                <div key={row.key} className="rounded-xl border border-border/70 bg-background/30 p-3" data-allocation-row>
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ backgroundColor: categoryColor(row.assetClass) }} />
                    <span className="text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
                      Classificação {index + 1}
                    </span>
                    {allocationRows.length > 1 ? (
                      <button
                        type="button"
                        aria-label={`Remover classificação ${index + 1}`}
                        onClick={() => changeRows((current) => current.filter((entry) => entry.key !== row.key))}
                        className="ml-auto grid size-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        <TrashIcon aria-hidden="true" size={13} />
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_88px]">
                    <Field label="Classe">
                      <AllocationPicker
                        label={`Classe da classificação ${index + 1}`}
                        values={catalog.allocation.classes}
                        value={row.assetClass}
                        onChange={(next) => updateRow(row.key, "assetClass", next)}
                        allowCreate={false}
                      />
                    </Field>
                    <Field label="Subclasse">
                      <AllocationPicker
                        label={`Subclasse da classificação ${index + 1}`}
                        values={catalog.allocation.subclasses}
                        value={row.subclass}
                        onChange={(next) => updateRow(row.key, "subclass", next)}
                      />
                    </Field>
                    <Field label="Resgate">
                      <RedemptionPicker
                        label={`Resgate da classificação ${index + 1}`}
                        value={row.duration}
                        onChange={(next) => updateRow(row.key, "duration", next)}
                      />
                    </Field>
                    <Field label="Peso (%)">
                      <input
                        aria-label={`Peso da classificação ${index + 1}`}
                        inputMode="decimal"
                        value={row.weight}
                        onChange={(event) => updateRow(row.key, "weight", event.target.value)}
                        className={cn(inputClass, "text-right font-mono")}
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                changeRows((current) => [
                  ...current,
                  {
                    key: nextRowKey,
                    assetClass: "",
                    subclass: "",
                    duration: "",
                    weight: formatWeight(Math.max(100 - weightSum, 0)),
                  },
                ]);
                setNextRowKey((key) => key + 1);
              }}
              className="mt-2.5 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <PlusIcon aria-hidden="true" size={13} weight="bold" />
              Adicionar classificação
            </button>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className={cn("h-full rounded-full transition-[width] duration-200", balanced ? "bg-primary" : "bg-warning-foreground")}
                style={{ width: `${Math.min(weightSum, 100)}%` }}
              />
            </div>
            <p
              aria-live="polite"
              className={cn("mt-2 text-xs font-medium", balanced ? "text-primary" : "text-warning-foreground")}
            >
              Soma: {formatWeight(weightSum)}%
              {balanced ? "" : weightSum < 100 ? ` · faltam ${formatWeight(100 - weightSum)}%` : ` · sobram ${formatWeight(weightSum - 100)}%`}
            </p>
          </Tabs.Panel>
        </div>
      </Tabs.Root>

      {/* A contagem de pendências fica no rodapé para os testes, que rodam
          sobre os dados reais, saberem se o formulário está pronto sem salvar. */}
      <footer
        data-issue-count={issues.length}
        className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/70 px-5 py-4 sm:px-6"
      >
        <div className="min-w-0 flex-1 basis-56" aria-live="polite">
          {error ? (
            <p role="alert" className="flex items-start gap-1.5 text-[11px] leading-snug text-destructive">
              <XCircleIcon aria-hidden="true" className="mt-px shrink-0" size={13} weight="fill" />
              {error}
            </p>
          ) : visibleIssue ? (
            <p className="flex items-start gap-1.5 text-[11px] leading-snug text-warning-foreground" data-testid="position-form-issue">
              <WarningCircleIcon aria-hidden="true" className="mt-px shrink-0" size={13} weight="fill" />
              {TABS.find((entry) => entry.key === visibleIssue.tab)?.label}: {visibleIssue.message}
            </p>
          ) : null}
        </div>
        <div className="ml-auto flex gap-2">
          <Dialog.Close className={secondaryButtonClass} disabled={isSaving}>
            Cancelar
          </Dialog.Close>
          <button type="button" onClick={submit} disabled={isSaving} className={primaryButtonClass}>
            {isSaving ? <CircleNotchIcon aria-hidden="true" className="animate-spin" size={14} weight="bold" /> : null}
            {isSaving ? "Salvando…" : editing ? "Salvar" : "Adicionar"}
          </button>
        </div>
      </footer>
    </>
  );
}

function ReadOnly({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="mb-1 block text-[10px] tracking-[0.08em] text-muted-foreground uppercase">{label}</span>
      <p
        className={cn(
          "flex h-9 items-center truncate rounded-lg border border-border/60 bg-white/[0.02] px-2.5 text-xs text-foreground/80",
          mono && "font-mono",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** Saldos sem cotação e saldos em dólar aceitam vencimento (spec 040). */
function allowsMaturityOf(position: Pick<MonthPosition, "quoteSymbol">) {
  return !position.quoteSymbol || position.quoteSymbol === USD_SYMBOL;
}

function editableValue(position: MonthPosition) {
  return (position.quoteSymbol ? position.quantityText : position.totalBrl.toFixed(2)).replace(".", ",");
}

function formatWeight(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 4, useGrouping: false });
}

/**
 * Conta da instituição escolhida: a "Principal", ou a primeira; numa
 * instituição sem conta ou nova, uma conta "Principal" criada ao salvar.
 */
function resolveAccount(
  institutionValue: string | null,
  createdInstitution: { key: string; name: string } | null,
  catalog: EditingCatalog,
): { accountId: string; newAccount?: undefined } | { accountId?: undefined; newAccount: { institutionId: string | null; institutionName: string | null; name: string } } | null {
  if (!institutionValue) {
    return null;
  }

  if (institutionValue.startsWith(NEW_INSTITUTION)) {
    return createdInstitution
      ? { newAccount: { institutionId: null, institutionName: createdInstitution.name, name: DEFAULT_ACCOUNT_NAME } }
      : null;
  }

  const accounts = catalog.accounts.filter((account) => account.institutionId === institutionValue);
  const principal =
    accounts.find((account) => normalizeKey(account.name) === normalizeKey(DEFAULT_ACCOUNT_NAME)) ?? accounts[0];

  return principal
    ? { accountId: principal.id }
    : { newAccount: { institutionId: institutionValue, institutionName: null, name: DEFAULT_ACCOUNT_NAME } };
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
  } else if (!symbol && ASSET_KIND_DEFINITIONS[kind].provider === "yahoo" && /^[A-Z0-9]{1,4}$/.test(text.trim())) {
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
