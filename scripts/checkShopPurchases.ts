// Shop alerts compare each item's stock with what the player already bought.
// Since v1284 `myData.shopPurchases[shop]` is `{ restockId, startedAtMs,
// purchases }` and is no longer cleared at restock: the counts only apply
// while `restockId` matches the live shop's. The game's own read (v1284):
//   same restockId            -> entry.purchases
//   entry older than the shop -> {}   (a new restock started)
//   otherwise                 -> null (unknown, counted as nothing bought)
import { purchasesForCurrentRestock, type ShopKind } from "../src/utils/shopPurchases";

let failed = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
};

const kindOf = (id: string): ShopKind | null =>
  id === "Daisy" ? "seed" : id === "DawnEgg" ? "egg" : null;

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
  check("last cycle's Starweaver does not count after the restock", p.seed.Starweaver ?? 0, 0);
  check("last cycle's Carrots do not count after the restock", p.seed.Carrot ?? 0, 0);
  check("purchases in the current egg restock still count", p.egg.MythicalEgg ?? 0, 2);
}

// Purchases recorded against a restock newer than the shop we hold: unknown.
{
  const shops = { seed: shop("seed:1", 1000) };
  const purchases = { seed: { restockId: "seed:2", startedAtMs: 2000, purchases: { Carrot: 3 } } };
  check("purchases from a newer restock count as nothing", purchasesForCurrentRestock(shops, purchases, kindOf).seed.Carrot ?? 0, 0);
}

// A shop not loaded yet (restockId null) has no known purchases.
{
  const shops = { seed: shop(null, 0) };
  const purchases = { seed: { restockId: "seed:1", startedAtMs: 1000, purchases: { Carrot: 3 } } };
  check("shop with no restock yet counts nothing", purchasesForCurrentRestock(shops, purchases, kindOf).seed.Carrot ?? 0, 0);
}

// Weather shops are keyed by weather and hold items of several kinds.
{
  const shops = { dawn: shop("dawn:7", 5000) };
  const purchases = { dawn: { restockId: "dawn:7", startedAtMs: 5000, purchases: { Daisy: 1, DawnEgg: 1 } } };
  const p = purchasesForCurrentRestock(shops, purchases, kindOf);
  check("weather shop seed lands in seed", p.seed.Daisy ?? 0, 1);
  check("weather shop egg lands in egg", p.egg.DawnEgg ?? 0, 1);
}

// The pre-1284 shape (no restockId, reset by the server) still reads.
{
  const purchases = { seed: { createdAt: 1000, purchases: { Carrot: 2 } } };
  check("old shape still counts", purchasesForCurrentRestock({ seed: shop("seed:1", 1000) }, purchases, kindOf).seed.Carrot ?? 0, 2);
}

console.log(failed ? `${failed} FAILURE(S)` : "All checks passed.");
process.exit(failed ? 1 : 0);
