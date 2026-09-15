// src/services/deleters.ts
//
// The two bulk deleters the Misc menu drives, each a controller from
// `deleterRun` wired to how that item type is actually destroyed.
//
// Seeds go down the wishing well one at a time. Decor has no such command, so
// it is placed on an empty garden tile and removed again. That is two
// round-trips per item, which is why its delay budget is doubled where the
// estimate is shown.

import { createDeleterController, type DeleterController } from "./deleterRun";
import {
  DECOR_STORAGE_ID,
  SEED_STORAGE_ID,
  getDecorEntries,
  getSeedEntries,
} from "./deleterSources";
import { findFirstEmptySlot, readInventorySlotReserveEnabled } from "./misc";
import { PlayerService } from "./player";
import { toastSimple } from "../ui/toast";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const toast = (title: string, message: string, kind: "info" | "error" | "success") => {
  void toastSimple(title, message, kind);
};

const guardEnabled = () => {
  try {
    return readInventorySlotReserveEnabled(false);
  } catch {
    return false;
  }
};

const withdraw = async (id: string, storageId: string, qty: number): Promise<void> => {
  await PlayerService.retrieveItemFromStorage(id, storageId, undefined, qty);
};

export const seedDeleter: DeleterController = createDeleterController({
  eventPrefix: "qws:seeddeleter",
  toastTitle: "Seed deleter",
  unitNoun: "seeds",
  storageId: SEED_STORAGE_ID,
  targetKey: "species",
  loadEntries: getSeedEntries,
  isGuardEnabled: guardEnabled,
  toast,
  async deleteOne(species) {
    await PlayerService.wish(species);
  },
  withdraw,
});

export const decorDeleter: DeleterController = createDeleterController({
  eventPrefix: "qws:decordeleter",
  toastTitle: "Decor deleter",
  unitNoun: "decor",
  storageId: DECOR_STORAGE_ID,
  targetKey: "decorId",
  loadEntries: getDecorEntries,
  isGuardEnabled: guardEnabled,
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
