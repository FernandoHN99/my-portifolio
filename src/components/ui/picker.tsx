"use client";

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { useCallback, useState } from "react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxField,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

export type PickerOption = {
  value: string;
  label: string;
  /** Texto secundário mostrado à direita e considerado no filtro, como o ticker. */
  hint?: string;
};

type CreateItem = PickerOption & { create: string };
type PickerItem = PickerOption | CreateItem;

/** Listas a partir deste tamanho abrem o teclado virtual para filtrar. */
const SEARCH_THRESHOLD = 8;

type FieldProps = Omit<
  ComboboxPrimitive.Input.Props,
  "value" | "defaultValue" | "onChange" | "size" | "className" | "disabled"
>;

export type PickerProps = FieldProps & {
  options: PickerOption[];
  /** Valor da opção selecionada; `null` mostra o placeholder. */
  value: string | null;
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  /**
   * Mostra o teclado virtual no celular para filtrar digitando. Por padrão vale
   * para listas longas e quando é possível criar opções.
   */
  searchable?: boolean;
  /**
   * Quando informado, o texto digitado que não corresponde a nenhuma opção
   * aparece como item extra, por exemplo "Criar “X”". Selecioná-lo chama
   * `onCreate` com o texto, e cabe a quem usa decidir o que fazer com ele.
   */
  onCreate?: (text: string) => void;
  createLabel?: (text: string) => string;
  size?: "default" | "sm";
  invalid?: boolean;
  changed?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
};

/**
 * Lista de seleção única: o campo abre as opções ao clicar ou ao receber o foco
 * pelo Tab, filtra enquanto se digita e marca a opção escolhida.
 */
export function Picker({
  options,
  value,
  onValueChange,
  placeholder = "Selecione",
  emptyMessage = "Nenhuma opção encontrada",
  searchable,
  onCreate,
  createLabel = (text) => `Criar “${text}”`,
  size = "default",
  invalid = false,
  changed = false,
  disabled = false,
  className,
  inputClassName,
  onFocus,
  onKeyUp,
  ...fieldProps
}: PickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { contains } = ComboboxPrimitive.useFilter();

  const selected = value === null ? null : (options.find((option) => option.value === value) ?? null);
  const typed = query.trim();
  const canCreate =
    Boolean(onCreate) &&
    typed !== "" &&
    !options.some((option) => sameText(option.label, typed));
  const items: PickerItem[] = canCreate
    ? [...options, { value: `\u0000criar:${typed}`, label: createLabel(typed), create: typed }]
    : options;
  const allowTyping = searchable ?? (options.length >= SEARCH_THRESHOLD || Boolean(onCreate));

  const filter = useCallback(
    (item: PickerItem, text: string) =>
      "create" in item || text.trim() === "" || contains(item, text, searchText),
    [contains],
  );

  return (
    <Combobox<PickerItem>
      items={items}
      value={selected}
      open={open}
      disabled={disabled}
      filter={filter}
      autoHighlight
      itemToStringLabel={(item) => item.label}
      itemToStringValue={(item) => item.value}
      isItemEqualToValue={(item, current) => item.value === current.value}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
        }
      }}
      onInputValueChange={(text, details) => setQuery(details.reason === "input-change" ? text : "")}
      onValueChange={(item) => {
        if (!item) {
          return;
        }
        if ("create" in item) {
          onCreate?.(item.create);
          return;
        }
        onValueChange(item.value);
      }}
    >
      <ComboboxField
        size={size}
        invalid={invalid}
        changed={changed}
        placeholder={placeholder}
        inputMode={allowTyping ? undefined : "none"}
        groupClassName={className}
        className={cn(!allowTyping && "cursor-pointer caret-transparent selection:bg-transparent", inputClassName)}
        onFocus={(event) => {
          // Digitar substitui o valor atual. No toque, sem teclado virtual, a
          // seleção do texto só mostraria as alças do sistema.
          if (allowTyping || !window.matchMedia("(pointer: coarse)").matches) {
            event.currentTarget.select();
          }
          onFocus?.(event);
        }}
        onKeyUp={(event) => {
          // Ao chegar pelo Tab, as opções já aparecem, como no clique.
          if (event.key === "Tab" && !event.altKey && !open) {
            setOpen(true);
          }
          onKeyUp?.(event);
        }}
        {...fieldProps}
      />
      <ComboboxContent>
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
        <ComboboxList>
          {(item: PickerItem) =>
            "create" in item ? (
              <ComboboxItem key={item.value} value={item} indicator="none" className="text-primary data-highlighted:text-primary">
                <PlusIcon aria-hidden="true" className="shrink-0" size={12} weight="bold" />
                <span className="truncate">{item.label}</span>
              </ComboboxItem>
            ) : (
              <ComboboxItem key={item.value} value={item}>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.hint ? (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{item.hint}</span>
                ) : null}
              </ComboboxItem>
            )
          }
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function searchText(item: PickerItem) {
  return item.hint ? `${item.label} ${item.hint}` : item.label;
}

function sameText(left: string, right: string) {
  return left.localeCompare(right, "pt-BR", { sensitivity: "base" }) === 0;
}
