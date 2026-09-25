// src/utils/shopPurchases.ts
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
