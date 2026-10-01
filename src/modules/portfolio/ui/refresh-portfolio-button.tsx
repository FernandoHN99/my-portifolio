"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { useFormStatus } from "react-dom";

export function RefreshPortfolioButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="group inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_10px_30px_rgba(84,224,161,0.12)] outline-none transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-primary/90 hover:shadow-[0_12px_34px_rgba(84,224,161,0.2)] focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.98] disabled:cursor-wait disabled:opacity-65"
    >
      <ArrowClockwiseIcon
        aria-hidden="true"
        className={pending ? "animate-spin" : "transition-transform duration-200 group-hover:rotate-45"}
        size={16}
        weight="bold"
      />
      {pending ? "Atualizando…" : "Atualizar carteira"}
    </button>
  );
}
