// The inventory's value summary updates when the items change.
//
// Before the refactor, a watcher subscribed to the inventory atom and the
// sort bar re-totalled the filtered value on every change. A dead-code pass
// deleted that subscription and left an empty `try {}`, and the watcher went
// next as unused, so the total kept the value of the moment the inventory
// opened: sell, harvest or buy, and the figure under the list stayed put.

import { checkEqual, done, run } from "./_check";
import { Atoms } from "../src/game/store/atoms";
import * as value from "../src/features/inventory/value";

const inventoryListeners: Array<(next: unknown) => void> = [];
(Atoms.inventory.myInventory as any).get = async () => ({ items: [] });
(Atoms.inventory.myInventory as any).onChange = async (cb: (next: unknown) => void) => {
  inventoryListeners.push(cb);
  return () => {};
};
(Atoms.server.numPlayers as any).get = async () => 1;
(Atoms.server.numPlayers as any).onChange = async () => () => {};

run(async () => {
  const api = value as Record<string, any>;
  const follow = api.followInventoryValues as (() => Promise<void>) | undefined;
  const onItemsChange = api.onInventoryItemsChange as ((listener: () => void) => () => void) | undefined;
  checkEqual("the inventory values have a watcher", typeof follow, "function");
  checkEqual("the summary can hear the items change", typeof onItemsChange, "function");
  if (!follow || !onItemsChange) done();

  let refreshes = 0;
  onItemsChange(() => refreshes++);
  await follow();
  checkEqual("the watcher follows the inventory", inventoryListeners.length, 1);

  inventoryListeners.forEach((cb) => cb({ items: [{ itemType: "Seed", species: "Carrot", quantity: 1 }] }));
  inventoryListeners.forEach((cb) => cb({ items: [] }));
  checkEqual("each change of the items reaches the summary", refreshes, 2);

  await follow();
  checkEqual("showing the inventory again does not follow twice", inventoryListeners.length, 1);

});
