// The garden editor's pure logic: the garden model and its slot ids, saved
// garden serialization, how a map tile resolves to an editor tile, the two
// slot-size models (placed plant and brush), and the mutation display order.
//
// The UI and the game-facing code are built on these, so a regression here
// shows up as a wrong tile, a vanished crop or a lost save.
//
// Run with: npm run check:editor

import { checkEqual, done } from "./_check";
import {
  ensureSlotIds,
  findPlayerSlot,
  makeEmptyGarden,
  sanitizeGarden,
  tileObjectAt,
  withTileObject,
} from "../src/features/editor/gardenModel";
import {
  MAX_SAVED_GARDENS,
  gardenSaveName,
  parseGardenJson,
  parseSavedGardens,
  prependSaved,
  replaceSaved,
  serializeGarden,
  uniqueGardenName,
  type SavedGarden,
} from "../src/features/editor/savedGardenList";
import { mapColumns, ownTileAt, slotTiles, tileCoordsOf } from "../src/features/editor/tileMap";
import {
  clampSizePercent,
  editSlotCustom,
  editSlotMode,
  editSlotPercent,
  initialSlotSize,
  parseSizeText,
} from "../src/features/editor/slotSize";
import {
  addBrushSlot,
  brushPlantObject,
  brushSlotSize,
  defaultBrushSlot,
  emptyBrushSlots,
  maxSlotsForPlant,
  patchBrushSlot,
  removeBrushSlot,
  syncBrushSlots,
  toggleBrushMutation,
} from "../src/features/editor/brushSlots";
import { sortMutationCatalogKeys, sortStoredMutationIds } from "../src/features/editor/mutationOrder";

/* ------------------------------- garden model ------------------------------ */

checkEqual(
  "slot ids: existing ids are kept, gaps filled from 0",
  ensureSlotIds([{ slotId: 1 }, { a: 1 }, {}]).map((s) => s.slotId),
  [1, 0, 2],
);
checkEqual("slot ids: not an array gives no slots", ensureSlotIds(null), []);

const sanitized = sanitizeGarden({
  tileObjects: { 3: { objectType: "plant", species: "Carrot", slots: [{ size: 60 }] }, 4: { objectType: "decor" } },
});
checkEqual("sanitize: plant slots get a slot id", sanitized.tileObjects["3"].slots, [{ size: 60, slotId: 0 }]);
checkEqual("sanitize: decor is left alone", sanitized.tileObjects["4"], { objectType: "decor" });
checkEqual("sanitize: a missing boardwalk map becomes empty", sanitized.boardwalkTileObjects, {});
checkEqual("sanitize: garbage becomes an empty garden", sanitizeGarden(42), makeEmptyGarden());

const placed = withTileObject(makeEmptyGarden(), "Boardwalk", 7, { objectType: "decor", decorId: "Bench" });
checkEqual("withTileObject places on the right map", tileObjectAt(placed, "Boardwalk", 7), { objectType: "decor", decorId: "Bench" });
checkEqual("withTileObject leaves the other map alone", tileObjectAt(placed, "Dirt", 7), null);
const removed = withTileObject(placed, "Boardwalk", 7, null);
checkEqual("withTileObject with null empties the tile", removed.boardwalkTileObjects, {});
checkEqual("withTileObject does not touch its input", Object.keys(placed.boardwalkTileObjects), ["7"]);

checkEqual(
  "findPlayerSlot: array, by userId",
  findPlayerSlot([{ userId: "a" }, { userId: "b" }], "b")?.index,
  1,
);
checkEqual(
  "findPlayerSlot: keyed object, numeric key order, index is the key",
  findPlayerSlot({ 10: { playerId: "x" }, 2: { playerId: "y" } }, "x")?.index,
  10,
);
checkEqual("findPlayerSlot: non numeric key gives 0", findPlayerSlot({ foo: { id: "z" } }, "z")?.index, 0);
checkEqual("findPlayerSlot: nobody matches", findPlayerSlot([{ userId: "a" }], "q"), null);

/* ------------------------------- saved gardens ----------------------------- */

