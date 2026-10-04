"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { showAppToast } from "@/components/product/app-toaster";
import { refreshUnlessEditing } from "@/components/product/quote-refresh-client";
import { hasPendingChanges } from "@/components/product/unsaved-changes";
import { Button } from "@/components/ui/button";
import { devToolsEnabled } from "@/lib/dev-tools";

type DevSyncResponse = { ok: boolean; state: string; lines?: string[]; message?: string };

/** O botão e a rota só funcionam no `pnpm dev` (`devToolsEnabled`, spec 072). */
export function DevQuoteSyncButton({ className }: { className?: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  if (!devToolsEnabled()) return null;

  const sync = async () => {
    if (hasPendingChanges()) {
      showAppToast({ tone: "info", title: "Salve suas alterações primeiro", description: "Depois, atualize as cotações." });
      return;
    }
    setRunning(true);
    try {
      const response = await fetch("/api/quotes/dev-sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const body = await response.json() as DevSyncResponse;
      if (!response.ok && !body.lines) throw new Error(body.message ?? "O aplicativo não conseguiu atualizar as cotações.");
      showAppToast({
        tone: body.ok ? "success" : "warning",
        title: body.state === "busy" ? "Atualização já em andamento" : body.ok ? "Atualização local concluída" : "Atualização concluída com avisos",
        description: body.message,
        data: { items: body.lines?.map((line) => ({ label: line })) },
      });
      refreshUnlessEditing(() => router.refresh());
    } catch (error) {
      showAppToast({ tone: "error", title: "Não foi possível atualizar as cotações", description: error instanceof Error ? error.message : "Tente novamente." });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Button variant="outline" onClick={() => void sync()} disabled={running} className={className}>
      <ArrowClockwiseIcon aria-hidden="true" className={running ? "animate-spin motion-reduce:animate-none" : undefined} />
      {running ? "Atualizando…" : "Atualizar cotações (dev)"}
    </Button>
  );
}
