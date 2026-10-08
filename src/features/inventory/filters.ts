// The game's inventory filters and search box, read from its DOM, and the
// inventory items they leave on screen.
//
// Which item types a filter context actually shows is remembered, so the sort
// options can follow it; listeners hear when a context's types change.

import { Emitter } from "../../lib/emitter";
import { itemMatchesSearch, itemTypeOf, normalize } from "./itemInfo";
import { FILTER_LABEL_TO_ITEM_TYPES } from "./sortOptions";
import { computeInventoryItemValue, playersInRoomForValues } from "./value";

const FILTER_CHECKBOX_SELECTOR = "label.chakra-checkbox.css-1v6h4z7";
const FILTER_CHECKBOX_LABEL_SELECTOR = ".chakra-checkbox__label";
const SEARCH_INPUT_SELECTOR = "input.chakra-input.css-8e1l1i";

const isChecked = (el: Element): boolean => el.matches("[data-checked]") || !!el.querySelector("[data-checked]");

/** The labels of the ticked filter checkboxes. */
export function getActiveFilters(grid: Element): string[] {
  return Array.from(grid.querySelectorAll(FILTER_CHECKBOX_SELECTOR))
    .filter(isChecked)
    .map((label) => (label.querySelector(FILTER_CHECKBOX_LABEL_SELECTOR)?.textContent ?? "").trim())
    .filter(Boolean);
}

/** The search box text, trimmed and lowercased. */
export function getSearchQuery(grid: Element | null): string {
  const input = grid?.querySelector<HTMLInputElement>(SEARCH_INPUT_SELECTOR);
  return normalize(typeof input?.value === "string" ? input.value : "");
}

/** One key per filters and search combination, whatever the order the filters were ticked in. */
export function filterContextKey(filters: readonly string[], search: string): string {
  const keys = filters.map(normalize).filter((value) => value && value !== "all");
  keys.sort();
  return `${keys.join("|")}::${normalize(search)}`;
}

const shownTypesByContext = new Map<string, ReadonlySet<string>>();
const shownTypesChanged = new Emitter<string>();

export const onShownItemTypesChange = (listener: (contextKey: string) => void) => shownTypesChanged.on(listener);

export const shownItemTypes = (filters: readonly string[], search: string): ReadonlySet<string> | null =>
  shownTypesByContext.get(filterContextKey(filters, search)) ?? null;

function rememberShownTypes(contextKey: string, types: Set<string>): void {
  const next = new Set([...types].map(normalize).filter(Boolean));
  const previous = shownTypesByContext.get(contextKey);
  if (previous && previous.size === next.size && [...previous].every((type) => next.has(type))) return;
  shownTypesByContext.set(contextKey, next);
  shownTypesChanged.emit(contextKey);
}

/** "Seeds" and "seed" both mean Seed; an unknown label is read as an item type. */
function filterLabelToItemTypes(filter: string): string[] {
  const key = normalize(filter);
  if (!key || key === "all") return [];
  const mapped = FILTER_LABEL_TO_ITEM_TYPES[key];
  if (mapped) return mapped;
  const singular = key.endsWith("s") ? key.slice(0, -1) : key;
  return singular ? [singular.charAt(0).toUpperCase() + singular.slice(1)] : [];
}

/**
 * The items the game shows for these filters and this search, in inventory
 * order, each given its coin `value`. No recognised filter means every type.
 */
export function filterInventoryItems(items: any[], filters: string[], searchQuery: string): any[] {
  const itemTypes = new Set(filters.flatMap(filterLabelToItemTypes).filter(Boolean));
  const byType = itemTypes.size ? items.filter((item) => itemTypes.has(itemTypeOf(item))) : items.slice();

  const search = normalize(searchQuery);
  const shown = search ? byType.filter((item) => itemMatchesSearch(item, search)) : byType;

  // The value goes on the item itself: the comparators and the card badges read it there.
  const playersInRoom = playersInRoomForValues();
  for (const item of shown) {
    if (item && typeof item === "object") item.value = computeInventoryItemValue(item, { playersInRoom }) ?? null;
  }

  const types = new Set(shown.map(itemTypeOf).filter(Boolean));
  rememberShownTypes(filterContextKey(filters, search), types);
  return shown;
}