const parsed = parseSavedGardens(
  [
    { id: "1", name: "Mine", createdAt: 5, garden: { tileObjects: { 0: { objectType: "plant", slots: [{}] } } } },
    { name: "no id" },
    { id: "2" },
  ],
  1000,
);
checkEqual("saved gardens: entries without an id are dropped", parsed.map((g) => g.id), ["1", "2"]);
checkEqual("saved gardens: defaults for name and date", [parsed[1].name, parsed[1].createdAt], ["Untitled", 1000]);
checkEqual("saved gardens: stored plants get slot ids", parsed[0].garden.tileObjects["0"].slots, [{ slotId: 0 }]);
checkEqual("saved gardens: not a list reads as empty", parseSavedGardens({ id: "1" }), []);

checkEqual("unique name: free name is kept", uniqueGardenName("B", ["A"]), "B");
checkEqual("unique name: numbered after the taken ones", uniqueGardenName("A", ["A", "A (1)"]), "A (2)");
checkEqual("save name: blank becomes Untitled", gardenSaveName("   "), "Untitled");
checkEqual("save name: trimmed", gardenSaveName("  Farm "), "Farm");

const save = (id: string): SavedGarden => ({ id, name: id, createdAt: 0, garden: makeEmptyGarden() });
const full = Array.from({ length: MAX_SAVED_GARDENS }, (_, i) => save(String(i)));
const afterPrepend = prependSaved(full, save("new"));
checkEqual("prepend: new save first, list capped", [afterPrepend[0].id, afterPrepend.length, afterPrepend.at(-1)?.id], ["new", MAX_SAVED_GARDENS, "48"]);
checkEqual(
  "replace: same position, new content",
  replaceSaved([save("a"), save("b")], { ...save("a"), name: "renamed" }).map((g) => g.name),
  ["renamed", "b"],
);

const garden = sanitizeGarden({ tileObjects: { 1: { objectType: "plant", species: "Carrot", slots: [{ size: 80 }] } } });
checkEqual("export then import gives the same garden", parseGardenJson(serializeGarden(garden)), garden);
checkEqual("import of something that is not JSON fails", parseGardenJson("{oops"), null);
checkEqual("import of an empty file fails", parseGardenJson(""), null);

/* --------------------------------- tile map -------------------------------- */

const map = {
  cols: 10,
  globalTileIdxToDirtTile: {
    12: { userSlotIdx: 0, dirtTileIdx: 3 },
    13: { userSlotIdx: 1, dirtTileIdx: 0 },
  },
  globalTileIdxToBoardwalk: {
    25: { userSlotIdx: 0, boardwalkTileIdx: 1 },
  },
};

checkEqual("ownTileAt: own dirt tile", ownTileAt(map, 2, 1, 0), { tileType: "Dirt", localTileIndex: 3, userSlotIdx: 0 });
checkEqual("ownTileAt: someone else's tile", ownTileAt(map, 3, 1, 0), null);
checkEqual("ownTileAt: own boardwalk tile", ownTileAt(map, 5, 2, 0), { tileType: "Boardwalk", localTileIndex: 1, userSlotIdx: 0 });
checkEqual("ownTileAt: past the map's width", ownTileAt(map, 12, 1, 0), null);
checkEqual("ownTileAt: no map", ownTileAt(null, 2, 1, 0), null);
checkEqual("tileCoordsOf: dirt", tileCoordsOf(map, { tileType: "Dirt", localTileIndex: 3, userSlotIdx: 0 }), { x: 2, y: 1 });
checkEqual("tileCoordsOf: boardwalk", tileCoordsOf(map, { tileType: "Boardwalk", localTileIndex: 1, userSlotIdx: 0 }), { x: 5, y: 2 });
checkEqual("tileCoordsOf: unknown tile", tileCoordsOf(map, { tileType: "Dirt", localTileIndex: 9, userSlotIdx: 0 }), null);
checkEqual(
  "slotTiles: one garden's tiles, dirt first",
  slotTiles(map, 0),
  [
    { gidx: 12, tx: 2, ty: 1, localIdx: 3, tileType: "Dirt" },
    { gidx: 25, tx: 5, ty: 2, localIdx: 1, tileType: "Boardwalk" },
  ],
);
checkEqual("mapColumns: zero columns is not a map", mapColumns({ cols: 0 }), null);

