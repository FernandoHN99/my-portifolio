import type { MonthPosition } from "@/modules/portfolio/application/get-month-positions";

export const NO_CLASS = "Sem classificação";
export const NO_STRATEGY = "Sem estratégia";

export type PositionFilters = {
  classes: string[];
  subclasses: string[];
  institutions: string[];
  strategies: string[];
  currencies: string[];
  search: string;
};

export type GroupBy = "instituicao" | "classe";

export type GroupedPosition = {
  position: MonthPosition;
  valueBrl: number;
};

export type PositionGroup = {
  key: string;
  label: string;
  items: GroupedPosition[];
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

export function hasClassFilter(filters: PositionFilters) {
  return filters.classes.length > 0 || filters.subclasses.length > 0;
}

export function filterPositions(positions: MonthPosition[], filters: PositionFilters) {
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

export function groupPositions(
  positions: MonthPosition[],
  groupBy: GroupBy,
  filters: PositionFilters,
): PositionGroup[] {
  const groups = new Map<string, PositionGroup>();

  const add = (label: string, item: GroupedPosition) => {
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

export function filterOptions(positions: MonthPosition[]) {
  const collect = (values: string[]) =>
    [...new Set(values)].sort((left, right) => left.localeCompare(right, "pt-BR"));

  return {
    classes: collect(positions.flatMap(classesOf)),
    subclasses: collect(positions.flatMap(subclassesOf)),
    institutions: collect(positions.map((position) => position.institutionName)),
    strategies: collect(positions.map(strategyOf)),
    currencies: collect(positions.map((position) => position.baseCurrency)),
  };
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}
