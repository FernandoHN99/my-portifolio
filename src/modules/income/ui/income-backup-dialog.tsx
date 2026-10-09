"use client";

import { Dialog } from "@base-ui/react/dialog";
import {
  CircleNotchIcon,
  DownloadSimpleIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent } from "react";

import { showAppToast } from "@/components/product/app-toaster";
import { formatCompetence } from "@/lib/competence";
import {
  INCOME_BACKUP_TABLES,
  type IncomeBackupPreview,
  type IncomeRestoreResponse,
} from "@/modules/income/domain/income-backup-format";
import { backdropClass, primaryButtonClass, secondaryButtonClass } from "@/modules/portfolio/ui/edit-dialogs";
import { formatRefreshDateTime } from "@/modules/quotes/presentation/refresh-time";

// Backup de Recebimentos (spec 092): exporta e importa só os meses, os
// holerites e as horas extras (spec 098), num arquivo próprio. A importação confere o arquivo, mostra o que
// ele traz ao lado dos dados de hoje e só substitui os recebimentos depois da
// confirmação; a carteira e Gastos familiares não mudam.

const popupClass =
  "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-1.5rem)] w-[min(460px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0";

const count = (value: number) => value.toLocaleString("pt-BR");

async function postRestore(mode: "check" | "apply", backup: unknown): Promise<IncomeRestoreResponse> {
  try {
    const response = await fetch("/api/recebimentos/backup/restore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, backup }),
    });
    return (await response.json()) as IncomeRestoreResponse;
  } catch {
    return { state: "invalid", message: "Não foi possível falar com o aplicativo. Tente de novo." };
  }
}

export function IncomeBackupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"checking" | "restoring" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ backup: unknown; preview: IncomeBackupPreview } | null>(null);

  const close = (next: boolean) => {
    if (busy === "restoring") return;
    if (!next) {
      setPending(null);
      setError(null);
    }
    onOpenChange(next);
  };

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setError(null);
    setBusy("checking");

    let backup: unknown;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      setBusy(null);
      setError(`${file.name} não é um arquivo de backup válido.`);
      return;
    }

    const result = await postRestore("check", backup);
    setBusy(null);

    if (result.state === "checked") {
      setPending({ backup, preview: result.preview });
    } else {
      setError(result.state === "invalid" ? result.message : "Resposta inesperada do aplicativo.");
    }
  }

  async function restore() {
    if (!pending) return;

    setBusy("restoring");
    const result = await postRestore("apply", pending.backup);
    setBusy(null);

    if (result.state === "restored") {
      showAppToast({
        tone: "success",
        title: "Recebimentos importados",
        description: `${count(result.counts.incomeMonths)} meses e ${count(result.counts.incomePayslips)} holerites.`,
      });
      setPending(null);
      onOpenChange(false);
      router.refresh();
    } else {
      setError(result.state === "invalid" ? result.message : "Resposta inesperada do aplicativo.");
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup className={popupClass} data-testid="income-backup-dialog">
          <header className="flex items-start gap-4 border-b border-border/70 px-5 pt-5 pb-4 sm:px-6">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold tracking-[-0.02em]">
                {pending ? "Importar este backup?" : "Backup dos recebimentos"}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-muted-foreground">
                {pending
                  ? `Exportado em ${formatRefreshDateTime(pending.preview.exportedAt)}${
                      pending.preview.firstMonth && pending.preview.lastMonth
                        ? `, de ${formatCompetence(pending.preview.firstMonth)} a ${formatCompetence(pending.preview.lastMonth)}`
                        : ""
                    }. Os recebimentos de hoje serão substituídos; as outras áreas não mudam.`
                  : "Arquivo só com os meses, os holerites e as horas extras desta área."}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Fechar"
              disabled={busy === "restoring"}
              className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <XIcon aria-hidden="true" size={14} weight="bold" />
            </Dialog.Close>
          </header>

          <div className="space-y-4 px-5 py-4 sm:px-6">
            {pending ? (
              <table className="w-full text-left text-xs" data-testid="income-backup-summary">
                <thead>
                  <tr className="text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
                    <th className="py-1.5 font-semibold">Dados</th>
                    <th className="py-1.5 text-right font-semibold">Hoje</th>
                    <th className="py-1.5 text-right font-semibold">No backup</th>
                  </tr>
                </thead>
                <tbody>
                  {INCOME_BACKUP_TABLES.map(({ key, label }) => (
                    <tr key={key} className="border-t border-border/60">
                      <td className="py-1.5 text-foreground/85">{label}</td>
                      <td className="py-1.5 text-right font-mono text-muted-foreground tabular-nums">
                        {count(pending.preview.current[key])}
                      </td>
                      <td className="py-1.5 text-right font-mono text-foreground tabular-nums">{count(pending.preview.file[key])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-wrap gap-2">
                <a href="/api/recebimentos/backup" download className={primaryButtonClass}>
                  <UploadSimpleIcon aria-hidden="true" size={14} weight="bold" />
                  Exportar backup
                </a>
                <button
                  type="button"
                  className={secondaryButtonClass}
                  disabled={busy !== null}
                  onClick={() => input.current?.click()}
                >
                  {busy === "checking" ? (
                    <CircleNotchIcon aria-hidden="true" className="mr-2 animate-spin" size={14} weight="bold" />
                  ) : (
                    <DownloadSimpleIcon aria-hidden="true" className="mr-2" size={14} weight="bold" />
                  )}
                  {busy === "checking" ? "Conferindo arquivo…" : "Importar backup"}
                </button>
                <input
                  ref={input}
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Arquivo de backup dos recebimentos"
                  onChange={chooseFile}
                />
              </div>
            )}

            {pending?.preview.warnings?.map((message) => (
              <p key={message} className="text-xs leading-5 text-muted-foreground">{message}</p>
            ))}

            {error ? (
              <p role="alert" className="flex items-start gap-2 text-xs leading-5 text-destructive">
                <WarningCircleIcon aria-hidden="true" className="mt-0.5 shrink-0" size={14} weight="fill" />
                {error}
              </p>
            ) : null}
          </div>

          {pending ? (
            <footer className="flex justify-end gap-2 border-t border-border/70 px-5 py-4 sm:px-6">
              <button type="button" className={secondaryButtonClass} disabled={busy === "restoring"} onClick={() => setPending(null)}>
                Voltar
              </button>
              <button type="button" className={primaryButtonClass} disabled={busy === "restoring"} onClick={restore}>
                {busy === "restoring" ? <CircleNotchIcon aria-hidden="true" className="animate-spin" size={14} weight="bold" /> : null}
                {busy === "restoring" ? "Importando…" : "Importar"}
              </button>
            </footer>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
