"use client";

import { useEffect, useState } from "react";

import { Picker } from "@/components/ui/picker";
import { formatBrl } from "@/modules/portfolio/presentation/portfolio-format";
import type { TreasuryCatalogBond } from "@/modules/quotes/domain/treasury";

/** Escolha por tipo e vencimento exato, sem exigir um ticker inventado. */
export function TreasuryPicker({ value, onSelect }: { value: string | null; onSelect: (bond: TreasuryCatalogBond) => void }) {
  const [bonds, setBonds] = useState<TreasuryCatalogBond[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/quotes/treasury-catalog", { signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.bonds)) throw new Error("Catálogo indisponível");
        if (!controller.signal.aborted) { setBonds(data.bonds); setError(null); }
      } catch {
        if (!controller.signal.aborted) setError("Não foi possível carregar os títulos do Tesouro agora.");
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);

  const selected = bonds?.find((bond) => bond.symbol === value);
  return <div className="space-y-2">
    <Picker
      aria-label="Título do Tesouro"
      placeholder={bonds ? "Escolha tipo e vencimento" : "Carregando títulos…"}
      value={value}
      options={(bonds ?? []).map((bond) => ({ value: bond.symbol, label: bond.name, hint: formatBrl(bond.valueBrl) }))}
      onValueChange={(symbol) => { const bond = bonds?.find((entry) => entry.symbol === symbol); if (bond) onSelect(bond); }}
    />
    {selected ? <p className="text-[11px] leading-5 text-muted-foreground">Preço de mercado de {selected.quoteDate.split("-").reverse().join("/")}. O valor da posição varia com a cotação oficial; não é a projeção de retorno no vencimento.</p> : null}
    {bonds?.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum título com preço oficial disponível.</p> : null}
    {error ? <p role="alert" className="text-xs text-destructive">{error} <button type="button" onClick={() => setAttempt((value) => value + 1)} className="underline">Tentar novamente</button></p> : null}
  </div>;
}
