// How many of each item the player bought in the shops' CURRENT restock.

export type ShopKind = "seed" | "egg" | "tool" | "decor";
export type PurchaseCounts = Record<ShopKind, Record<string, number>>;

const DIRECT_KIND: Record<string, ShopKind> = { seed: "seed", egg: "egg", tool: "tool", decor: "decor" };

/**
 * Whether a `shopPurchases` entry belongs to the restock the shop is showing.
 *
 * Since v1284 an entry is `{ restockId, startedAtMs, purchases }` and survives
 * restocks, so last cycle's counts stay there until the next purchase. The
 * game only applies them while the restockId matches; an entry from an older
 * restock means nothing bought yet, and one from a newer restock is unknown,
 * which the game also counts as nothing bought. Both come out as "skip".
 *
 * The pre-1284 entry had no restockId and was reset by the server, so it
 * still counts as is.
 */
function isCurrentRestock(entry: any, shop: any): boolean {
  if (!("restockId" in entry)) return true;
  const current = shop?.restockId;
  return current != null && entry.restockId === current;
}

/**
 * Sums `myData.shopPurchases` per item kind, current restock only.
 *
 * `shops` is `stateAtom.child.data.shops`, keyed like `shopPurchases`
 * (seed, egg, tool, decor and the weather shops). `kindOf` places items of
 * the weather shops, whose key is not an item kind.
 */
export function purchasesForCurrentRestock(
  shops: any,
  shopPurchases: any,
  kindOf: (itemId: string) => ShopKind | null,
): PurchaseCounts {
  const out: PurchaseCounts = { seed: {}, egg: {}, tool: {}, decor: {} };
  if (!shopPurchases || typeof shopPurchases !== "object") return out;

  for (const shopKey of Object.keys(shopPurchases)) {
    const entry = shopPurchases[shopKey];
    if (!entry || typeof entry !== "object") continue;
    if (!isCurrentRestock(entry, shops?.[shopKey])) continue;
    const purch = entry.purchases;
    if (!purch || typeof purch !== "object") continue;
    for (const [itemId, count] of Object.entries(purch)) {
      const n = Number(count) || 0;
      const kind = DIRECT_KIND[shopKey] ?? kindOf(itemId);
      if (!kind) continue;
      out[kind][itemId] = (out[kind][itemId] ?? 0) + n;
    }
  }
  return out;
}

export type PlayerShopView = {
  /** Only the shops the player can buy from right now, keyed like `shops`. */
  shops: Record<string, any>;
  purchases: PurchaseCounts;
};

/** The shops a player can buy a personal restock of (`myData.customRestocks`). */
const CUSTOM_RESTOCK_SHOPS = new Set(["seed", "egg", "tool", "decor"]);

/**
 * The shop the player actually buys from under `key`, or null.
 *
 * After buying a personal restock, the player's seed/egg/tool/decor shop is
 * their own `customRestockInventories[key]`, not the room's, and only once its
 * restockId matches the purchase. A room shop whose restockId is null is
 * closed, which is how a weather shop ends with its weather.
 */
function resolveShop(key: string, shops: any, mySlot: any): any | null {
  if (CUSTOM_RESTOCK_SHOPS.has(key)) {
    const custom = mySlot?.data?.customRestocks?.[key];
    if (custom) {
      const inv = mySlot?.customRestockInventories?.[key];
      return inv && inv.restockId === `${key}:custom:${custom.purchasedAt}` ? inv : null;
    }
  }
  const shop = shops?.[key];
  if (!shop || typeof shop !== "object") return null;
  if ("restockId" in shop && shop.restockId == null) return null;
  return shop;
}

/**
 * Whether the purchases recorded for this shop are known. An entry dated after
 * the shop we hold is not, and the game then shows every item sold out.
 */
function purchasesKnown(entry: any, shop: any): boolean {
  if (!entry || typeof entry !== "object" || !("restockId" in entry)) return true;
  if (entry.restockId === shop?.restockId) return true;
  return Number(entry.startedAtMs) < Number(shop?.startedAtMs);
}

/**
 * The shops and purchase counts as the game shows them to this player (v1324).
 *
 * `shops` is `stateAtom.child.data.shops`, `mySlot` is `myUserSlotAtom`. A shop
 * is left out when it is closed, when the player's personal restock has not
 * arrived yet, or when its purchases are unknown: in all three the game has
 * nothing to sell, so an alert would ring for an item no one can buy.
 */
export function playerShopView(
  shops: any,
  mySlot: any,
  kindOf: (itemId: string) => ShopKind | null,
): PlayerShopView {
  const shopPurchases = mySlot?.data?.shopPurchases;
  const open: Record<string, any> = {};
  const keys = new Set<string>(shops && typeof shops === "object" ? Object.keys(shops) : []);
  for (const key of CUSTOM_RESTOCK_SHOPS) {
    if (mySlot?.data?.customRestocks?.[key]) keys.add(key);
  }
  for (const key of keys) {
    const shop = resolveShop(key, shops, mySlot);
    if (!shop) continue;
    if (!purchasesKnown(shopPurchases?.[key], shop)) continue;
    open[key] = shop;
  }
  return { shops: open, purchases: purchasesForCurrentRestock(open, shopPurchases, kindOf) };
}
