import { Atoms, myDecorShedItems, mySeedSiloItems, myToolShackItems } from "../../game/store/atoms";
import {
  createAutoStore,
  storageKeyFromDecorId,
  storageKeyFromSpecies,
  storageKeyFromToolId,
} from "./autoStore";

/** One auto-store per storage building, toggled from the Misc menu. */
export const autoStores = {
  seedSilo: createAutoStore({
    logName: "seed",
    storagePath: "misc.autoStoreSeedSiloEnabled",
    storageId: "SeedSilo",
    storageAtom: mySeedSiloItems,
    inventoryAtom: Atoms.inventory.mySeedInventory,
    keyFromItem: storageKeyFromSpecies,
  }),
  decorShed: createAutoStore({
    logName: "decor",
    storagePath: "misc.autoStoreDecorShedEnabled",
    storageId: "DecorShed",
    storageAtom: myDecorShedItems,
    inventoryAtom: Atoms.inventory.myDecorInventory,
    keyFromItem: storageKeyFromDecorId,
  }),
  toolShack: createAutoStore({
    logName: "tool",
    storagePath: "misc.autoStoreToolShackEnabled",
    storageId: "ToolShack",
    storageAtom: myToolShackItems,
    inventoryAtom: Atoms.inventory.myToolInventory,
    keyFromItem: storageKeyFromToolId,
  }),
};

/** Starts the auto-stores the player left on. Each waits for its atoms on its own. */
export function startAutoStores(): void {
  for (const store of Object.values(autoStores)) store.bootIfEnabled();
}
