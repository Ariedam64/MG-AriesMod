// scripts/checkShopPurchaseMessage.ts
//
// Since v1292 the server rejects a PurchaseShopItem without `viewMode` as
// invalid_message. Every purchase the mod made (notification Buy and Buy all,
// player.ts) was built without it and silently refused. This pins the shape
// the game itself sends.
//
// Run with: npm run check:shopmessage

import { checkEqual, done } from "./_check";
import { buildShopPurchaseCommand, readShopViewMode } from "../src/game/ws/shopPurchaseMessage";

function storage(entries: Record<string, string>) {
  const keys = Object.keys(entries);
  return {
    get length() { return keys.length; },
    key: (i: number) => keys[i] ?? null,
    getItem: (k: string) => (k in entries ? entries[k] : null),
  };
}

const seed = { itemType: "Seed", species: "Carrot" };

checkEqual(
  "a single purchase carries viewMode and no quantity",
  buildShopPurchaseCommand("seed", seed, "list"),
  { type: "PurchaseShopItem", shop: "seed", viewMode: "list", item: seed },
);
checkEqual(
  "buy all sends the whole stack in one command",
  buildShopPurchaseCommand("seed", seed, "grid", 7),
  { type: "PurchaseShopItem", shop: "seed", viewMode: "grid", item: seed, quantity: 7 },
);
checkEqual(
  "a quantity of 1 is left out, like the game does",
  "quantity" in buildShopPurchaseCommand("seed", seed, "list", 1),
  false,
);
checkEqual(
  "a nonsense quantity falls back to 1",
  "quantity" in buildShopPurchaseCommand("seed", seed, "list", NaN),
  false,
);

checkEqual("no storage reads as list", readShopViewMode("seed", null), "list");
checkEqual("no key for this shop reads as list", readShopViewMode("seed", storage({ "shop:abc:egg:viewMode": "\"grid\"" })), "list");
checkEqual("the player's grid setting is read", readShopViewMode("seed", storage({ "shop:abc:seed:viewMode": "\"grid\"" })), "grid");
checkEqual("a raw unquoted value is read", readShopViewMode("tool", storage({ "shop:abc:tool:viewMode": "grid" })), "grid");
checkEqual("an unknown value reads as list", readShopViewMode("seed", storage({ "shop:abc:seed:viewMode": "\"tiles\"" })), "list");

done();
