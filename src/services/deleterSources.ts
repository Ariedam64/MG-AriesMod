// src/services/deleterSources.ts
//
// What the seed and decor bulk deleters can act on: the inventory stacks plus
// whatever sits in the matching storage (Seed Silo / Decor Shed).
//
// The game keys stackable items by their raw id: `species` for seeds,
// `decorId` for decor, the same value `mySelectedItemIdAtom` carries. That id
// merges the two sources and addresses every command the deleter sends
// (`Wish`, `RetrieveItemFromStorage`), so it is what an entry is keyed on.
//
// Storage items can only be deleted after they are pulled back into the
// inventory, and the inventory is capped by entry count, hence the capacity
// helpers here. Seeds and decor stack without limit (the game only caps
// `maxInventoryQuantity` for tools), so a withdrawal costs at most one entry,
// and only when that id has no stack in the inventory yet.

import { Atoms } from "../store/atoms";
import { decorCatalog, plantCatalog } from "../data";

export const SEED_STORAGE_ID = "SeedSilo";
export const DECOR_STORAGE_ID = "DecorShed";

/** Inventory entries the game allows. */
export const INVENTORY_ENTRY_LIMIT = 100;
/** Cap used while the Misc "Keep 1 slot free" guard is on. */
export const INVENTORY_ENTRY_LIMIT_GUARDED = 99;

export interface DeleterEntry {
  /** Raw game id: `species` for seeds, `decorId` for decor. */
  id: string;
  label: string;
  invQty: number;
  storeQty: number;
  total: number;
}

export interface WithdrawPlan {
  /** Units already in the inventory that the run can delete straight away. */
  fromInventory: number;
  /** Units to pull out of storage first. */
  fromStorage: number;
  /** Whether that withdrawal would occupy a new inventory entry. */
  needsNewInventoryEntry: boolean;
}

type RawItem = Record<string, unknown>;

const toQty = (value: unknown): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
};

const toId = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

/* ------------------------------------------------------------------ */
/*  Pure core                                                          */
/* ------------------------------------------------------------------ */

/**
 * Fold one source into an id → quantity map, summing duplicate stacks rather
 * than letting a later one overwrite an earlier one.
 */
export function tallyById(
  items: readonly unknown[] | null | undefined,
  idKey: string,
): Map<string, number> {
  const out = new Map<string, number>();
  if (!Array.isArray(items)) return out;

  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as RawItem;
    const id = toId(item[idKey]);
    const qty = toQty(item.quantity);
    if (!id || qty <= 0) continue;
    out.set(id, (out.get(id) ?? 0) + qty);
  }
  return out;
}

/** Merge an inventory tally and a storage tally into sorted display entries. */
export function mergeEntries(
  inventory: ReadonlyMap<string, number>,
  storage: ReadonlyMap<string, number>,
  label: (id: string) => string,
): DeleterEntry[] {
  const ids = new Set<string>([...inventory.keys(), ...storage.keys()]);
  const entries: DeleterEntry[] = [];

  for (const id of ids) {
    const invQty = inventory.get(id) ?? 0;
    const storeQty = storage.get(id) ?? 0;
    const total = invQty + storeQty;
    if (total <= 0) continue;
    entries.push({ id, label: label(id), invQty, storeQty, total });
  }

  entries.sort((a, b) => a.label.localeCompare(b.label));
  return entries;
}

/** How many entries the inventory may hold, given the Misc guard setting. */
export function entryLimit(guardEnabled: boolean): number {
  return guardEnabled ? INVENTORY_ENTRY_LIMIT_GUARDED : INVENTORY_ENTRY_LIMIT;
}

/**
 * Whether a withdrawal can happen right now. Topping up a stack that already
 * exists never needs a slot; a brand new entry does.
 */
export function hasRoomForWithdrawal(
  plan: WithdrawPlan,
  inventoryEntryCount: number,
  guardEnabled: boolean,
): boolean {
  if (plan.fromStorage <= 0) return true;
  if (!plan.needsNewInventoryEntry) return true;
  return inventoryEntryCount < entryLimit(guardEnabled);
}

/**
 * Split a requested quantity across the two sources, inventory first so the
 * run only touches storage for what it cannot already reach.
 */
export function planWithdrawal(entry: DeleterEntry, wantQty: number): WithdrawPlan {
  const want = Math.max(0, Math.min(Math.floor(wantQty || 0), entry.total));
  const fromInventory = Math.min(want, entry.invQty);
  const fromStorage = want - fromInventory;
  return {
    fromInventory,
    fromStorage,
    needsNewInventoryEntry: fromStorage > 0 && entry.invQty <= 0,
  };
}

/* ------------------------------------------------------------------ */
/*  Live sources                                                       */
/* ------------------------------------------------------------------ */

const seedLabel = (species: string): string => {
  try {
    const name = (plantCatalog as Record<string, any>)?.[species]?.seed?.name;
    if (typeof name === "string" && name) return name;
  } catch {}
  return `${species} Seed`;
};

const decorLabel = (decorId: string): string => {
  try {
    const name = (decorCatalog as Record<string, any>)?.[decorId]?.name;
    if (typeof name === "string" && name) return name;
  } catch {}
  return decorId || "Decor";
};

async function readAtom<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

/** Seeds held in the inventory plus the Seed Silo. */
export async function getSeedEntries(): Promise<DeleterEntry[]> {
  const inventory = await readAtom(() => Atoms.inventory.mySeedInventory.get());
  const storage = await readAtom(() => Atoms.inventory.mySeedSiloItems.get());
  return mergeEntries(
    tallyById(inventory as unknown[], "species"),
    tallyById(storage as unknown[], "species"),
    seedLabel,
  );
}

/** Decor held in the inventory plus the Decor Shed. */
export async function getDecorEntries(): Promise<DeleterEntry[]> {
  const inventory = await readAtom(() => Atoms.inventory.myDecorInventory.get());
  const storage = await readAtom(() => Atoms.inventory.myDecorShedItems.get());
  return mergeEntries(
    tallyById(inventory as unknown[], "decorId"),
    tallyById(storage as unknown[], "decorId"),
    decorLabel,
  );
}

/** Entries currently occupying the inventory. This is what the cap applies to. */
export async function getInventoryEntryCount(): Promise<number> {
  const inventory = await readAtom(() => Atoms.inventory.myInventory.get());
  const items = (inventory as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? items.length : 0;
}
