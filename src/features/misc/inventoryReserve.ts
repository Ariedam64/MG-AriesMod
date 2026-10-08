import { interceptOutgoing } from "../../game/ws/outgoing";
import { Atoms } from "../../game/store/atoms";
import { readAndFollow } from "../../game/store/hub";
import { readStoredFlag, writeStoredFlag } from "./storedFlag";

/**
 * "Keep one inventory slot free": once the inventory holds 99 entries, every
 * action that would add a new entry is refused, so the last slot stays open.
 * Buying more of something already in the inventory still works, since it
 * only grows a stack.
 */

const BLOCK_AT = 99;

const PATH_KEEP_INVENTORY_SLOT_FREE = "misc.keepInventorySlotFree";

export const readInventorySlotReserveEnabled = (): boolean => readStoredFlag(PATH_KEEP_INVENTORY_SLOT_FREE);
export const writeInventorySlotReserveEnabled = (on: boolean): void =>
  writeStoredFlag(PATH_KEEP_INVENTORY_SLOT_FREE, on);

type ShopKind = "seed" | "decor" | "egg" | "tool";

let inventoryCount = 0;
const owned: Record<ShopKind, Set<string>> = {
  seed: new Set(),
  decor: new Set(),
  egg: new Set(),
  tool: new Set(),
};

function inventoryItems(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.items)) return raw.items;
  if (Array.isArray(raw.inventory)) return raw.inventory;
  if (Array.isArray(raw.inventory?.items)) return raw.inventory.items;
  return [];
}

function refreshInventory(raw: any) {
  const items = inventoryItems(raw);
  inventoryCount = items.length;
  for (const set of Object.values(owned)) set.clear();
  for (const entry of items) {
    if (!entry || typeof entry !== "object") continue;
    const source = entry.item && typeof entry.item === "object" ? entry.item : entry;
    const type = String(source.itemType ?? source.data?.itemType ?? "").toLowerCase();
    if (type === "seed" && source.species) owned.seed.add(String(source.species));
    if (type === "decor" && source.decorId) owned.decor.add(String(source.decorId));
    if (type === "egg" && source.eggId) owned.egg.add(String(source.eggId));
    if (type === "tool" && source.toolId) owned.tool.add(String(source.toolId));
  }
}

function inventoryFull(): boolean {
  return readInventorySlotReserveEnabled() && inventoryCount >= BLOCK_AT;
}

function blockWhenFull(type: string) {
  return () => {
    if (!inventoryFull()) return;
    console.log(`[${type}] Blocked by inventory reserve`);
    return "drop" as const;
  };
}

/** The shop and item a purchase is for, with the id under whichever field the message used. */
function purchaseTarget(message: any): { kind: ShopKind; id: unknown } | null {
  const item = message?.item ?? {};
  switch (message?.shop) {
    case "seed": return { kind: "seed", id: item.species ?? message?.species ?? message?.id };
    case "egg": return { kind: "egg", id: item.eggId ?? message?.eggId ?? message?.id };
    case "tool": return { kind: "tool", id: item.toolId ?? message?.toolId ?? message?.id };
    case "decor": return { kind: "decor", id: item.decorId ?? message?.decorId ?? message?.id };
    default: return null;
  }
}

function checkPurchase(message: any) {
  const target = purchaseTarget(message);
  if (!target || !inventoryFull()) return;
  const key = target.id == null ? "" : String(target.id);
  if (key && owned[target.kind].has(key)) return;
  console.log(`[PurchaseShopItem:${message.shop}] Blocked by inventory reserve`, { id: target.id });
  return "drop" as const;
}

/** Registers the inventory reserve. Must run before the locker's rules. */
export function installInventoryReserve(): void {
  void readAndFollow(Atoms.inventory.myInventory, refreshInventory);

  for (const type of ["HarvestCrop", "PickupObject", "HatchEgg"]) {
    interceptOutgoing(type, blockWhenFull(type));
  }
  interceptOutgoing("PurchaseShopItem", checkPurchase);
}
