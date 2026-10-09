// Shop alerts compare each item's stock with what the player already bought.
// Since v1284 `myData.shopPurchases[shop]` is `{ restockId, startedAtMs,
// purchases }` and is no longer cleared at restock: the counts only apply
// while `restockId` matches the live shop's. The game's own read (v1284):
//   same restockId            -> entry.purchases
//   entry older than the shop -> {}   (a new restock started)
//   otherwise                 -> null (unknown, counted as nothing bought)
import { checkEqual, done } from "./_check";
import { playerShopView, purchasesForCurrentRestock, type ShopKind } from "../src/features/shops/purchases";

const kindOf = (id: string): ShopKind | null =>
  id === "Daisy" ? "seed" : id === "DawnEgg" ? "egg" : id === "RainWardShard" ? "tool" : null;

const shop = (restockId: string | null, startedAtMs: number) =>
  ({ restockId, startedAtMs, inventory: [], secondsUntilRestock: 100 });

// Bought 1 Starweaver and 5 Carrots last cycle, then the seed shop restocked.
{
  const shops = { seed: shop("seed:2", 2000), egg: shop("egg:1", 1000) };
  const purchases = {
    seed: { restockId: "seed:1", startedAtMs: 1000, purchases: { Starweaver: 1, Carrot: 5 } },
    egg:  { restockId: "egg:1",  startedAtMs: 1000, purchases: { MythicalEgg: 2 } },
  };
  const p = purchasesForCurrentRestock(shops, purchases, kindOf);
  checkEqual("last cycle's Starweaver does not count after the restock", p.seed.Starweaver ?? 0, 0);
  checkEqual("last cycle's Carrots do not count after the restock", p.seed.Carrot ?? 0, 0);
  checkEqual("purchases in the current egg restock still count", p.egg.MythicalEgg ?? 0, 2);
}

// Purchases recorded against a restock newer than the shop we hold: unknown.
{
  const shops = { seed: shop("seed:1", 1000) };
  const purchases = { seed: { restockId: "seed:2", startedAtMs: 2000, purchases: { Carrot: 3 } } };
  checkEqual("purchases from a newer restock count as nothing", purchasesForCurrentRestock(shops, purchases, kindOf).seed.Carrot ?? 0, 0);
}

// A shop not loaded yet (restockId null) has no known purchases.
{
  const shops = { seed: shop(null, 0) };
  const purchases = { seed: { restockId: "seed:1", startedAtMs: 1000, purchases: { Carrot: 3 } } };
  checkEqual("shop with no restock yet counts nothing", purchasesForCurrentRestock(shops, purchases, kindOf).seed.Carrot ?? 0, 0);
}

// Weather shops are keyed by weather and hold items of several kinds.
{
  const shops = { dawn: shop("dawn:7", 5000) };
  const purchases = { dawn: { restockId: "dawn:7", startedAtMs: 5000, purchases: { Daisy: 1, DawnEgg: 1 } } };
  const p = purchasesForCurrentRestock(shops, purchases, kindOf);
  checkEqual("weather shop seed lands in seed", p.seed.Daisy ?? 0, 1);
  checkEqual("weather shop egg lands in egg", p.egg.DawnEgg ?? 0, 1);
}

// The pre-1284 shape (no restockId, reset by the server) still reads.
{
  const purchases = { seed: { createdAt: 1000, purchases: { Carrot: 2 } } };
  checkEqual("old shape still counts", purchasesForCurrentRestock({ seed: shop("seed:1", 1000) }, purchases, kindOf).seed.Carrot ?? 0, 2);
}

// The shops as the player sees them. The game's own resolution (v1324,
// bootScreen) picks, per shop key:
//   seed/egg/tool/decor with myData.customRestocks[key] set
//                               -> the slot's customRestockInventories[key],
//                                  only while its restockId is `${key}:custom:${purchasedAt}`
//   otherwise                   -> shops[key], or nothing when its restockId is null
// and an item whose purchases are unknown is shown sold out.
const withStock = (restockId: string | null, startedAtMs: number, inventory: any[]) =>
  ({ restockId, startedAtMs, inventory, secondsUntilRestock: 100 });
const shard = { itemType: "Tool", toolId: "RainWardShard", initialStock: 2 };
const carrot = { itemType: "Seed", species: "Carrot", initialStock: 10 };
const starweaver = { itemType: "Seed", species: "Starweaver", initialStock: 1 };
const idsIn = (shop: any) => (shop?.inventory ?? []).map((it: any) => it.toolId ?? it.species).join(",");

// The rain ended: the game closes the shop by nulling its restockId.
{
  const shops = { rain: withStock(null, 5000, [shard]) };
  const view = playerShopView(shops, { data: { shopPurchases: {} } }, kindOf);
  checkEqual("a closed weather shop sells nothing", idsIn(view.shops.rain), "");
}

// The player bought a personal seed restock: their seed shop is that one.
{
  const shops = { seed: withStock("seed:2", 2000, [carrot]) };
  const slot = {
    data: {
      customRestocks: { seed: { purchasedAt: 2500 }, egg: null, tool: null, decor: null },
      shopPurchases: { seed: { restockId: "seed:custom:2500", startedAtMs: 2500, purchases: { Starweaver: 1 } } },
    },
    customRestockInventories: { seed: withStock("seed:custom:2500", 2500, [starweaver]) },
  };
  const view = playerShopView(shops, slot, kindOf);
  checkEqual("a personal restock replaces the shared seed shop", idsIn(view.shops.seed), "Starweaver");
  checkEqual("purchases in the personal restock count", view.purchases.seed.Starweaver ?? 0, 1);
}

// A personal restock the room state has not caught up with yet: no seed shop.
{
  const shops = { seed: withStock("seed:2", 2000, [carrot]) };
  const slot = {
    data: { customRestocks: { seed: { purchasedAt: 2500 } }, shopPurchases: {} },
    customRestockInventories: { seed: withStock("seed:custom:1000", 1000, [starweaver]) },
  };
  checkEqual("a stale personal restock sells nothing", idsIn(playerShopView(shops, slot, kindOf).shops.seed), "");
}

// Purchases dated after the shop we hold: the game shows everything sold out.
{
  const shops = { rain: withStock("rain:1", 1000, [shard]) };
  const slot = { data: { shopPurchases: { rain: { restockId: "rain:2", startedAtMs: 2000, purchases: {} } } } };
  checkEqual("unknown purchases leave nothing to buy", idsIn(playerShopView(shops, slot, kindOf).shops.rain), "");
}

// The ordinary case still goes through untouched.
{
  const shops = { rain: withStock("rain:1", 1000, [shard]), seed: withStock("seed:1", 1000, [carrot]) };
  const slot = { data: { shopPurchases: { rain: { restockId: "rain:1", startedAtMs: 1000, purchases: { RainWardShard: 1 } } } } };
  const view = playerShopView(shops, slot, kindOf);
  checkEqual("an open weather shop sells its shard", idsIn(view.shops.rain), "RainWardShard");
  checkEqual("an open shared shop sells its stock", idsIn(view.shops.seed), "Carrot");
  checkEqual("a shard bought in the weather shop counts as a tool", view.purchases.tool.RainWardShard ?? 0, 1);
}

done();
