// The inventory sort's pure parts: which sorts a filter offers, how items
// order under each key, and the compact value text on the cards (`1.2M`,
// one decimal and a capital K, which is not `formatPrice`).

import { sortInventoryItems } from "../src/features/inventory/comparators";
import { filterInventoryItems, shownItemTypes } from "../src/features/inventory/filters";
import { computeSortOptions } from "../src/features/inventory/sortOptions";
import { formatCompactValue } from "../src/features/inventory/valueDisplay";

let failed = 0;
function check(name: string, got: unknown, expected: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (expected ${JSON.stringify(expected)})`}`);
}

const items = [
  { id: "c1", itemType: "Produce", species: "Carrot", size: 100, mutations: ["Gold"] },
  { id: "c2", itemType: "Produce", species: "Carrot", size: 50, mutations: [] },
  { id: "c3", itemType: "Produce", species: "Banana", size: 75, mutations: ["Wet", "Dawnlit"] },
  { id: "s1", itemType: "Seed", species: "Carrot", quantity: 12 },
  { id: "s2", itemType: "Seed", species: "Banana", quantity: 3 },
];
const ids = (list: any[]) => list.map((item) => item.id);
const keys = (filters: string[], search = "") => computeSortOptions(filters, shownItemTypes(filters, search)).map((o) => o.value);

const crops = filterInventoryItems(items.map((i) => ({ ...i })), ["Crops"], "");
check("the Crops filter keeps produce", ids(crops), ["c1", "c2", "c3"]);
check("crops can sort by size and mutations", keys(["Crops"]), ["none", "alpha", "qty", "rarity", "value", "size", "mutations"]);
const seeds = filterInventoryItems(items.map((i) => ({ ...i })), ["Seeds"], "");
check("seeds get the base sorts", keys(["Seeds"]), ["none", "alpha", "qty", "rarity", "value"]);
check("pets can sort by strength", keys(["Pets"]), ["none", "alpha", "qty", "rarity", "value", "mutations", "strength"]);
const searched = filterInventoryItems(items.map((i) => ({ ...i })), [], "banana");
check("a search keeps matching items of every type", ids(searched), ["c3", "s2"]);

check("size, largest first", ids(sortInventoryItems(crops, "size", "desc")), ["c1", "c3", "c2"]);
check("size, smallest first", ids(sortInventoryItems(crops, "size", "asc")), ["c2", "c3", "c1"]);
check("mutations, most first", ids(sortInventoryItems(crops, "mutations", "desc")), ["c3", "c1", "c2"]);
check("value, highest first", ids(sortInventoryItems(crops, "value", "desc")), ["c3", "c1", "c2"]);
check("name, A to Z", ids(sortInventoryItems(crops, "alpha", "asc")), ["c3", "c1", "c2"]);
check("quantity, most first", ids(sortInventoryItems(seeds, "qty", "desc")), ["s1", "s2"]);
check("no sort keeps the order", ids(sortInventoryItems(crops, "none", "desc")), ["c1", "c2", "c3"]);

const unknownValue = [{ id: "a", itemType: "Mystery" }, ...crops.slice(0, 1)];
check("an item with no value sorts first ascending", ids(sortInventoryItems(unknownValue, "value", "asc")), ["a", "c1"]);
check("and last descending", ids(sortInventoryItems(unknownValue, "value", "desc")), ["c1", "a"]);

check("compact values", [999, 1000, 1049, 1050, 15300, 2.25e9, 7.04e12].map(formatCompactValue), [
  "999",
  "1K",
  "1K",
  "1.1K",
  "15.3K",
  "2.3B",
  "7T",
]);

console.log(failed ? `${failed} FAILURES` : "all good");
process.exit(failed ? 1 : 0);
