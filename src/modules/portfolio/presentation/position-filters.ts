import type { MonthPosition } from "@/modules/portfolio/application/get-month-positions";

export const NO_CLASS = "Sem classificação";
export const NO_STRATEGY = "Sem estratégia";
export const NO_MATURITY = "Sem vencimento";
export const NO_LIQUIDITY = "Sem liquidez informada";

export type PositionFilters = {
  classes: string[];
  subclasses: string[];
  institutions: string[];
  strategies: string[];
  currencies: string[];
  /** Ano do vencimento, como "2027", ou "Sem vencimento" (spec 031). */
  maturities: string[];
  /** Prazo de liquidez do ativo, ou "Sem liquidez informada" (spec 039). */
  liquidities: string[];
  search: string;
};

export type FilterDimension =
  | "classes"
  | "subclasses"
  | "institutions"
  | "strategies"
  | "currencies"
  | "maturities"
  | "liquidities";

export const FILTER_DIMENSIONS: FilterDimension[] = [
  "classes",
  "subclasses",
  "institutions",
  "strategies",
  "currencies",
  "maturities",
  "liquidities",
];

/** Parâmetro da URL de cada filtro. */
export const FILTER_PARAMS: Record<FilterDimension, string> = {
  classes: "classe",
  subclasses: "subclasse",
  institutions: "inst",
  strategies: "estrategia",
  currencies: "moeda",
  maturities: "venc",
  liquidities: "liq",
};

export type GroupBy = "instituicao" | "classe";

export type GroupedPosition<T extends MonthPosition = MonthPosition> = {
  position: T;
  valueBrl: number;
};

export type PositionGroup<T extends MonthPosition = MonthPosition> = {
  key: string;
  label: string;
  items: GroupedPosition<T>[];
  totalBrl: number;
};

export function strategyOf(position: MonthPosition) {
  return position.strategy ?? NO_STRATEGY;
}

export function classesOf(position: MonthPosition) {
  return position.allocations.length === 0
    ? [NO_CLASS]
    : [...new Set(position.allocations.map((allocation) => allocation.assetClass))];
}

export function subclassesOf(position: MonthPosition) {
  return [...new Set(position.allocations.map((allocation) => allocation.subclass))];
}

/** Prazo de liquidez, para o filtro; "Sem liquidez informada" quando vazio. */
export function liquidityOf(position: MonthPosition) {
  return position.liquidity ?? NO_LIQUIDITY;
}

/** Ano do vencimento, para o filtro; "Sem vencimento" quando não informado. */
export function maturityOf(position: MonthPosition) {
  return position.maturityDate ? position.maturityDate.slice(0, 4) : NO_MATURITY;
}

export function hasClassFilter(filters: PositionFilters) {
  return filters.classes.length > 0 || filters.subclasses.length > 0;
}

export function filterPositions<T extends MonthPosition>(positions: T[], filters: PositionFilters): T[] {
  const search = normalize(filters.search);

  return positions.filter((position) => {
    if (filters.institutions.length > 0 && !filters.institutions.includes(position.institutionName)) {
      return false;
    }

    if (filters.strategies.length > 0 && !filters.strategies.includes(strategyOf(position))) {
      return false;
    }

    if (filters.currencies.length > 0 && !filters.currencies.includes(position.baseCurrency)) {
      return false;
    }

    if (filters.maturities.length > 0 && !filters.maturities.includes(maturityOf(position))) {
      return false;
    }

    if (filters.liquidities.length > 0 && !filters.liquidities.includes(liquidityOf(position))) {
      return false;
    }

    if (
      filters.classes.length > 0 &&
      !classesOf(position).some((assetClass) => filters.classes.includes(assetClass))
    ) {
      return false;
    }

    if (
      filters.subclasses.length > 0 &&
      !subclassesOf(position).some((subclass) => filters.subclasses.includes(subclass))
    ) {
      return false;
    }

    if (search) {
      const haystack = normalize(
        [position.assetName, position.ticker ?? "", position.institutionName].join(" "),
      );

      if (!haystack.includes(search)) {
        return false;
      }
    }

    return true;
  });
}

export function matchedValueBrl(position: MonthPosition, filters: PositionFilters) {
  if (!hasClassFilter(filters)) {
    return position.totalBrl;
  }

  if (position.allocations.length === 0) {
    return filters.classes.includes(NO_CLASS) && filters.subclasses.length === 0
      ? position.totalBrl
      : 0;
  }

  const weight = position.allocations
    .filter(
      (allocation) =>
        (filters.classes.length === 0 || filters.classes.includes(allocation.assetClass)) &&
        (filters.subclasses.length === 0 || filters.subclasses.includes(allocation.subclass)),
    )
    .reduce((total, allocation) => total + allocation.weight, 0);

  return (position.totalBrl * weight) / 100;
}

