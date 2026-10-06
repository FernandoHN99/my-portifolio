"use client";

import { Dialog } from "@base-ui/react/dialog";
import { CalendarPlusIcon } from "@phosphor-icons/react/dist/ssr";

import { confirmRollover, dismissRollover, type PendingRollover } from "@/components/product/quote-refresh-client";
import { formatMonth, formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";
import { parseMonthParam } from "@/modules/portfolio/presentation/reference-month";
import {
  backdropClass,
  centeredPopupClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/modules/portfolio/ui/edit-dialogs";

const listFormat = new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" });

function compact(month: string) {
  const date = parseMonthParam(month);
  return date ? formatMonthCompact(date) : month;
}

/**
 * Confirmação da virada de mês (spec 078): o app não cria mais a competência
 * sozinho ao abrir. Ele pergunta, e só cria depois do "Criar". "Agora não"
 * deixa para depois; o botão de criar o mês, em Posições, continua disponível.
 */
export function MonthRolloverPrompt({
  pending,
  creating,
  onDataChanged,
}: {
  pending: PendingRollover | null;
  creating: boolean;
  onDataChanged: () => void;
}) {
  const months = pending?.months ?? [];
  const first = months[0] ? parseMonthParam(months[0]) : null;
  const single = months.length === 1;

  return (
    <Dialog.Root
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open && !creating) {
          dismissRollover();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup className={centeredPopupClass} data-testid="month-rollover-prompt">
          {pending ? (
            <>
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <CalendarPlusIcon aria-hidden="true" size={18} weight="duotone" />
                </span>
                <div className="min-w-0">
                  <Dialog.Title className="text-base font-semibold tracking-[-0.02em]">
                    {single && first
                      ? `Começar ${formatMonth(first).toLocaleLowerCase("pt-BR")}?`
                      : `Criar ${months.length} competências?`}
                  </Dialog.Title>
                  <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
                    {single
                      ? `As posições e os rateios de ${compact(pending.latestMonth)} passam para ${compact(months[0])}, e ${compact(pending.latestMonth)} fica fechado.`
                      : `${listFormat.format(months.map(compact))}, cada uma a partir da anterior, desde ${compact(pending.latestMonth)}. Os meses anteriores ficam fechados.`}
                  </Dialog.Description>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Dialog.Close className={secondaryButtonClass} disabled={creating}>
                  Agora não
                </Dialog.Close>
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => void confirmRollover(onDataChanged)}
                  className={primaryButtonClass}
                >
                  {creating ? "Criando…" : single ? `Criar ${compact(months[0])}` : "Criar"}
                </button>
              </div>
            </>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
