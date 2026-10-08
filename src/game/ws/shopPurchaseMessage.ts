// src/utils/shopPurchaseMessage.ts
// Builds the PurchaseShopItem command the way the game sends it.
//
// Since v1292 the server rejects a purchase without `viewMode` ("list" or
// "grid", the shop's display setting) as invalid_message. The same build added
// an optional `quantity`, which the game's Buy All uses to buy a whole stack in
// one command. The game leaves `quantity` out when it is 1, and so do we.
// The game's own send (v1292, installPlayerSystems):
//   { type: "PurchaseShopItem", shop, viewMode, item, ...(q === 1 ? {} : { quantity: q }) }

export type ShopViewMode = "list" | "grid";

type StorageLike = Pick<Storage, "length" | "key" | "getItem">;

const VIEW_MODE_KEY = /^shop:.*:(.+):viewMode$/;

function parseViewMode(raw: string | null): ShopViewMode | null {
  if (raw == null) return null;
  let value: unknown = raw;
  try { value = JSON.parse(raw); } catch {}
  return value === "list" || value === "grid" ? value : null;
}

/**
 * The display setting the player picked for this shop. The game keeps it in
 * localStorage under `shop:<scope>:<shop>:viewMode`. When the player never
 * toggled it there is no key, and "list" is always a value the server takes.
 */
export function readShopViewMode(shop: string, storage: StorageLike | null | undefined): ShopViewMode {
  if (!storage) return "list";
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key) continue;
      const match = VIEW_MODE_KEY.exec(key);
      if (!match || match[1] !== shop) continue;
      const mode = parseViewMode(storage.getItem(key));
      if (mode) return mode;
    }
  } catch {}
  return "list";
}

export function buildShopPurchaseCommand(
  shop: string,
  item: Record<string, string>,
  viewMode: ShopViewMode,
  quantity = 1,
): Record<string, unknown> {
  const q = Math.max(1, Math.floor(Number(quantity) || 1));
  return {
    type: "PurchaseShopItem",
    shop,
    viewMode,
    item,
    ...(q === 1 ? {} : { quantity: q }),
  };
}
