"use client";

import { useEffect, useState } from "react";

import { Picker } from "@/components/ui/picker";
import { formatBrl } from "@/modules/portfolio/presentation/portfolio-format";
import type { TreasuryCatalogBond } from "@/modules/quotes/domain/treasury";

// O catálogo oficial é um arquivo grande do Tesouro, e a primeira carga leva
// alguns segundos. A consulta começa ao escolher o tipo Tesouro Direto
// (`prefetchTreasuryCatalog`) e é compartilhada com a lista; uma falha não fica
// guardada, e "Tentar novamente" consulta de novo.
let catalogRequest: Promise<TreasuryCatalogBond[]> | null = null;
let requestedAt = 0;
/** Como o cache do servidor: depois disso, a lista consulta preços novos. */
const CATALOG_TTL_MS = 30 * 60 * 1000;

export function prefetchTreasuryCatalog() {
  if (catalogRequest && Date.now() - requestedAt > CATALOG_TTL_MS) {
    catalogRequest = null;
  }

  requestedAt = catalogRequest ? requestedAt : Date.now();
  catalogRequest ??= fetch("/api/quotes/treasury-catalog")
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.bonds)) throw new Error("Catálogo indisponível");
      return data.bonds as TreasuryCatalogBond[];
    })
    .catch((error) => {
      catalogRequest = null;
      throw error;
    });
  return catalogRequest;
}

/** Escolha por tipo e vencimento exato, sem exigir um ticker inventado. */
export function TreasuryPicker({ value, onSelect }: { value: string | null; onSelect: (bond: TreasuryCatalogBond) => void }) {
  const [bonds, setBonds] = useState<TreasuryCatalogBond[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    prefetchTreasuryCatalog().then(
      (loaded) => {
        if (active) { setBonds(loaded); setError(null); }
      },
      () => {
        if (active) setError("Não foi possível carregar os títulos do Tesouro agora.");
      },
    );
    return () => { active = false; };
  }, [attempt]);

  const selected = bonds?.find((bond) => bond.symbol === value);
  return <div className="space-y-2">
    <Picker
      aria-label="Título do Tesouro"
      placeholder={bonds ? "Escolha tipo e vencimento" : "Carregando títulos…"}
      emptyMessage={bonds ? "Nenhum título com esse nome" : "Carregando os títulos do Tesouro…"}
      value={value}
      options={(bonds ?? []).map((bond) => ({ value: bond.symbol, label: bond.name, hint: formatBrl(bond.valueBrl) }))}
      onValueChange={(symbol) => { const bond = bonds?.find((entry) => entry.symbol === symbol); if (bond) onSelect(bond); }}
    />
    {selected ? <p className="text-[11px] leading-5 text-muted-foreground">Preço de mercado de {selected.quoteDate.split("-").reverse().join("/")}. O valor da posição varia com a cotação oficial; não é a projeção de retorno no vencimento.</p> : null}
    {bonds?.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum título com preço oficial disponível.</p> : null}
    {error ? <p role="alert" className="text-xs text-destructive">{error} <button type="button" onClick={() => { setError(null); setAttempt((value) => value + 1); }} className="underline">Tentar novamente</button></p> : null}
  </div>;
}
