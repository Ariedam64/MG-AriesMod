// When the shop alerts ring, and for what.
//
// The logic used to live inside the overlay's DOM class, untested. What this
// guards, now that it is its own module (features/notifier/shopAlerts.ts):
//   - nothing rings while the shops settle at boot: three shop pushes, two
//     purchase pushes and a non-empty shop, then whatever is listed rings once;
//   - only followed items in stock are listed, with what is left to buy;
//   - an item that appears rings, one that leaves stops its loop, an empty list
//     stops every loop, and a restock rings every listed item again;
//   - items sharing a sound ring once together;
//   - a changed rule restarts the loops it affects.
//
// Run with: npm run check:shopalerts

import { audio } from "../src/features/notifier/audio/audio";
import { ShopRows } from "../src/features/notifier/shopRows";
import { ShopAlerts, findStockItem } from "../src/features/notifier/shopAlerts";
import type { PurchasesSnapshot, ShopsSnapshot } from "../src/features/shops/shopFeed";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`ok   ${label}`);
    return;
  }
  failures++;
  console.log(`FAIL ${label}\n     got      ${a}\n     expected ${e}`);
}

// Record the sounds instead of playing them.
const calls: string[] = [];
const recorder = audio as unknown as Record<string, unknown>;
recorder.trigger = async (key: string) => {
  calls.push(`ring ${key}`);
};
recorder.stopLoop = (key: string) => {
  calls.push(`stop ${key}`);
};
recorder.stopAllLoops = () => {
  calls.push("stop all");
};
let shopsMode: "oneshot" | "loop" = "oneshot";
recorder.getPlaybackMode = () => shopsMode;
const takeCalls = () => calls.splice(0);

ShopRows.setFollowed("Seed:Carrot", true);
ShopRows.setFollowed("Seed:Daisy", true);
ShopRows.setFollowed("Egg:CommonEgg", true);

type Stock = { seeds?: Array<[string, number]>; eggs?: Array<[string, number]>; restockIn?: number };
function shops({ seeds = [], eggs = [], restockIn = 100 }: Stock): ShopsSnapshot {
  return {
    seed: { inventory: seeds.map(([species, initialStock]) => ({ itemType: "Seed", species, initialStock })), secondsUntilRestock: restockIn },
    egg: { inventory: eggs.map(([eggId, initialStock]) => ({ itemType: "Egg", eggId, initialStock })), secondsUntilRestock: restockIn },
    tool: { inventory: [], secondsUntilRestock: restockIn },
    decor: { inventory: [], secondsUntilRestock: restockIn },
  };
}
function purchases(seed: Record<string, number> = {}): PurchasesSnapshot {
  return {
    seed: { createdAt: 0, purchases: seed },
    egg: { createdAt: 0, purchases: {} },
    tool: { createdAt: 0, purchases: {} },
    decor: { createdAt: 0, purchases: {} },
  };
}

const alerts = new ShopAlerts();
let listed: string[] = [];
alerts.onChange((items) => {
  listed = items.map((r) => `${r.id} x${r.qty}`);
});

const stock = { seeds: [["Carrot", 5], ["Tomato", 3]] as Array<[string, number]> };

// Boot: pushes arrive one by one, nothing rings until the shops settle.
alerts.setShops(shops(stock));
check("no list before the purchases arrive", listed, []);
alerts.setPurchases(purchases());
check("followed items in stock are listed, unfollowed ones are not", listed, ["Seed:Carrot x5"]);
alerts.setShops(shops(stock));
alerts.setPurchases(purchases());
check("nothing rings before the third shop push", takeCalls(), []);
alerts.setShops(shops(stock));
check("the boot rings what is listed, once", takeCalls(), ["ring Seed:Carrot"]);

// After boot.
alerts.setPurchases(purchases({ Carrot: 2 }));
check("a purchase lowers what is left", listed, ["Seed:Carrot x3"]);
check("a purchase that leaves stock rings nothing", takeCalls(), []);

alerts.setShops(shops({ seeds: [["Carrot", 5], ["Daisy", 1]] }));
check("a new item rings alone", takeCalls(), ["ring Seed:Daisy"]);

alerts.setShops(shops({ seeds: [["Daisy", 1]] }));
check("an item that leaves stops its loop", takeCalls(), ["stop Seed:Carrot"]);

alerts.setShops(shops({ seeds: [["Carrot", 5], ["Daisy", 1]], eggs: [["CommonEgg", 2]], restockIn: 300 }));
check("a restock rings once for items sharing the default sound", takeCalls(), ["ring Seed:Carrot"]);

alerts.setPurchases(purchases({ Carrot: 5, Daisy: 1 }));
check("the egg stays listed", listed, ["Egg:CommonEgg x2"]);
takeCalls();
alerts.setShops(shops({ restockIn: 300 }));
check("an empty list stops every loop", takeCalls(), ["stop all"]);

// Loops: every looping item rings, and a rule change restarts them.
shopsMode = "loop";
alerts.setPurchases(purchases());
takeCalls();
alerts.setShops(shops({ seeds: [["Carrot", 5], ["Daisy", 1]], restockIn: 600 }));
check("in loop mode every item starts its own loop", takeCalls(), ["ring Seed:Carrot", "ring Seed:Daisy"]);
alerts.setRules({ "Seed:Daisy": { playbackMode: "oneshot" } });
check("a rule change restarts the loops still looping", takeCalls(), ["stop Seed:Carrot", "ring Seed:Carrot"]);

// Buying from the panel finds the stock entry of an item.
const found = findStockItem(shops({ seeds: [["Carrot", 5]] }), "Seed:Carrot");
check("an item resolves to its stock entry and buy kind", [found?.kind, found?.item.species], ["seeds", "Carrot"]);
check("an item out of the shops does not resolve", findStockItem(shops({}), "Seed:Carrot"), null);

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall shop alert checks passed");
