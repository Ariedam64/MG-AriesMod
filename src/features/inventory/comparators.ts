// Sorting inventory items by one key. Ties, and items the key says nothing
// about, fall back to name, then type, then id.

import { rarityRank } from "../../data";
import {
  getInventoryItemMutations,
  getInventoryItemName,
  getInventoryItemQuantity,
  getInventoryItemRarity,
  getInventoryItemSize,
} from "./itemInfo";
import { getPetStrength } from "./petStrength";
import type { SortDirection, SortKey } from "./sortOptions";

const compareText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
const stringField = (item: any, field: string): string => (typeof item?.[field] === "string" ? item[field] : "");

function compareByNameThenTypeThenId(a: any, b: any): number {
  const nameA = getInventoryItemName(a);
  const nameB = getInventoryItemName(b);
  if (nameA && nameB) {
    const cmp = compareText(nameA, nameB);
    if (cmp !== 0) return cmp;
  }
  if (!nameA && nameB) return 1;
  if (nameA && !nameB) return -1;
  return compareText(stringField(a, "itemType"), stringField(b, "itemType")) || compareText(stringField(a, "id"), stringField(b, "id"));
}

/**
 * Compares by a number that some items lack. In ascending order the items
 * without one come first, in descending order last.
 */
function byOptionalNumber(read: (item: any) => number | null, isDesc: boolean) {
  return (a: any, b: any): number => {
    const va = read(a);
    const vb = read(b);
    const hasA = typeof va === "number" && Number.isFinite(va);
    const hasB = typeof vb === "number" && Number.isFinite(vb);
    if (hasA && hasB && va !== vb) return isDesc ? vb - va : va - vb;
    if (hasA && !hasB) return isDesc ? -1 : 1;
    if (!hasA && hasB) return isDesc ? 1 : -1;
    return compareByNameThenTypeThenId(a, b);
  };
}

const ownValue = (item: any): number | null => (typeof item?.value === "number" ? item.value : null);

const sortedMutationLabel = (mutations: string[]) => mutations.slice().sort(compareText).join("\u0000");

function comparatorFor(sortKey: SortKey, isDesc: boolean): ((a: any, b: any) => number) | null {
  const directed = (cmp: number) => (isDesc ? -cmp : cmp);
  switch (sortKey) {
    case "alpha":
      return (a, b) => directed(compareByNameThenTypeThenId(a, b));
    case "qty":
      return (a, b) => {
        const diff = getInventoryItemQuantity(a) - getInventoryItemQuantity(b);
        return diff !== 0 ? directed(diff) : compareByNameThenTypeThenId(a, b);
      };
    case "rarity":
      return (a, b) => {
        const rarityA = getInventoryItemRarity(a);
        const rarityB = getInventoryItemRarity(b);
        const rankA = rarityRank(rarityA);
        const rankB = rarityRank(rarityB);
        if (rankA !== rankB) return directed(rankA - rankB);
        return compareText(rarityA, rarityB) || compareByNameThenTypeThenId(a, b);
      };
    case "value":
      return byOptionalNumber(ownValue, isDesc);
    case "size":
      return byOptionalNumber(getInventoryItemSize, isDesc);
    case "strength":
      return byOptionalNumber(getPetStrength, isDesc);
    case "mutations":
      return (a, b) => {
        const mutationsA = getInventoryItemMutations(a);
        const mutationsB = getInventoryItemMutations(b);
        if (mutationsA.length !== mutationsB.length) return directed(mutationsA.length - mutationsB.length);
        if (mutationsA.length > 0) {
          const cmp = compareText(sortedMutationLabel(mutationsA), sortedMutationLabel(mutationsB));
          if (cmp !== 0) return cmp;
        }
        return compareByNameThenTypeThenId(a, b);
      };
    default:
      return null;
  }
}

/** A sorted copy of `items`; "none" keeps their order. */
export function sortInventoryItems(items: any[], sortKey: SortKey, direction: SortDirection): any[] {
  const sorted = items.slice();
  const comparator = comparatorFor(sortKey, direction === "desc");
  if (comparator) sorted.sort(comparator);
  return sorted;
}
