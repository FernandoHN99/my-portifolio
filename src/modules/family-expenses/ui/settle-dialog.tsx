"use client";

import { Dialog } from "@base-ui/react/dialog";
import { CheckIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { useState, useTransition } from "react";

import { settleFamilyEntriesAction, type FamilyActionResult } from "@/app/actions/family-expenses";
import { formatCompetenceLong } from "@/modules/family-expenses/domain/competence";
import { displayDescription, signedCents, type LedgerEntry, type LedgerSeries } from "@/modules/family-expenses/domain/ledger";
import { formatCents } from "@/modules/family-expenses/domain/money";
import { balanceMeaning, DirectionBadge } from "@/modules/family-expenses/ui/ledger-parts";
import { backdropClass, primaryButtonClass, secondaryButtonClass } from "@/modules/portfolio/ui/edit-dialogs";

// Acerto em lote (spec 082): antes de gravar, mostra cada lançamento que muda
// de Pendente para Acertado, por mês e pessoa, com o saldo do lote. Só esses ids
// vão ao servidor, que acerta todos ou nenhum.

export type SettleTarget = { title: string; entries: LedgerEntry[] };

const popupClass =
  "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-1.5rem)] w-[min(520px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0";

export function SettleDialog({
  open,
  onOpenChange,
  target,
  contacts,
  series,
  onSettled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: SettleTarget | null;
  contacts: ReadonlyMap<string, string>;
  series: ReadonlyMap<string, LedgerSeries>;
  onSettled: (result: FamilyActionResult) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const entries = target?.entries ?? [];
  const total = entries.reduce((sum, entry) => sum + signedCents(entry), 0);
  const groups = groupByMonthAndPerson(entries, contacts);

  const confirm = () =>
    startSaving(async () => {
      const result = await settleFamilyEntriesAction({ ids: entries.map((entry) => entry.id) });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setError(null);
      onSettled(result);
      onOpenChange(false);
    });

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setError(null);
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup className={popupClass} data-testid="family-settle-dialog">
          <header className="flex items-start gap-4 border-b border-border/70 px-5 pt-5 pb-4 sm:px-6">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold tracking-[-0.02em]">{target?.title ?? "Acertar"}</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-muted-foreground">
                {entries.length === 1 ? "1 lançamento pendente passa" : `${entries.length} lançamentos pendentes passam`} a
                Acertado.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Fechar"
              className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <XIcon aria-hidden="true" size={14} weight="bold" />
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            <ul className="space-y-4" data-testid="family-settle-list">
              {groups.map((group) => (
                <li key={group.key}>
                  <p className="mb-1.5 flex items-baseline justify-between gap-3 text-[11px]">
                    <span className="font-semibold text-foreground">
                      {group.person} · {formatCompetenceLong(group.competence)}
                    </span>
                    <span className="font-mono text-muted-foreground">{formatCents(group.totalCents, { signed: true })}</span>
                  </p>
                  <ul className="divide-y divide-border/50 rounded-xl border border-border/70">
                    {group.entries.map((entry) => (
                      <li key={entry.id} data-testid="family-settle-entry" className="flex items-center gap-3 px-3 py-2 text-xs">
                        <span className="min-w-0 flex-1 truncate text-foreground/90">
                          {displayDescription(entry, entry.seriesId ? series.get(entry.seriesId) : undefined)}
                        </span>
                        <DirectionBadge direction={entry.direction} />
                        <span className="w-24 shrink-0 text-right font-mono tabular-nums text-foreground/85">
                          {formatCents(signedCents(entry), { signed: true })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3 border-t border-border/70 px-5 py-4 sm:px-6">
            <p className="flex items-baseline justify-between gap-3 text-xs" data-testid="family-settle-total">
              <span className="text-muted-foreground">Saldo do acerto</span>
              <span className="font-mono text-sm text-foreground">
                {formatCents(total, { signed: true })}{" "}
                <span className="font-sans text-[11px] text-muted-foreground">{balanceMeaning(total)}</span>
              </span>
            </p>
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Dialog.Close className={secondaryButtonClass}>Cancelar</Dialog.Close>
              <button type="button" onClick={confirm} disabled={saving || entries.length === 0} className={primaryButtonClass}>
                <CheckIcon aria-hidden="true" size={14} weight="bold" />
                {saving ? "Acertando…" : `Acertar ${entries.length}`}
              </button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function groupByMonthAndPerson(entries: readonly LedgerEntry[], contacts: ReadonlyMap<string, string>) {
  const groups = new Map<string, { key: string; competence: string; person: string; totalCents: number; entries: LedgerEntry[] }>();

  for (const entry of entries) {
    const key = `${entry.competence}:${entry.contactId}`;
    const group =
      groups.get(key) ??
      groups
        .set(key, { key, competence: entry.competence, person: contacts.get(entry.contactId) ?? "—", totalCents: 0, entries: [] })
        .get(key)!;
    group.entries.push(entry);
    group.totalCents += signedCents(entry);
  }

  return [...groups.values()].sort(
    (left, right) => right.competence.localeCompare(left.competence) || left.person.localeCompare(right.person, "pt-BR"),
  );
}