export function groupPositions<T extends MonthPosition>(
  positions: T[],
  groupBy: GroupBy,
  filters: PositionFilters,
): PositionGroup<T>[] {
  const groups = new Map<string, PositionGroup<T>>();

  const add = (label: string, item: GroupedPosition<T>) => {
    const group = groups.get(label) ?? { key: label, label, items: [], totalBrl: 0 };
    group.items.push(item);
    group.totalBrl += item.valueBrl;
    groups.set(label, group);
  };

  for (const position of positions) {
    if (groupBy === "instituicao") {
      add(position.institutionName, { position, valueBrl: position.totalBrl });
      continue;
    }

    if (position.allocations.length === 0) {
      add(NO_CLASS, { position, valueBrl: position.totalBrl });
      continue;
    }

    for (const assetClass of classesOf(position)) {
      if (filters.classes.length > 0 && !filters.classes.includes(assetClass)) {
        continue;
      }

      const weight = position.allocations
        .filter(
          (allocation) =>
            allocation.assetClass === assetClass &&
            (filters.subclasses.length === 0 || filters.subclasses.includes(allocation.subclass)),
        )
        .reduce((total, allocation) => total + allocation.weight, 0);

      if (weight > 0) {
        add(assetClass, { position, valueBrl: (position.totalBrl * weight) / 100 });
      }
    }
  }

  return [...groups.values()].sort((left, right) => right.totalBrl - left.totalBrl);
}

/**
 * Opções de cada filtro em cascata (spec 031). A prioridade é a ordem em que os
 * filtros foram aplicados (`order`): as opções de um filtro aplicado só levam
 * em conta os aplicados antes dele, e as de um filtro ainda vazio levam em
 * conta todos os aplicados. Assim, escolher a classe Caixa limita a subclasse
 * às que existem em Caixa, sem nunca chegar a "nenhuma posição". Os valores
 * já escolhidos continuam na lista, para poderem ser desmarcados. A busca
 * vale para todos.
 */
export function filterOptions(
  positions: MonthPosition[],
  filters: PositionFilters = EMPTY_FILTERS,
  order: FilterDimension[] = [],
): Record<FilterDimension, string[]> {
  const active = order.filter((dimension) => filters[dimension].length > 0);
  const options = {} as Record<FilterDimension, string[]>;

  for (const dimension of FILTER_DIMENSIONS) {
    const index = active.indexOf(dimension);
    const before = index === -1 ? active : active.slice(0, index);
    const scoped: PositionFilters = { ...EMPTY_FILTERS, search: filters.search };

    for (const other of before) {
      scoped[other] = filters[other];
    }

    const values = filterPositions(positions, scoped).flatMap((position) => facetValues(position, dimension, scoped));
    options[dimension] = [...new Set([...values, ...filters[dimension]])].sort((left, right) =>
      left.localeCompare(right, "pt-BR"),
    );
  }

  return options;
}

const EMPTY_FILTERS: PositionFilters = {
  classes: [],
  subclasses: [],
  institutions: [],
  strategies: [],
  currencies: [],
  maturities: [],
  liquidities: [],
  search: "",
};

/**
 * Valores de uma posição para um filtro. Classe e subclasse olham o rateio:
 * com a classe já filtrada, só as subclasses daquela classe contam, e o
 * contrário também.
 */
function facetValues(position: MonthPosition, dimension: FilterDimension, scoped: PositionFilters) {
  switch (dimension) {
    case "classes":
      return position.allocations.length === 0
        ? [NO_CLASS]
        : position.allocations
            .filter((allocation) => scoped.subclasses.length === 0 || scoped.subclasses.includes(allocation.subclass))
            .map((allocation) => allocation.assetClass);
    case "subclasses":
      return position.allocations
        .filter((allocation) => scoped.classes.length === 0 || scoped.classes.includes(allocation.assetClass))
        .map((allocation) => allocation.subclass);
    case "institutions":
      return [position.institutionName];
    case "strategies":
      return [strategyOf(position)];
    case "currencies":
      return [position.baseCurrency];
    case "maturities":
      return [maturityOf(position)];
    case "liquidities":
      return [liquidityOf(position)];
  }
}

/** Filtros aplicados na ordem em que aparecem na URL, a ordem de aplicação. */
export function filterOrder(params: Iterable<string>): FilterDimension[] {
  const byParam = new Map(FILTER_DIMENSIONS.map((dimension) => [FILTER_PARAMS[dimension], dimension]));
  const order: FilterDimension[] = [];

  for (const key of params) {
    const dimension = byParam.get(key);

    if (dimension && !order.includes(dimension)) {
      order.push(dimension);
    }
  }

  return order;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}
