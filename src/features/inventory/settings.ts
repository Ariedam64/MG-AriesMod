// The inventory sort's remembered choices: sort key, direction, and whether
// card values show.

import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { isSortDirection, isSortKey, type SortDirection, type SortKey } from "./sortOptions";

const SORT_KEY_PATH = "inventory.sortKey";
const SORT_DIRECTION_PATH = "inventory.sortDirection";
const SHOW_VALUES_PATH = "inventory.showValues";

function read<T>(path: string, parse: (value: unknown) => T | null): T | null {
  try {
    return parse(readAriesPath<unknown>(path));
  } catch (error) {
    console.warn(`[InventorySorting] Could not read ${path}`, error);
    return null;
  }
}

function write(path: string, value: unknown): void {
  try {
    writeAriesPath(path, value);
  } catch (error) {
    console.warn(`[InventorySorting] Could not save ${path}`, error);
  }
}

export const loadSortKey = (): SortKey | null => read(SORT_KEY_PATH, (v) => (isSortKey(v) ? v : null));
export const loadSortDirection = (): SortDirection | null => read(SORT_DIRECTION_PATH, (v) => (isSortDirection(v) ? v : null));

/** Older versions stored the flag as 1/0 or as text. */
export const loadShowValues = (): boolean | null =>
  read(SHOW_VALUES_PATH, (v) => {
    if (v === true || v === 1 || v === "1" || v === "true") return true;
    if (v === false || v === 0 || v === "0" || v === "false") return false;
    return null;
  });

export function saveSort(sortKey: SortKey, direction: SortDirection): void {
  write(SORT_KEY_PATH, sortKey);
  write(SORT_DIRECTION_PATH, direction);
}

export const saveShowValues = (visible: boolean): void => write(SHOW_VALUES_PATH, visible);
