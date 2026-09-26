// scripts/checkShopPurchaseMessage.ts
//
// Since v1292 the server rejects a PurchaseShopItem without `viewMode` as
// invalid_message. Every purchase the mod made (notification Buy and Buy all,
// player.ts) was built without it and silently refused. This pins the shape
// the game itself sends.
//
// Run with: npm run check:shopmessage

import { buildShopPurchaseCommand, readShopViewMode } from "../src/utils/shopPurchaseMessage";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`ok   ${label}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
}

function storage(entries: Record<string, string>) {
  const keys = Object.keys(entries);
  return {
    get length() { return keys.length; },
    key: (i: number) => keys[i] ?? null,
    getItem: (k: string) => (k in entries ? entries[k] : null),
  };
}

const seed = { itemType: "Seed", species: "Carrot" };

check(
  "a single purchase carries viewMode and no quantity",
  buildShopPurchaseCommand("seed", seed, "list"),
  { type: "PurchaseShopItem", shop: "seed", viewMode: "list", item: seed },
);
check(
  "buy all sends the whole stack in one command",
  buildShopPurchaseCommand("seed", seed, "grid", 7),
  { type: "PurchaseShopItem", shop: "seed", viewMode: "grid", item: seed, quantity: 7 },
);
check(
  "a quantity of 1 is left out, like the game does",
  "quantity" in buildShopPurchaseCommand("seed", seed, "list", 1),
  false,
);
check(
  "a nonsense quantity falls back to 1",
  "quantity" in buildShopPurchaseCommand("seed", seed, "list", NaN),
  false,
);

check("no storage reads as list", readShopViewMode("seed", null), "list");
check("no key for this shop reads as list", readShopViewMode("seed", storage({ "shop:abc:egg:viewMode": "\"grid\"" })), "list");
check("the player's grid setting is read", readShopViewMode("seed", storage({ "shop:abc:seed:viewMode": "\"grid\"" })), "grid");
check("a raw unquoted value is read", readShopViewMode("tool", storage({ "shop:abc:tool:viewMode": "grid" })), "grid");
check("an unknown value reads as list", readShopViewMode("seed", storage({ "shop:abc:seed:viewMode": "\"tiles\"" })), "list");

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall shop purchase message checks passed");
