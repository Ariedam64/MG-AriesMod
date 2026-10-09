// The inventory sort's pure parts: which sorts a filter offers, how items
// order under each key, and the compact value text on the cards (`1.2M`,
// one decimal and a capital K, which is not `formatPrice`).

import { checkEqual, done } from "./_check";
import { sortInventoryItems } from "../src/features/inventory/comparators";
import { filterInventoryItems, shownItemTypes } from "../src/features/inventory/filters";
import { computeSortOptions } from "../src/features/inventory/sortOptions";
import { formatCompactValue } from "../src/features/inventory/valueDisplay";

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
checkEqual("the Crops filter keeps produce", ids(crops), ["c1", "c2", "c3"]);
checkEqual("crops can sort by size and mutations", keys(["Crops"]), ["none", "alpha", "qty", "rarity", "value", "size", "mutations"]);
const seeds = filterInventoryItems(items.map((i) => ({ ...i })), ["Seeds"], "");
checkEqual("seeds get the base sorts", keys(["Seeds"]), ["none", "alpha", "qty", "rarity", "value"]);
checkEqual("pets can sort by strength", keys(["Pets"]), ["none", "alpha", "qty", "rarity", "value", "mutations", "strength"]);
const searched = filterInventoryItems(items.map((i) => ({ ...i })), [], "banana");
checkEqual("a search keeps matching items of every type", ids(searched), ["c3", "s2"]);

checkEqual("size, largest first", ids(sortInventoryItems(crops, "size", "desc")), ["c1", "c3", "c2"]);
checkEqual("size, smallest first", ids(sortInventoryItems(crops, "size", "asc")), ["c2", "c3", "c1"]);
checkEqual("mutations, most first", ids(sortInventoryItems(crops, "mutations", "desc")), ["c3", "c1", "c2"]);
checkEqual("value, highest first", ids(sortInventoryItems(crops, "value", "desc")), ["c3", "c1", "c2"]);
checkEqual("name, A to Z", ids(sortInventoryItems(crops, "alpha", "asc")), ["c3", "c1", "c2"]);
checkEqual("quantity, most first", ids(sortInventoryItems(seeds, "qty", "desc")), ["s1", "s2"]);
checkEqual("no sort keeps the order", ids(sortInventoryItems(crops, "none", "desc")), ["c1", "c2", "c3"]);

const unknownValue = [{ id: "a", itemType: "Mystery" }, ...crops.slice(0, 1)];
checkEqual("an item with no value sorts first ascending", ids(sortInventoryItems(unknownValue, "value", "asc")), ["a", "c1"]);
checkEqual("and last descending", ids(sortInventoryItems(unknownValue, "value", "desc")), ["c1", "a"]);

checkEqual("compact values", [999, 1000, 1049, 1050, 15300, 2.25e9, 7.04e12].map(formatCompactValue), [
  "999",
  "1K",
  "1K",
  "1.1K",
  "15.3K",
  "2.3B",
  "7T",
]);

done();
