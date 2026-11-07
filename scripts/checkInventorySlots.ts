// How many inventory slots are taken, now that the game has a tool ring.
//
// Since the tool ring, the game no longer counts the bag as `items.length`:
// an entry whose (itemType, id) is pinned in `inventory.toolRing` takes no
// slot, and the bag is full at 100 slots outside the ring. The mod still
// counted every entry, so a player with 4 tools in the ring was stopped 4
// slots early: "Keep one inventory slot free" dropped HatchEgg at 95 real
// slots, and the companion's hatching stopped at 94 (BR-39).
//
// What this guards:
//   - the reserve lets HatchEgg, HarvestCrop, PickupObject and a new purchase
//     through at 99 entries when 4 of them sit in the ring (95 slots);
//   - it still blocks at 99 real slots, with or without a ring, and a ring
//     entry with no matching item frees nothing;
//   - the companion reads the same 95 slots.
//
// Run with: npm run check:inventoryslots

import { checkEqual, run } from "./_check";
import { createFakeStore, installFakeGame, primitive } from "./_fakeJotai";
import { runOutgoing } from "../src/game/ws/outgoing";
import { installInventoryReserve, writeInventorySlotReserveEnabled } from "../src/features/misc/inventoryReserve";

const RING_TOOLS = ["ReplenishPotion", "Shovel", "ChilledPotion", "PlanterPot"];

const pets = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    itemType: "Pet",
    id: `pet-${i}`,
    petSpecies: "Bee",
    name: null,
    xp: 0,
    hunger: 1000,
    mutations: [],
    abilities: [],
    targetScale: 1,
  }));
const tools = (ids: string[]) => ids.map((toolId) => ({ itemType: "Tool", toolId, quantity: 1 }));
const ring = (ids: string[]) => ids.map((id) => ({ itemType: "Tool", id }));

/** 95 pets and the 4 ring tools: 99 entries, 95 slots for the game. */
const pinnedBag = () => ({ items: [...pets(95), ...tools(RING_TOOLS)], storages: [], toolRing: ring(RING_TOOLS) });

const store = createFakeStore();
const inventory = primitive<any>(pinnedBag(), "myInventoryAtom");
installFakeGame(store, { "/atoms/myAtoms.ts/myInventoryAtom": inventory });

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

const ACTIONS: Array<{ label: string; message: Record<string, unknown> }> = [
  { label: "HatchEgg", message: { type: "HatchEgg", slot: 3 } },
  { label: "HarvestCrop", message: { type: "HarvestCrop", slot: 12, slotsIndex: 0 } },
  { label: "PickupObject", message: { type: "PickupObject", objectId: "obj-1" } },
  { label: "a new seed purchase", message: { type: "PurchaseShopItem", shop: "seed", species: "Carrot" } },
];

const goesOut = (message: Record<string, unknown>) => runOutgoing({ ...message }) !== null;

run(async () => {
  writeInventorySlotReserveEnabled(true);
  installInventoryReserve();
  await settle();

  for (const { label, message } of ACTIONS) {
    checkEqual(`99 entries with 4 in the tool ring (95 slots): ${label} goes out`, goesOut(message), true);
  }

  store.set(inventory, { items: [...pets(99), ...tools(RING_TOOLS)], storages: [], toolRing: ring(RING_TOOLS) });
  await settle();
  checkEqual("103 entries with 4 in the tool ring (99 slots): HatchEgg is held back", goesOut(ACTIONS[0].message), false);

  store.set(inventory, { items: [...pets(95), ...tools(RING_TOOLS)], storages: [] });
  await settle();
  checkEqual("99 entries and no tool ring: HatchEgg is held back", goesOut(ACTIONS[0].message), false);

  store.set(inventory, { items: [...pets(95), ...tools(RING_TOOLS)], storages: [], toolRing: [] });
  await settle();
  checkEqual("99 entries and an empty tool ring: HatchEgg is held back", goesOut(ACTIONS[0].message), false);

  store.set(inventory, { items: pets(99), storages: [], toolRing: ring(["Shovel"]) });
  await settle();
  checkEqual("a ring tool with no entry in the bag frees no slot: HatchEgg is held back", goesOut(ACTIONS[0].message), false);

  writeInventorySlotReserveEnabled(false);
  checkEqual("with the reserve off, HatchEgg goes out at 99 slots", goesOut(ACTIONS[0].message), true);

  // The companion's serial hatching stops on this count (hatchRun.ts).
  store.set(inventory, pinnedBag());
  await settle();
  const { readInventoryCount } = await import("../src/features/companion/chat/hatchRead");
  checkEqual("the companion counts 95 slots for 99 entries with 4 in the tool ring", await readInventoryCount(), 95);
});
