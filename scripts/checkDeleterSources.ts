// Pure-logic checks for the seed/decor deleter sources: how the inventory and
// the storage tallies merge, how a requested quantity splits across them, and
// when a withdrawal needs a free inventory entry.
import { checkEqual, done } from "./_check";
import {
  entryLimit,
  hasRoomForWithdrawal,
  mergeEntries,
  planWithdrawal,
  tallyById,
  type DeleterEntry,
} from "../src/features/deleters/sources";

const label = (id: string) => `${id} Seed`;

console.log("--- tallyById ---");
checkEqual("sums duplicate stacks of the same id",
  [...tallyById([{ species: "Aloe", quantity: 3 }, { species: "Aloe", quantity: 4 }], "species")],
  [["Aloe", 7]]);
checkEqual("drops empty and malformed rows",
  [...tallyById([{ species: "Aloe", quantity: 0 }, null, { quantity: 5 }, "x"] as unknown[], "species")],
  []);
checkEqual("floors and clamps quantities",
  [...tallyById([{ species: "Aloe", quantity: 2.9 }, { species: "Beet", quantity: -3 }], "species")],
  [["Aloe", 2]]);
checkEqual("non-array source is empty", [...tallyById(null, "species")], []);

console.log("\n--- mergeEntries ---");
const merged = mergeEntries(
  new Map([["Beet", 4], ["Aloe", 2]]),
  new Map([["Aloe", 8], ["Carrot", 5]]),
  label,
);
checkEqual("merges both sources, keyed by raw id, sorted by label",
  merged.map((e) => [e.id, e.invQty, e.storeQty, e.total]),
  [["Aloe", 2, 8, 10], ["Beet", 4, 0, 4], ["Carrot", 0, 5, 5]]);

console.log("\n--- planWithdrawal ---");
const aloe: DeleterEntry = { id: "Aloe", label: "Aloe Seed", invQty: 2, storeQty: 8, total: 10 };
checkEqual("inventory is spent first", planWithdrawal(aloe, 2),
  { fromInventory: 2, fromStorage: 0, needsNewInventoryEntry: false });
checkEqual("overflow comes out of storage", planWithdrawal(aloe, 6),
  { fromInventory: 2, fromStorage: 4, needsNewInventoryEntry: false });
checkEqual("a request past the total is clamped", planWithdrawal(aloe, 999),
  { fromInventory: 2, fromStorage: 8, needsNewInventoryEntry: false });
checkEqual("zero asks for nothing", planWithdrawal(aloe, 0),
  { fromInventory: 0, fromStorage: 0, needsNewInventoryEntry: false });

const storageOnly: DeleterEntry = { id: "Carrot", label: "Carrot Seed", invQty: 0, storeQty: 5, total: 5 };
checkEqual("a storage-only id needs a new entry", planWithdrawal(storageOnly, 5),
  { fromInventory: 0, fromStorage: 5, needsNewInventoryEntry: true });

console.log("\n--- capacity ---");
checkEqual("guard off allows 100 entries", entryLimit(false), 100);
checkEqual("guard on reserves one", entryLimit(true), 99);

const needsSlot = planWithdrawal(storageOnly, 5);
const topsUp = planWithdrawal(aloe, 6);
checkEqual("a new entry is refused at the cap", hasRoomForWithdrawal(needsSlot, 100, false), false);
checkEqual("a new entry fits below the cap", hasRoomForWithdrawal(needsSlot, 99, false), true);
checkEqual("the guard bites one entry earlier", hasRoomForWithdrawal(needsSlot, 99, true), false);
checkEqual("topping up an existing stack never needs a slot", hasRoomForWithdrawal(topsUp, 100, true), true);
checkEqual("an inventory-only run never needs a slot",
  hasRoomForWithdrawal(planWithdrawal(aloe, 2), 100, true), true);

done();
