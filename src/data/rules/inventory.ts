// The game's inventory rules the mod has to mirror.

/**
 * How many slots the bag holds. Not in any catalog: the game hardcodes it
 * (build 1961, `isInventoryFull` is "100 slots or more"). Pets, produce and
 * plants never stack, so for them a full bag is simply this many slots.
 */
const INVENTORY_MAX_ITEMS = 100;

/**
 * The id the game keys an inventory entry by: the tool, seed, decor or egg
 * kind for stackable entries, the entry's own id otherwise.
 */
function inventoryEntryId(item: Record<string, unknown>): unknown {
  switch (item.itemType) {
    case "Tool": return item.toolId;
    case "Seed": return item.species;
    case "Decor": return item.decorId;
    case "Egg": return item.eggId;
    default: return item.id;
  }
}

const slotKey = (itemType: unknown, id: unknown): string => `${String(itemType)}:${String(id)}`;

/**
 * How many slots the bag's entries take, the way the game counts them
 * (build 1961): an entry pinned in the tool ring (`inventory.toolRing`, same
 * itemType and id) takes no slot. Without a ring, every entry takes one.
 */
export function countInventorySlots(items: unknown, toolRing: unknown): number {
  if (!Array.isArray(items)) return 0;
  const pinned = new Set<string>();
  if (Array.isArray(toolRing)) {
    for (const entry of toolRing) {
      if (!entry || typeof entry !== "object") continue;
      const { itemType, id } = entry as { itemType?: unknown; id?: unknown };
      if (itemType != null && id != null) pinned.add(slotKey(itemType, id));
    }
  }
  if (pinned.size === 0) return items.length;
  let used = 0;
  for (const item of items) {
    if (item && typeof item === "object") {
      const entry = item as Record<string, unknown>;
      const id = inventoryEntryId(entry);
      if (id != null && pinned.has(slotKey(entry.itemType, id))) continue;
    }
    used++;
  }
  return used;
}

/** Slots taken in the inventory (the `myInventoryAtom` value, or a bare item list). */
export function usedInventorySlots(inventory: unknown): number {
  if (Array.isArray(inventory)) return inventory.length;
  if (!inventory || typeof inventory !== "object") return 0;
  const { items, toolRing } = inventory as { items?: unknown; toolRing?: unknown };
  return countInventorySlots(items, toolRing);
}

/** Whether one more pet (or crop, or plant) can go in the bag. Takes the inventory or a bare item list. */
export function isInventoryFullForUnstackable(inventory: unknown): boolean {
  return usedInventorySlots(inventory) >= INVENTORY_MAX_ITEMS;
}

/** The entry with this id among the bag's items, or null. */
export function findInventoryItem(items: unknown, id: unknown): Record<string, unknown> | null {
  if (!Array.isArray(items) || typeof id !== "string" || !id) return null;
  return (items.find((item) => item && typeof item === "object" && (item as { id?: unknown }).id === id) as Record<string, unknown>) ?? null;
}
