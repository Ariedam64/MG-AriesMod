// What the mod reads from the game's store, against the atoms build 1449 has.
//
// Eight atoms the mod used were gone from the game, and a missing label fails
// silently: `get` returns undefined and `onChange` never fires. This builds a
// store with only the atoms 1449 really registers and checks that the mod's
// readers still get their answers from them:
//   - the selected inventory index, now `mySelectedItemIndexAtom`;
//   - the active pets, from `myPredictedPetSlotsAtom` (`myPetInfosAtom` is gone);
//   - a full bag, which the game now decides as `items.length >= 100`;
//   - the coins a sold pet was worth, priced from the bag.
import { check, checkEqual, run } from "./_check";
import { createFakeStore, installFakeGame, primitive } from "./_fakeJotai";
import { Atoms } from "../src/game/store/atoms";
import { PlayerService, onActivePetsStructuralChangeNow } from "../src/game/player";
import { isInventoryFullForUnstackable } from "../src/data/rules/inventory";
import { petSaleValue } from "../src/features/stats/outgoingCounters";
import { computeInventoryItemValue } from "../src/features/inventory/value";

const store = createFakeStore();
const pet = (id: string, extra: Record<string, unknown> = {}) => ({
  id, petSpecies: "Bee", name: null, xp: 0, hunger: 1000, mutations: [], abilities: [], targetScale: 1, ...extra,
});
const selectedIndex = primitive<number | null>(2, "mySelectedItemIndexAtom");
const petSlots = primitive<any[]>([pet("p1"), pet("p2")], "myPredictedPetSlotsAtom");
const inventory = primitive<any>({ items: [{ ...pet("bag1"), itemType: "Pet" }], storages: [] }, "myInventoryAtom");
installFakeGame(store, {
  "/atoms/myAtoms.ts/mySelectedItemIndexAtom": selectedIndex,
  "/atoms/myAtoms.ts/myPredictedPetSlotsAtom": petSlots,
  "/atoms/myAtoms.ts/myInventoryAtom": inventory,
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

run(async () => {
  checkEqual("the selected index comes from mySelectedItemIndexAtom", await Atoms.inventory.myValidatedSelectedItemIndex.get(), 2);

  const pets = await PlayerService.getPets();
  checkEqual("the active pets come from the pet slots", Array.isArray(pets) ? pets.map((p) => p.slot.id) : pets, ["p1", "p2"]);

  const seen: string[][] = [];
  const stop = await onActivePetsStructuralChangeNow((next) => {
    seen.push(Array.isArray(next) ? next.map((p) => String(p.slot.id)) : []);
  });
  await tick();
  store.set(petSlots, [pet("p1", { xp: 500 }), pet("p2", { hunger: 10 })]);
  await tick();
  store.set(petSlots, [pet("p1", { xp: 500 })]);
  await tick();
  stop();
  checkEqual("structural changes only: xp and hunger do not count, a removal does", seen, [["p1", "p2"], ["p1"]]);

  check("99 entries is not a full bag", !isInventoryFullForUnstackable(new Array(99).fill({})));
  check("100 entries is a full bag", isInventoryFullForUnstackable(new Array(100).fill({})));

  const items = (store.get(inventory) as any).items;
  checkEqual("a sold pet is priced from the bag", petSaleValue(items, "bag1"), computeInventoryItemValue(items[0]));
  checkEqual("a pet not in the bag has no price", petSaleValue(items, "elsewhere"), null);
});
