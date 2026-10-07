"use client";

import { Dialog } from "@base-ui/react/dialog";
import { CheckIcon, PencilSimpleIcon, PlusIcon, TrashIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { useState, useTransition } from "react";

import {
  createFamilyContactAction,
  deleteFamilyContactAction,
  renameFamilyContactAction,
  type FamilyActionResult,
} from "@/app/actions/family-expenses";
import { cn } from "@/lib/utils";
import type { LedgerContact } from "@/modules/family-expenses/domain/ledger";
import { backdropClass, inputClass, primaryButtonClass } from "@/modules/portfolio/ui/edit-dialogs";

// Pessoas de Gastos familiares (spec 082): contatos do dono, não contas de
// login. Renomear muda todos os lançamentos dela; excluir só sem lançamentos.

const popupClass =
  "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-1.5rem)] w-[min(420px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0";

export function ContactsDialog({
  open,
  onOpenChange,
  contacts,
  usage,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: LedgerContact[];
  /** Lançamentos de cada pessoa. */
  usage: ReadonlyMap<string, number>;
  onChanged: (result: FamilyActionResult) => void;
}) {
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startPending] = useTransition();

  const run = (operation: () => Promise<FamilyActionResult>, after?: () => void) =>
    startPending(async () => {
      const result = await operation();

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setError(null);
      after?.();
      onChanged(result);
    });

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setEditing(null);
        setError(null);
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup className={popupClass} data-testid="family-contacts-dialog">
          <header className="flex items-start gap-4 border-b border-border/70 px-5 pt-5 pb-4 sm:px-6">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold tracking-[-0.02em]">Pessoas</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                {contacts.length} {contacts.length === 1 ? "pessoa" : "pessoas"}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Fechar"
              className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <XIcon aria-hidden="true" size={14} weight="bold" />
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 sm:px-6">
            <ul className="divide-y divide-border/60">
              {contacts.map((contact) => {
                const count = usage.get(contact.id) ?? 0;
                const isEditing = editing?.id === contact.id;

                return (
                  <li key={contact.id} className="flex min-h-12 items-center gap-2 py-1.5">
                    {isEditing ? (
                      <form
                        className="flex flex-1 items-center gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          run(() => renameFamilyContactAction({ id: contact.id, name: editing.name }), () => setEditing(null));
                        }}
                      >
                        <input
                          aria-label={`Novo nome de ${contact.name}`}
                          value={editing.name}
                          maxLength={60}
                          autoFocus
                          onChange={(event) => setEditing({ id: contact.id, name: event.target.value })}
                          className={inputClass}
                        />
                        <button
                          type="submit"
                          aria-label="Salvar nome"
                          disabled={pending || editing.name.trim() === ""}
                          className="grid size-8 shrink-0 place-items-center rounded-md text-primary outline-none transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-40"
                        >
                          <CheckIcon aria-hidden="true" size={14} weight="bold" />
                        </button>
                        <button
                          type="button"
                          aria-label="Cancelar"
                          onClick={() => setEditing(null)}
                          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                          <XIcon aria-hidden="true" size={13} weight="bold" />
                        </button>
                      </form>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">{contact.name}</span>
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          {count} {count === 1 ? "lançamento" : "lançamentos"}
                        </span>
                        <button
                          type="button"
                          aria-label={`Renomear ${contact.name}`}
                          onClick={() => setEditing({ id: contact.id, name: contact.name })}
                          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                          <PencilSimpleIcon aria-hidden="true" size={14} weight="bold" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Excluir ${contact.name}`}
                          title={count > 0 ? "Só pessoas sem lançamentos podem ser excluídas" : undefined}
                          disabled={pending || count > 0}
                          onClick={() => run(() => deleteFamilyContactAction({ id: contact.id }))}
                          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-30"
                        >
                          <TrashIcon aria-hidden="true" size={14} />
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <form
            className="space-y-2 border-t border-border/70 px-5 py-4 sm:px-6"
            onSubmit={(event) => {
              event.preventDefault();
              run(() => createFamilyContactAction({ name: newName }), () => setNewName(""));
            }}
          >
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2">
              <input
                aria-label="Nome da nova pessoa"
                value={newName}
                maxLength={60}
                placeholder="Nova pessoa"
                onChange={(event) => setNewName(event.target.value)}
                className={cn(inputClass, "flex-1")}
              />
              <button type="submit" disabled={pending || newName.trim() === ""} className={primaryButtonClass}>
                <PlusIcon aria-hidden="true" size={13} weight="bold" />
                Incluir
              </button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
