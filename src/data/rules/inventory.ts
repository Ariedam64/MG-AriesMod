// The game's inventory rules the mod has to mirror.

/**
 * How many entries the bag holds. Not in any catalog: the game hardcodes it
 * (build 1449, `isInventoryFull = items.length >= 100`). Pets, produce and
 * plants never stack, so for them a full bag is simply this many entries.
 */
const INVENTORY_MAX_ITEMS = 100;

/** Whether one more pet (or crop, or plant) can go in the bag. */
export function isInventoryFullForUnstackable(items: unknown): boolean {
  return Array.isArray(items) && items.length >= INVENTORY_MAX_ITEMS;
}

/** The entry with this id among the bag's items, or null. */
export function findInventoryItem(items: unknown, id: unknown): Record<string, unknown> | null {
  if (!Array.isArray(items) || typeof id !== "string" || !id) return null;
  return (items.find((item) => item && typeof item === "object" && (item as { id?: unknown }).id === id) as Record<string, unknown>) ?? null;
}
