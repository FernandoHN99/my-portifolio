"use client";

import { ArchiveIcon, PlusIcon, WalletIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { headerPrimaryButtonClass } from "@/modules/portfolio/ui/edit-dialogs";

const secondaryClass =
  "inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card/70 px-3.5 text-xs font-semibold text-foreground outline-none transition-colors hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * Carteira sem posições, como a de um usuário novo (spec 055): as duas portas
 * de entrada ficam logo na tela, incluir a primeira posição ou restaurar um
 * backup exportado do aplicativo. Em Posições, incluir abre o formulário ali
 * mesmo; nas outras telas, leva a Posições com o formulário aberto.
 */
export function EmptyPortfolio({
  title = "Sua carteira está vazia",
  onAdd,
  adding = false,
}: {
  title?: string;
  /** Sem ele, "Adicionar posição" é um link para Posições. */
  onAdd?: () => void;
  adding?: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-center justify-center px-5 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-2xl border border-border bg-card text-primary">
        <WalletIcon aria-hidden="true" size={22} weight="duotone" />
      </span>
      <h1 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Comece pela primeira posição ou restaure um backup exportado do aplicativo.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {onAdd ? (
          <button type="button" onClick={onAdd} disabled={adding} className={headerPrimaryButtonClass}>
            <PlusIcon aria-hidden="true" size={14} weight="bold" />
            {adding ? "Preparando…" : "Adicionar posição"}
          </button>
        ) : (
          <Link href="/posicoes?incluir=1" className={headerPrimaryButtonClass}>
            <PlusIcon aria-hidden="true" size={14} weight="bold" />
            Adicionar posição
          </Link>
        )}
        <Link href="/configuracao#backup" className={secondaryClass}>
          <ArchiveIcon aria-hidden="true" className="text-primary" size={16} weight="duotone" />
          Restaurar backup
        </Link>
      </div>
    </div>
  );
}
