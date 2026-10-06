import {
  UNCLASSIFIED_LABEL,
  type AllocationAggregates,
  type AllocationGroupKey,
} from "@/modules/portfolio/domain/rebalance";

// Metas padrão (spec 048): quando não existe plano de metas, como num banco
// novo ou depois de restaurar um backup sem metas, o aplicativo cria um plano
// com as categorias que a carteira tem e divide cada grupo em partes iguais.
// Não é uma recomendação de alocação: é o ponto de partida para o usuário
// ajustar na configuração. Os percentuais são inteiros e cada grupo soma
// exatamente 100%; o ponto que sobra da divisão vai para as categorias de
// maior valor.

export const DEFAULT_TARGET_PLAN_NAME = "Metas padrão";

export type DefaultTarget = {
  key: string;
  scope: AllocationGroupKey;
  primaryLabel: string;
  secondaryLabel: string | null;
  percent: number;
};

type Category = { primary: string; secondary: string | null; value: number };

export function buildDefaultTargets(aggregates: AllocationAggregates): DefaultTarget[] {
  const flat = (entries: { label: string; value: number }[]) =>
    entries
      .filter((entry) => entry.label !== UNCLASSIFIED_LABEL)
      .map((entry): Category => ({ primary: entry.label, secondary: null, value: entry.value }));

  const classCurrency = new Map<string, Category[]>();
  for (const entry of aggregates.classCurrency) {
    if (entry.secondary === null) {
      continue;
    }
    classCurrency.set(entry.primary, [
      ...(classCurrency.get(entry.primary) ?? []),
      { primary: entry.primary, secondary: entry.secondary, value: entry.value },
    ]);
  }

  const targets = [
    ...split("ASSET_CLASS", flat(aggregates.assetClass)),
    ...split("CURRENCY", flat(aggregates.currency)),
    ...split("STRATEGY", flat(aggregates.strategy)),
    // A moeda dentro de cada classe soma 100% por classe.
    ...[...classCurrency.values()].flatMap((entries) => split("CLASS_CURRENCY", entries)),
    ...split(
      "FIXED_INCOME",
      aggregates.fixedIncome.map((entry) => ({ primary: entry.primary, secondary: entry.secondary, value: entry.value })),
    ),
    ...split(
      "VARIABLE_INCOME",
      aggregates.variableIncome.map((entry) => ({ primary: entry.primary, secondary: null, value: entry.value })),
    ),
  ];

  // Rótulos que só diferem em acento ou maiúscula dariam a mesma chave, que é
  // única no plano.
  const used = new Set<string>();
  return targets.map((target) => {
    let key = target.key;
    for (let suffix = 2; used.has(key); suffix += 1) {
      key = `${target.key}-${suffix}`;
    }
    used.add(key);
    return { ...target, key };
  });
}

function split(scope: AllocationGroupKey, categories: Category[]): DefaultTarget[] {
  if (categories.length === 0) {
    return [];
  }

  const ordered = [...categories].sort(
    (left, right) =>
      right.value - left.value ||
      left.primary.localeCompare(right.primary, "pt-BR") ||
      (left.secondary ?? "").localeCompare(right.secondary ?? "", "pt-BR"),
  );
  const base = Math.floor(100 / ordered.length);
  const remainder = 100 - base * ordered.length;

  return ordered.map((category, index) => ({
    key: targetKey(scope, category.primary, category.secondary),
    scope,
    primaryLabel: category.primary,
    secondaryLabel: category.secondary,
    percent: base + (index < remainder ? 1 : 0),
  }));
}

/**
 * Metas de renda fixa que a matriz sempre mostra (spec 079): cada subclasse da
 * lista fixa, inclusive o prefixado, em cada prazo. As que o plano não tem
 * aparecem com 0% e entram no plano ao salvar.
 */
export function fixedIncomeTaxonomyTargets(subclasses: readonly string[], durations: readonly string[]) {
  return subclasses.flatMap((subclass) =>
    durations.map((duration) => ({
      key: targetKey("FIXED_INCOME", subclass, duration),
      scope: "FIXED_INCOME" as const,
      primaryLabel: subclass,
      secondaryLabel: duration,
    })),
  );
}

/** Chave da meta no plano, no formato das metas existentes: `ESCOPO:classe:moeda`. */
export function targetKey(scope: AllocationGroupKey, primaryLabel: string, secondaryLabel: string | null) {
  return [scope, normalizeTargetLabel(primaryLabel), secondaryLabel ? normalizeTargetLabel(secondaryLabel) : null]
    .filter(Boolean)
    .join(":");
}

function normalizeTargetLabel(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
