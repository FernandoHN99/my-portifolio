"use client";

import { Collapsible } from "@base-ui/react/collapsible";
import { CaretRightIcon } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

/**
 * Quadro recolhível da página da posição (spec 075): começa fechado, e a seta
 * abre os detalhes quando o usuário quiser. Fechado, o conteúdo sai da página:
 * o `hidden="until-found"` deixava o conteúdo à vista no Safari do iPhone.
 */
export function CollapsibleSection({
  id,
  title,
  summary,
  icon,
  testId,
  children,
}: {
  id: string;
  title: string;
  /** Resumo ao lado do título, visível mesmo fechado. */
  summary?: ReactNode;
  icon?: ReactNode;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <Collapsible.Root className="premium-panel mt-6 overflow-hidden rounded-[24px]" data-testid={testId}>
      <h2 id={`${id}-title`} className="m-0">
        {/* A seta fica à esquerda, como nas linhas da tabela de Posições (spec 078). */}
        <Collapsible.Trigger className="group flex w-full items-center gap-2.5 px-5 py-4 text-left outline-none transition-colors hover:bg-white/[0.015] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset sm:px-6">
          <span className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors group-hover:bg-white/[0.06] group-hover:text-foreground">
            <CaretRightIcon
              aria-hidden="true"
              size={12}
              weight="bold"
              className="transition-transform duration-200 ease-out group-data-panel-open:rotate-90"
            />
          </span>
          {icon}
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {summary ? <span className="text-[11px] font-normal text-muted-foreground">{summary}</span> : null}
        </Collapsible.Trigger>
      </h2>
      <Collapsible.Panel
        aria-labelledby={`${id}-title`}
        className="h-[var(--collapsible-panel-height)] overflow-hidden transition-[height] duration-200 ease-out motion-reduce:transition-none data-ending-style:h-0 data-starting-style:h-0 [&[hidden]:not([hidden='until-found'])]:hidden"
      >
        <div className="border-t border-border/60">{children}</div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
