"use client";

import { CheckIcon, PencilSimpleIcon, TrashIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { showAppToast } from "@/components/product/app-toaster";
import { saveAssetMaturityAction } from "@/app/actions/edit-month";
import { cn } from "@/lib/utils";
import { formatDay } from "@/modules/portfolio/presentation/maturity";
import { inputClass } from "@/modules/portfolio/ui/edit-dialogs";
import { MaturityBadge } from "@/modules/portfolio/ui/maturity-badge";

const iconButtonClass =
  "grid size-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40";

/**
 * Vencimento do ativo na página da posição (spec 016): informativo, editável
 * pelo lápis e salvo no ativo, valendo para todas as competências.
 */
export function MaturityEditor({
  assetId,
  maturityDate,
  referenceDay,
}: {
  assetId: string;
  maturityDate: string | null;
  referenceDay: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(maturityDate ?? "");
  const [isSaving, startSaving] = useTransition();

  const save = (next: string | null) => {
    startSaving(async () => {
      const result = await saveAssetMaturityAction({ assetId, maturityDate: next });
      showAppToast({ tone: result.ok ? "success" : "error", title: result.message });

      if (result.ok) {
        setEditing(false);
        router.refresh();
      }
    });
  };

  if (!editing) {
    return (
      <div data-testid="position-maturity" className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Vencimento</p>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {maturityDate ? (
              <MaturityBadge maturityDate={maturityDate} referenceDay={referenceDay} />
            ) : (
              "Não informado"
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <p className="font-mono text-sm text-foreground">{maturityDate ? formatDay(parseDay(maturityDate)) : "—"}</p>
          <button
            type="button"
            aria-label={maturityDate ? "Editar vencimento" : "Informar vencimento"}
            onClick={() => {
              setDraft(maturityDate ?? "");
              setEditing(true);
            }}
            className={iconButtonClass}
          >
            <PencilSimpleIcon aria-hidden="true" size={13} weight="bold" />
          </button>
        </div>
      </div>
    );
  }

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(draft);

  return (
    <form
      data-testid="position-maturity"
      className="py-3 first:pt-0 last:pb-0"
      onSubmit={(event) => {
        event.preventDefault();

        if (valid && draft !== maturityDate) {
          save(draft);
        }
      }}
    >
      <label htmlFor="maturity-input" className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        Vencimento
      </label>
      <div className="mt-2 flex items-center gap-2">
        <input
          id="maturity-input"
          type="date"
          value={draft}
          min="2000-01-01"
          max="2100-12-31"
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setEditing(false);
            }
          }}
          className={cn(inputClass, "font-mono")}
        />
        <button
          type="submit"
          aria-label="Salvar vencimento"
          disabled={!valid || draft === maturityDate || isSaving}
          className={cn(iconButtonClass, "border-primary/40 text-primary hover:text-primary")}
        >
          <CheckIcon aria-hidden="true" size={13} weight="bold" />
        </button>
        {maturityDate ? (
          <button
            type="button"
            aria-label="Remover vencimento"
            disabled={isSaving}
            onClick={() => save(null)}
            className={cn(iconButtonClass, "hover:text-destructive")}
          >
            <TrashIcon aria-hidden="true" size={13} weight="bold" />
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Cancelar edição do vencimento"
          disabled={isSaving}
          onClick={() => setEditing(false)}
          className={iconButtonClass}
        >
          <XIcon aria-hidden="true" size={13} weight="bold" />
        </button>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Informativo: vale para o ativo em todas as competências e não muda o prazo do rateio.
      </p>
    </form>
  );
}

function parseDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
