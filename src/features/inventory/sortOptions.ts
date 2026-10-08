// The sort keys, their labels and default directions, and which of them the
// current filters allow: crops add Size and Mutations, pets add Mutations and
// Strength, everything gets name, quantity, rarity and value.

import { normalize } from "./itemInfo";

export type SortKey = "none" | "alpha" | "qty" | "rarity" | "size" | "mutations" | "strength" | "value";
export type SortDirection = "asc" | "desc";
export type SortOption = { value: SortKey; label: string };

/** The order the options are listed in. */
const SORT_KEYS: SortKey[] = ["none", "alpha", "qty", "rarity", "value", "size", "mutations", "strength"];
const BASE_SORT: SortKey[] = ["alpha", "qty", "rarity", "value"];

const SORT_LABELS: Record<SortKey, string> = {
  none: "None",
  alpha: "A–Z",
  qty: "Quantity",
  rarity: "Rarity",
  value: "Values",
  size: "Size",
  mutations: "Mutations",
  strength: "Strength",
};

export const DIRECTIONS: SortDirection[] = ["asc", "desc"];
export const DIRECTION_LABELS: Record<SortDirection, string> = { asc: "Ascending", desc: "Descending" };

export const DEFAULT_DIRECTION: Record<SortKey, SortDirection> = {
  none: "asc",
  alpha: "asc",
  qty: "desc",
  rarity: "asc",
  value: "desc",
  size: "desc",
  mutations: "desc",
  strength: "desc",
};

export const isSortKey = (value: unknown): value is SortKey =>
  typeof value === "string" && (SORT_KEYS as string[]).includes(value);

export const isSortDirection = (value: unknown): value is SortDirection =>
  typeof value === "string" && (DIRECTIONS as string[]).includes(value);

/** Sorts a filter adds on top of the base ones, by filter key or item type. */
const EXTRA_SORTS: Record<string, SortKey[]> = {
  seed: [],
  tool: [],
  decor: [],
  crop: ["size", "mutations"],
  produce: ["size", "mutations"],
  plant: [],
  pet: ["mutations", "strength"],
};

/** The game's filter labels, and the item types each one shows. */
export const FILTER_LABEL_TO_ITEM_TYPES: Record<string, string[]> = {
  crop: ["Produce"],
  crops: ["Produce"],
  produce: ["Produce"],
  seed: ["Seed"],
  seeds: ["Seed"],
  plant: ["Plant"],
  plants: ["Plant"],
  pet: ["Pet"],
  pets: ["Pet"],
  tool: ["Tool"],
  tools: ["Tool"],
  decor: ["Decor"],
  decors: ["Decor"],
  decoration: ["Decor"],
  decorations: ["Decor"],
  egg: ["Egg"],
  eggs: ["Egg"],
};

/** Lowercased item type to the filter labels that show it. */
function filterKeysByItemType(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [filterKey, itemTypes] of Object.entries(FILTER_LABEL_TO_ITEM_TYPES)) {
    for (const itemType of itemTypes) {
      const type = normalize(itemType);
      if (type) map.set(type, [...(map.get(type) ?? []), filterKey]);
    }
  }
  return map;
}
const FILTER_KEYS_BY_ITEM_TYPE = filterKeysByItemType();

/** The extras for a filter label, trying its singular when the plural has none. */
function extrasForFilter(filterKey: string): SortKey[] {
  if (!filterKey) return [];
  const direct = EXTRA_SORTS[filterKey];
  if (direct?.length) return direct;
  if (filterKey.endsWith("s")) {
    const singular = EXTRA_SORTS[filterKey.slice(0, -1)];
    if (singular?.length) return singular;
  }
  return [];
}

function extrasForItemType(itemType: string): SortKey[] {
  const type = normalize(itemType);
  if (!type) return [];
  const extras = new Set<SortKey>(EXTRA_SORTS[type] ?? []);
  for (const filterKey of FILTER_KEYS_BY_ITEM_TYPE.get(type) ?? []) {
    for (const key of EXTRA_SORTS[filterKey] ?? []) extras.add(key);
  }
  return [...extras];
}

function intersect(sets: Array<Set<SortKey>>): Set<SortKey> | null {
  if (!sets.length) return null;
  return sets.reduce((acc, set) => new Set([...acc].filter((key) => set.has(key))));
}

/**
 * The sorts every active filter, and every item type actually shown, allows.
 * With nothing in common, the base sorts. "None" is always offered.
 */
export function computeSortOptions(activeFilters: string[], shownItemTypes: ReadonlySet<string> | null): SortOption[] {
  const filterSets = activeFilters
    .map((value) => normalize(value))
    .filter(Boolean)
    .map((key) => new Set<SortKey>([...BASE_SORT, ...extrasForFilter(key)]));
  const typeSets = [...(shownItemTypes ?? [])].map((type) => new Set<SortKey>([...BASE_SORT, ...extrasForItemType(type)]));

  const fromFilters = intersect(filterSets);
  const fromTypes = intersect(typeSets);
  let allowed = fromFilters && fromTypes ? intersect([fromFilters, fromTypes]) : fromFilters ?? fromTypes;
  if (!allowed?.size) allowed = new Set(BASE_SORT);

  return SORT_KEYS.filter((key) => key === "none" || allowed!.has(key)).map((value) => ({ value, label: SORT_LABELS[value] }));
}