/* ------------------------- slot size (placed plant) ------------------------ */

checkEqual("clamp: rounds into [50, 100]", [49.6, 75.5, 100.4].map(clampSizePercent), [50, 76, 100]);
checkEqual("clamp: not a number is the maximum", clampSizePercent(NaN), 100);
checkEqual("parse size: comma and spaces", [parseSizeText("7,5"), parseSizeText(" 80 ")], [7.5, 80]);
checkEqual("parse size: blank and text are not sizes", [parseSizeText(""), parseSizeText("abc")], [null, null]);

checkEqual("initial size: read from the slot", initialSlotSize({ size: 72 }, undefined), { pct: 72, size: 72, mode: "percent" });
checkEqual("initial size: unreadable slot shows the maximum", initialSlotSize({}, "custom"), { pct: 100, size: 100, mode: "custom" });

const three = [initialSlotSize({ size: 60 }, undefined), initialSlotSize({ size: 70 }, "custom"), initialSlotSize({ size: 80 }, undefined)];
const one = editSlotPercent(three, 1, 90.2, false);
checkEqual("slider, one slot: only that slot changes", one.states.map((s) => [s.pct, s.mode]), [[60, "percent"], [90, "percent"], [80, "percent"]]);
checkEqual("slider, one slot: writes the clamped size to that slot", [one.size, one.targets], [90, [1]]);
const all = editSlotPercent(three, 0, 55, true);
checkEqual("slider, all slots: every slot follows", all.states.map((s) => s.pct), [55, 55, 55]);
checkEqual("slider, all slots: written to every slot", all.targets, [0, 1, 2]);

const custom = editSlotCustom(three, 0, "150", false);
checkEqual("custom size: written as typed, shown clamped", [custom?.size, custom?.states[0]], [150, { pct: 100, size: 150, mode: "custom" }]);
checkEqual("custom size: blank changes nothing", editSlotCustom(three, 0, "", false), null);
const back = editSlotMode(custom!.states, 0, "percent", false);
checkEqual("leaving custom mode brings the size back in range", [back.size, back.states[0]], [100, { pct: 100, size: 100, mode: "percent" }]);
const allCustom = editSlotMode(three, 2, "custom", true);
checkEqual("custom toggle, all slots: every slot takes the size and mode", allCustom.states, [
  { pct: 80, size: 80, mode: "custom" },
  { pct: 80, size: 80, mode: "custom" },
  { pct: 80, size: 80, mode: "custom" },
]);

/* -------------------------------- brush slots ------------------------------ */

checkEqual(
  "max slots: multi harvest uses its offsets",
  [
    maxSlotsForPlant({ plant: { harvestType: "Multiple", slotOffsets: [1, 2, 3] } }),
    maxSlotsForPlant({ plant: { harvestType: "Single", slotOffsets: [1, 2] } }),
    maxSlotsForPlant(null),
  ],
  [3, 1, 1],
);

const fresh = syncBrushSlots(emptyBrushSlots(), "Tomato", 3);
checkEqual("brush: a new species starts with every slot at the default", fresh.slots, [defaultBrushSlot(), defaultBrushSlot(), defaultBrushSlot()]);
checkEqual("brush: same species keeps its slots, cut to the max", syncBrushSlots(fresh, "Tomato", 2).slots.length, 2);
checkEqual("brush: never fewer than one slot", syncBrushSlots({ ...fresh, slots: [] }, "Tomato", 3).slots.length, 1);
checkEqual(
  "brush: a custom slot is normalized to its clamped size",
  syncBrushSlots({ ...fresh, slots: [{ ...defaultBrushSlot(), sizeMode: "custom", customScale: 300 }] }, "Tomato", 3).slots[0],
  { enabled: true, sizePercent: 100, customScale: 100, sizeMode: "custom", mutations: [] },
);
checkEqual(
  "brush: a different species resets",
  syncBrushSlots({ ...fresh, applyAll: true }, "Carrot", 1),
  { species: "Carrot", slots: [defaultBrushSlot()], applyAll: false },
);

