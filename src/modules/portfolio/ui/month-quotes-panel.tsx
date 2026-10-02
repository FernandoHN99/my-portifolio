"use client";

import { CaretDownIcon, CurrencyCircleDollarIcon } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";

import { cn } from "@/lib/utils";
import type { MonthQuote } from "@/modules/portfolio/application/get-month-positions";
import { parseLocaleNumber } from "@/modules/portfolio/presentation/portfolio-format";

export function MonthQuotesPanel({
  quotes,
  canEdit,
  saving,
  onSave,
}: {
  quotes: MonthQuote[];
  canEdit: boolean;
  saving: boolean;
  onSave: (quotes: { symbol: string; valueBrl: string }[]) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const changed = quotes.filter((quote) => {
    const draft = drafts[quote.symbol];
    return draft !== undefined && draft.trim() !== quote.valueText;
  });
  const invalid = changed.some((quote) => {
    const parsed = parseLocaleNumber(drafts[quote.symbol]);
    return parsed === null || parsed <= 0;
  });

  if (quotes.length === 0) {
    return null;
  }

  return (
    <section className="premium-panel mt-5 overflow-hidden rounded-[20px]" aria-label="Cotações da competência">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left outline-none transition-colors hover:bg-white/[0.02] focus-visible:ring-2 focus-visible:ring-ring/50 sm:px-6"
      >
        <CurrencyCircleDollarIcon aria-hidden="true" className="text-primary" size={17} weight="duotone" />
        <span className="text-sm font-medium text-foreground">Cotações do mês</span>
        <span className="text-[11px] text-muted-foreground">{quotes.length} símbolos</span>
        {changed.length > 0 ? (
          <span className="rounded-full bg-warning/50 px-2 py-0.5 text-[10px] font-semibold text-warning-foreground">
            {changed.length} alterada{changed.length === 1 ? "" : "s"}
          </span>
        ) : null}
        <CaretDownIcon
          aria-hidden="true"
          className={cn("ml-auto text-muted-foreground transition-transform duration-200", open && "rotate-180")}
          size={13}
          weight="bold"
        />
      </button>

      {open ? (
        <div className="border-t border-border/60 px-5 py-4 sm:px-6">
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {quotes.map((quote) => {
              const draft = drafts[quote.symbol] ?? quote.valueText;
              const isChanged = draft.trim() !== quote.valueText;

              return (
                <label key={quote.symbol} className="block">
                  <span className="mb-1 flex items-center justify-between text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
                    <span className="font-mono normal-case text-foreground/85">{quote.symbol}</span>
                    <span>
                      {quote.positionCount} posiç{quote.positionCount === 1 ? "ão" : "ões"}
                    </span>
                  </span>
                  <span className="relative flex items-center">
                    <span className="pointer-events-none absolute left-2.5 text-[11px] text-muted-foreground">R$</span>
                    <input
                      inputMode="decimal"
                      disabled={!canEdit}
                      value={draft}
                      placeholder="sem cotação"
                      onChange={(event) =>
                        setDrafts((current) => ({ ...current, [quote.symbol]: event.target.value }))
                      }
                      className={cn(
                        "h-9 w-full rounded-lg border bg-background/60 pr-2.5 pl-8 text-right font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60",
                        isChanged ? "border-warning-border bg-warning/20" : "border-border",
                      )}
                    />
                  </span>
                </label>
              );
            })}
          </div>

          {canEdit ? (
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <p className="mr-auto text-[11px] text-muted-foreground">
                Alterar uma cotação recalcula o total de todas as posições daquele símbolo nesta competência.
              </p>
              {changed.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setDrafts({})}
                  className="h-8 rounded-lg px-3 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  Descartar
                </button>
              ) : null}
              <button
                type="button"
                disabled={changed.length === 0 || invalid || saving}
                onClick={() => {
                  void onSave(
                    changed.map((quote) => ({ symbol: quote.symbol, valueBrl: drafts[quote.symbol].trim() })),
                  ).then((saved) => {
                    if (saved) {
                      setDrafts({});
                    }
                  });
                }}
                className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground outline-none transition-[background-color,transform] duration-150 hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
              >
                {saving ? "Salvando…" : "Salvar cotações"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
