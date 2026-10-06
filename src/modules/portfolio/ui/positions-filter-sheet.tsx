"use client";

import { Drawer } from "@base-ui/react/drawer";
import { FunnelSimpleIcon, XIcon } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";

export type FilterGroup = {
  key: string;
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
};

export type GroupingControl = {
  value: string | null;
  options: { value: string | null; label: string }[];
  onChange: (value: string | null) => void;
};

/**
 * Filtros de Posições no celular (spec 077): um botão ao lado da busca abre uma
 * folha de baixo para cima com cada filtro em chips de toque e o agrupamento.
 * No computador, os filtros continuam em listas na própria linha.
 */
export function PositionsFilterSheet({
  groups,
  grouping,
  resultCount,
  onClear,
  className,
}: {
  groups: FilterGroup[];
  grouping: GroupingControl;
  resultCount: number;
  onClear: () => void;
  className?: string;
}) {
  const active = groups.reduce((total, group) => total + group.selected.length, 0);

  return (
    <Drawer.Root>
      <Drawer.Trigger
        aria-label={active > 0 ? `Filtros, ${active} ${active === 1 ? "ativo" : "ativos"}` : "Filtros"}
        className={cn(
          "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
          active > 0 ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card/60 text-foreground",
          className,
        )}
      >
        <FunnelSimpleIcon aria-hidden="true" size={15} weight="bold" />
        Filtros
        {active > 0 ? (
          <span className="rounded-full bg-primary px-1.5 font-mono text-[10px] text-primary-foreground">{active}</span>
        ) : null}
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-black/60 opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:duration-0 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center">
          <Drawer.Popup
            data-testid="positions-filter-sheet"
            className="flex max-h-[85dvh] w-full flex-col rounded-t-3xl border-t border-border bg-card text-foreground shadow-2xl outline-none [transform:translateY(var(--drawer-swipe-movement-y))] transition-transform duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:select-none data-ending-style:[transform:translateY(100%)] data-starting-style:[transform:translateY(100%)]"
          >
            <div aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-white/15" />
            <div className="flex shrink-0 items-center justify-between px-5 pt-3 pb-2">
              <Drawer.Title className="text-base font-semibold tracking-[-0.02em]">Filtros</Drawer.Title>
              <Drawer.Close
                aria-label="Fechar"
                className="grid size-9 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <XIcon aria-hidden="true" size={15} weight="bold" />
              </Drawer.Close>
            </div>

            <Drawer.Content className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-4">
              <ChipGroup
                label="Agrupar"
                options={grouping.options.map((option) => ({ key: option.value ?? "", label: option.label }))}
                isOn={(key) => (grouping.value ?? "") === key}
                onToggle={(key) => grouping.onChange(key === "" ? null : key)}
              />
              {groups
                .filter((group) => group.options.length > 0)
                .map((group) => (
                  <ChipGroup
                    key={group.key}
                    label={group.label}
                    count={group.selected.length}
                    options={group.options.map((option) => ({ key: option, label: option }))}
                    isOn={(key) => group.selected.includes(key)}
                    onToggle={(key) =>
                      group.onChange(
                        group.selected.includes(key)
                          ? group.selected.filter((value) => value !== key)
                          : [...group.selected, key],
                      )
                    }
                  />
                ))}
            </Drawer.Content>

            <div className="flex shrink-0 items-center gap-2 border-t border-border/70 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
              <button
                type="button"
                onClick={onClear}
                disabled={active === 0}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-4 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-40"
              >
                Limpar
              </button>
              <Drawer.Close className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40">
                Ver {resultCount} {resultCount === 1 ? "posição" : "posições"}
              </Drawer.Close>
            </div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function ChipGroup({
  label,
  count = 0,
  options,
  isOn,
  onToggle,
}: {
  label: string;
  count?: number;
  options: { key: string; label: string }[];
  isOn: (key: string) => boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 flex items-center gap-2 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {label}
        {count > 0 ? <span className="rounded-full bg-primary/15 px-1.5 font-mono text-[10px] text-primary">{count}</span> : null}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const on = isOn(option.key);

          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(option.key)}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full border px-3 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                on
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-background/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