const patchedOne = patchBrushSlot(fresh, 1, "percent", { sizePercent: 80 });
checkEqual("brush patch: one slot", patchedOne.slots.map((s) => s.sizePercent), [50, 80, 50]);
const patchedAll = patchBrushSlot({ ...fresh, applyAll: true }, 1, "custom", { customScale: 90 });
checkEqual("brush patch: edit all writes every slot and its mode", patchedAll.slots.map((s) => [s.sizeMode, s.customScale]), [["custom", 90], ["custom", 90], ["custom", 90]]);

const withGold = toggleBrushMutation(fresh, 0, "Gold");
checkEqual("brush mutation: added", withGold.slots.map((s) => s.mutations), [["Gold"], [], []]);
checkEqual("brush mutation: toggled off", toggleBrushMutation(withGold, 0, "Gold").slots[0].mutations, []);
checkEqual("brush slots: add stops at the max", addBrushSlot(fresh, 3).slots.length, 3);
checkEqual("brush slots: remove keeps one", removeBrushSlot({ ...fresh, slots: [defaultBrushSlot()] }).slots.length, 1);
checkEqual(
  "brush size: custom uses the typed size, percent the slider",
  [brushSlotSize({ ...defaultBrushSlot(), sizeMode: "custom", customScale: 77 }), brushSlotSize({ ...defaultBrushSlot(), sizePercent: 66 })],
  [77, 66],
);

const plant = brushPlantObject("Tomato", [{ ...defaultBrushSlot(), sizePercent: 70, mutations: ["Wet"] }, { ...defaultBrushSlot(), enabled: false }, defaultBrushSlot()], 3);
checkEqual("brush plant: one slot per enabled config, with ids", plant?.slots.map((s: any) => [s.slotId, s.size, s.mutations]), [[0, 70, ["Wet"]], [1, 50, []]]);
checkEqual("brush plant: a plant tile object", [plant?.objectType, plant?.species], ["plant", "Tomato"]);
checkEqual("brush plant: nothing enabled places nothing", brushPlantObject("Tomato", [{ ...defaultBrushSlot(), enabled: false }], 1), null);

/* ------------------------------ mutation order ----------------------------- */

const mutations = {
  Gold: { baseChance: 1, coinMultiplier: 20 },
  Rainbow: { baseChance: 0.1, coinMultiplier: 50 },
  Wet: { coinMultiplier: 2 },
  Chilled: { coinMultiplier: 2 },
  Frozen: { coinMultiplier: 10 },
  Thunderstruck: { coinMultiplier: 5 },
  Thundercharged: { coinMultiplier: 6 },
  Dawnlit: { coinMultiplier: 2 },
  Dawncharged: { coinMultiplier: 3 },
  Amberlit: { name: "Amberlit", coinMultiplier: 5 },
};
const weathers = {
  Rain: { groupId: "Hydro", mutator: { mutation: "Wet" } },
  Frost: { groupId: "Hydro", mutator: { mutation: "Chilled" } },
  Dawn: { type: "lunar", mutations: [{ name: "Dawnlit" }] },
  AmberMoon: { groupId: "Lunar", mutator: { mutation: "Ambershine" } },
  Thunderstorm: { mutations: [{ name: "Thunderstruck" }] },
};
const ordered = sortMutationCatalogKeys(Object.keys(mutations), mutations, weathers);
checkEqual("mutation order: colour, hydro, lunar, each by multiplier", ordered, [
  "Gold", "Rainbow",
  "Chilled", "Wet", "Thunderstruck", "Thundercharged", "Frozen",
  "Dawnlit", "Dawncharged", "Amberlit",
]);
checkEqual(
  "mutation order: stored ids follow it, Ambershine as Amberlit, unknown last",
  sortStoredMutationIds(["Unknown", "Ambershine", "Wet", "Gold"], ordered),
  ["Gold", "Wet", "Ambershine", "Unknown"],
);

done();
