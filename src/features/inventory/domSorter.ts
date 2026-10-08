// Reorders the game's item cards to match a sort, and refreshes each card's
// value badge and strength line on the way.
//
// The cards carry no item id, so they are matched to inventory items by
// position: the filtered inventory, in inventory order, lines up with the
// unsorted card list. Each card is tagged with that position (its base index)
// the first time, and later sorts move cards by it.

import { Atoms } from "../../game/store/atoms";
import { sortInventoryItems } from "./comparators";
import { filterInventoryItems, getActiveFilters, getSearchQuery } from "./filters";
import {
  assignBaseIndexes,
  getDomEntries,
  getItemsContainer,
  readBaseIndex,
  type DomEntry,
} from "./inventoryDom";
import { getInventoryItemValue } from "./itemInfo";
import { DEFAULT_DIRECTION, isSortDirection, type SortDirection, type SortKey } from "./sortOptions";
import { alignStrengthText, updateStrengthText } from "./strengthBadge";
import { updateCardValue } from "./valueDisplay";

interface SortState {
  filtersKey: string;
  searchQuery: string;
  entryCount: number;
  /** The filtered items in unsorted order: item `i` is the card with base index `i`. */
  baseItems: any[];
  entryByBaseIndex: Map<number, DomEntry>;
  lastSortKey: SortKey | null;
}

export type DomSorter = (grid: Element, sortKey: SortKey, direction: SortDirection, showValues: boolean) => Promise<void>;

function indexEntries(state: SortState, entries: DomEntry[]): void {
  state.entryByBaseIndex.clear();
  for (const entry of entries) {
    const baseIndex = readBaseIndex(entry);
    if (baseIndex != null) state.entryByBaseIndex.set(baseIndex, entry);
  }
}

/**
 * With no sort, the game's own order is the base: when the cards moved
 * since (the game reordered them), the base follows. False when nothing moved
 * or the cards cannot be matched.
 */
function rebaseToDomOrder(state: SortState, entries: DomEntry[]): boolean {
  if (entries.length !== state.baseItems.length) return false;
  const used = new Set<number>();
  const reordered: any[] = [];
  for (const entry of entries) {
    const baseIndex = readBaseIndex(entry);
    if (baseIndex == null || baseIndex < 0 || baseIndex >= state.baseItems.length || used.has(baseIndex)) return false;
    used.add(baseIndex);
    reordered.push(state.baseItems[baseIndex]);
  }
  if (reordered.every((item, i) => item === state.baseItems[i])) return false;

  state.baseItems = reordered;
  assignBaseIndexes(entries);
  state.entryByBaseIndex.clear();
  entries.forEach((entry, index) => state.entryByBaseIndex.set(index, entry));
  state.entryCount = entries.length;
  return true;
}

export function createDomSorter(): DomSorter {
  const stateByGrid = new WeakMap<Element, SortState>();

  /** The grid's sort state, rebuilt from the inventory whenever the filters, search or cards changed. */
  async function ensureState(grid: Element, filters: string[], entries: DomEntry[], searchQuery: string): Promise<SortState | null> {
    const filtersKey = JSON.stringify({ filters });
    const state = stateByGrid.get(grid);
    const reusable =
      state &&
      state.filtersKey === filtersKey &&
      state.searchQuery === searchQuery &&
      state.entryCount === entries.length &&
      state.baseItems.length === entries.length &&
      entries.every((entry) => readBaseIndex(entry) != null);

    if (state && reusable) {
      indexEntries(state, entries);
      return state;
    }

    try {
      const inventory = await Atoms.inventory.myInventory.get();
      if (!inventory || typeof inventory !== "object") return null;
      const items = Array.isArray((inventory as any).items) ? (inventory as any).items : [];
      const shown = filterInventoryItems(items, filters, searchQuery);
      if (shown.length !== entries.length) {
        console.warn(`[InventorySorting] ${shown.length} filtered items but ${entries.length} cards, not reordering.`);
        return null;
      }

      assignBaseIndexes(entries);
      const next: SortState = {
        filtersKey,
        searchQuery,
        entryCount: entries.length,
        baseItems: shown.slice(),
        entryByBaseIndex: new Map(entries.map((entry, index) => [index, entry])),
        lastSortKey: state?.lastSortKey ?? null,
      };
      stateByGrid.set(grid, next);
      return next;
    } catch (error) {
      console.warn("[InventorySorting] Could not read the inventory to sort the cards", error);
      return null;
    }
  }

  return async (grid, sortKey, direction, showValues) => {
    const container = getItemsContainer(grid);
    if (!container) return;
    const entries = getDomEntries(container);
    if (!entries.length) return;

    const state = await ensureState(grid, getActiveFilters(grid), entries, getSearchQuery(grid));
    if (!state) return;

    const unsorted = !sortKey || sortKey === "none";
    if (unsorted && state.lastSortKey === "none") rebaseToDomOrder(state, entries);

    const baseIndexByItem = new Map<any, number>(state.baseItems.map((item, index) => [item, index]));
    const effectiveDirection = isSortDirection(direction) ? direction : DEFAULT_DIRECTION[sortKey] ?? "asc";
    const desiredItems = unsorted ? state.baseItems.slice() : sortInventoryItems(state.baseItems, sortKey, effectiveDirection);

    const desiredEntries: DomEntry[] = [];
    const used = new Set<DomEntry>();
    for (const item of desiredItems) {
      const baseIndex = baseIndexByItem.get(item);
      const entry = baseIndex == null ? undefined : state.entryByBaseIndex.get(baseIndex);
      if (!entry || used.has(entry)) continue;
      updateCardValue(entry.card, getInventoryItemValue(item), showValues);
      updateStrengthText(entry.card, item);
      alignStrengthText(entry.card);
      desiredEntries.push(entry);
      used.add(entry);
    }

    if (desiredEntries.length !== entries.length) {
      console.warn(`[InventorySorting] Only ${desiredEntries.length} of ${entries.length} cards matched, not reordering.`);
      return;
    }

    if (!desiredEntries.every((entry, index) => entry.wrapper === entries[index]?.wrapper)) {
      const fragment = document.createDocumentFragment();
      for (const entry of desiredEntries) fragment.appendChild(entry.wrapper);
      container.appendChild(fragment);
    }

    indexEntries(state, desiredEntries);
    state.lastSortKey = sortKey;
  };
}
