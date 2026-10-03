"use client";

import { CheckIcon, PencilSimpleIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveAssetNameAction } from "@/app/actions/edit-month";
import { showAppToast } from "@/components/product/app-toaster";
import { cn } from "@/lib/utils";
import { inputClass } from "@/modules/portfolio/ui/edit-dialogs";

const iconButtonClass =
  "grid size-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40";

/**
 * Título da página da posição com o nome do ativo, renomeável pelo lápis
 * (spec 040). O nome é do ativo e muda em todas as competências.
 */
export function AssetNameEditor({ assetId, name }: { assetId: string; name: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [isSaving, startSaving] = useTransition();
  const next = draft.replace(/\s+/g, " ").trim();

  const save = () => {
    if (!next || next === name) {
      return;
    }

    startSaving(async () => {
      const result = await saveAssetNameAction({ assetId, name: next });
      showAppToast({ tone: result.ok ? "success" : "error", title: result.message });

      if (result.ok) {
        setEditing(false);
        router.refresh();
      }
    });
  };

  if (!editing) {
    return (
      <div className="mt-3 flex items-start gap-2">
        <h1 className="text-3xl font-semibold tracking-[-0.05em] break-words sm:text-[2.65rem]">{name}</h1>
        <button
          type="button"
          aria-label="Renomear ativo"
          onClick={() => {
            setDraft(name);
            setEditing(true);
          }}
          className={cn(iconButtonClass, "mt-1.5 sm:mt-3")}
        >
          <PencilSimpleIcon aria-hidden="true" size={13} weight="bold" />
        </button>
      </div>
    );
  }

  return (
    <form
      className="mt-3 flex max-w-xl items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <input
        aria-label="Nome do ativo"
        value={draft}
        autoFocus
        maxLength={80}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setEditing(false);
          }
        }}
        className={cn(inputClass, "h-10 text-base")}
      />
      <button
        type="submit"
        aria-label="Salvar nome"
        disabled={isSaving || !next || next === name}
        className={cn(iconButtonClass, "border-primary/40 text-primary hover:text-primary")}
      >
        <CheckIcon aria-hidden="true" size={13} weight="bold" />
      </button>
      <button
        type="button"
        aria-label="Cancelar renomeação"
        disabled={isSaving}
        onClick={() => setEditing(false)}
        className={iconButtonClass}
      >
        <XIcon aria-hidden="true" size={13} weight="bold" />
      </button>
    </form>
  );
}
