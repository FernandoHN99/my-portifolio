"use client";

import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";
import { formatRefreshDateTime } from "@/modules/quotes/presentation/refresh-time";

function subscribeNothing() {
  return () => {};
}

// Data e hora de um instante no fuso do navegador. O servidor não conhece o
// fuso do usuário, então o texto aparece depois da hidratação, ocupando o
// mesmo espaço antes dela, como o horário do topo.
export function LocalDateTime({ iso, className }: { iso: string; className?: string }) {
  const hydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

  return (
    <time dateTime={iso} className={cn(!hydrated && "invisible", className)}>
      {hydrated ? formatRefreshDateTime(iso) : "00/00/0000 às 00:00"}
    </time>
  );
}
