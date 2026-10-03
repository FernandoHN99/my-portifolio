"use client";

import { CheckIcon, PencilSimpleIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveAssetLiquidityAction } from "@/app/actions/edit-month";
import { showAppToast } from "@/components/product/app-toaster";
import { cn } from "@/lib/utils";
import { normalizeLiquidity } from "@/modules/portfolio/domain/liquidity";
import { LiquidityPicker } from "@/modules/portfolio/ui/edit-dialogs";

const iconButtonClass =
  "grid size-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40";

/**
 * Prazo de liquidez do ativo na página da posição (spec 039): opcional, editável
 * pelo lápis e salvo no ativo, valendo para todas as competências.
 */
export function LiquidityEditor({ assetId, liquidity }: { assetId: string; liquidity: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(liquidity ?? "");
  const [isSaving, startSaving] = useTransition();
  const next = normalizeLiquidity(draft);

  const save = () => {
    startSaving(async () => {
      const result = await saveAssetLiquidityAction({ assetId, liquidity: next });
      showAppToast({ tone: result.ok ? "success" : "error", title: result.message });

      if (result.ok) {
        setEditing(false);
        router.refresh();
      }
    });
  };

  return (
    <div data-testid="position-liquidity" className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Liquidez</p>
          {editing ? null : (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {liquidity ? "Prazo para o dinheiro ficar disponível no resgate" : "Não informada"}
            </p>
          )}
        </div>
        {editing ? null : (
          <div className="flex shrink-0 items-center gap-2">
            <p className="font-mono text-sm text-foreground">{liquidity ?? "—"}</p>
            <button
              type="button"
              aria-label={liquidity ? "Editar liquidez" : "Informar liquidez"}
              onClick={() => {
                setDraft(liquidity ?? "");
                setEditing(true);
              }}
              className={iconButtonClass}
            >
              <PencilSimpleIcon aria-hidden="true" size={13} weight="bold" />
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="mt-2 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <LiquidityPicker value={draft} onChange={setDraft} />
          </div>
          <button
            type="button"
            aria-label="Salvar liquidez"
            disabled={isSaving || next === liquidity}
            onClick={save}
            className={cn(iconButtonClass, "border-primary/40 text-primary hover:text-primary")}
          >
            <CheckIcon aria-hidden="true" size={13} weight="bold" />
          </button>
          <button
            type="button"
            aria-label="Cancelar edição da liquidez"
            disabled={isSaving}
            onClick={() => setEditing(false)}
            className={iconButtonClass}
          >
            <XIcon aria-hidden="true" size={13} weight="bold" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
