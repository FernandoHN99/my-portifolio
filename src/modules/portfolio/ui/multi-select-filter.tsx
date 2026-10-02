"use client";

import { Menu } from "@base-ui/react/menu";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (option: string, checked: boolean) => {
    onChange(checked ? [...selected, option] : selected.filter((value) => value !== option));
  };

  return (
    <Menu.Root>
      <Menu.Trigger
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
          selected.length > 0
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border bg-card/60 text-muted-foreground hover:text-foreground",
        )}
      >
        {label}
        {selected.length > 0 ? (
          <span className="rounded-full bg-primary px-1.5 font-mono text-[10px] text-primary-foreground">
            {selected.length}
          </span>
        ) : null}
        <CaretDownIcon aria-hidden="true" size={11} weight="bold" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-50 outline-none" sideOffset={6} align="start">
          <Menu.Popup className="max-h-[320px] min-w-[200px] origin-[var(--transform-origin)] overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-xl outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            {options.map((option) => {
              const checked = selected.includes(option);

              return (
                <Menu.CheckboxItem
                  key={option}
                  checked={checked}
                  onCheckedChange={(next) => toggle(option, next)}
                  className="flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-foreground/85 outline-none select-none data-highlighted:bg-white/[0.06]"
                >
                  <span
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded border",
                      checked ? "border-primary bg-primary text-primary-foreground" : "border-border",
                    )}
                  >
                    <Menu.CheckboxItemIndicator>
                      <CheckIcon aria-hidden="true" size={10} weight="bold" />
                    </Menu.CheckboxItemIndicator>
                  </span>
                  {option}
                </Menu.CheckboxItem>
              );
            })}
            {selected.length > 0 ? (
              <Menu.Item
                onClick={() => onChange([])}
                className="mt-1 flex cursor-default items-center rounded-lg border-t border-border/60 px-2.5 py-2 text-[11px] text-muted-foreground outline-none select-none data-highlighted:bg-white/[0.06] data-highlighted:text-foreground"
              >
                Limpar seleção
              </Menu.Item>
            ) : null}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
