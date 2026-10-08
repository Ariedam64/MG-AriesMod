// The two bulk deleters the Misc menu drives, each a controller from `run.ts`
// wired to how that item type is actually destroyed.
//
// Seeds go down the wishing well one at a time. Decor has no such command, so
// it is placed on an empty garden tile and removed again. That is two
// round-trips per item, which is why its delay budget is doubled where the
// estimate is shown.

import { sleep } from "../../lib/async";
import { PlayerService } from "../../game/player";
import { toastSimple } from "../../ui/toast";
import { readInventorySlotReserveEnabled } from "../misc/inventoryReserve";
import { createDeleterController, type DeleterController } from "./run";
import { DECOR_STORAGE_ID, SEED_STORAGE_ID, getDecorEntries, getSeedEntries } from "./sources";

/** Pause between two seed wishes. */
export const SEED_DELETE_DELAY_MS = 35;
/** Pause between placing a decor and picking it up, and between two decor. */
export const DECOR_DELETE_DELAY_MS = 35;

/** Garden tiles scanned for a free spot: the dirt plot, then the boardwalk. */
const DIRT_TILE_COUNT = 200;
const BOARDWALK_TILE_COUNT = 76;

type GardenSlot = { tileType: "Dirt" | "Boardwalk"; index: number };

async function findFirstEmptySlot(): Promise<GardenSlot | null> {
  const state = await PlayerService.getGardenState();
  const isFree = (objects: Record<string, unknown> | undefined, index: number) =>
    objects?.[String(index)] == null;

  for (let i = 0; i < DIRT_TILE_COUNT; i++) {
    if (isFree(state?.tileObjects, i)) return { tileType: "Dirt", index: i };
  }
  for (let i = 0; i < BOARDWALK_TILE_COUNT; i++) {
    if (isFree(state?.boardwalkTileObjects, i)) return { tileType: "Boardwalk", index: i };
  }
  return null;
}

const toast = (title: string, message: string, kind: "info" | "error" | "success") => {
  void toastSimple(title, message, kind);
};

const withdraw = async (id: string, storageId: string, qty: number): Promise<void> => {
  await PlayerService.retrieveItemFromStorage(id, storageId, qty);
};

export const seedDeleter: DeleterController = createDeleterController({
  toastTitle: "Seed deleter",
  unitNoun: "seeds",
  storageId: SEED_STORAGE_ID,
  loadEntries: getSeedEntries,
  isGuardEnabled: readInventorySlotReserveEnabled,
  toast,
  async deleteOne(species) {
    await PlayerService.wish(species);
  },
  withdraw,
});

export const decorDeleter: DeleterController = createDeleterController({
  toastTitle: "Decor deleter",
  unitNoun: "decor",
  storageId: DECOR_STORAGE_ID,
  loadEntries: getDecorEntries,
  isGuardEnabled: readInventorySlotReserveEnabled,
  toast,
  async deleteOne(decorId, delayMs) {
    // Re-read every time: the tile used last round is free again, but the
    // player may have planted on it in the meantime.
    const slot = await findFirstEmptySlot();
    if (!slot) throw new Error("No empty garden tile to delete decor on.");

    await PlayerService.placeDecor(slot.tileType, slot.index, decorId, 0);
    if (delayMs > 0) await sleep(delayMs);
    await PlayerService.removeGardenObject(slot.index, slot.tileType);
  },
  withdraw,
});
