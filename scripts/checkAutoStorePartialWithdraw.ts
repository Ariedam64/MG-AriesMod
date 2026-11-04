// Auto-store sends a growing inventory stack back to its storage, except when
// the player has just taken that item out. That exception only fired when the
// storage stack was emptied: taking part of a stack out (the game sends
// `MoveItem` with a `quantity`) left the key in storage, so 800 ms later the
// whole inventory stack went straight back (BR-32, Crop Cleanser in the Tool
// Shack). The factory is shared, so seeds and decor were hit the same way.
//
// The suite drives a real `createAutoStore` with fake storage and inventory
// atoms, registered by label in a fake `jotaiAtomCache` so `waitForAtom` finds
// them, and records every `putItemInStorage` instead of sending it.
import { checkEqual, run } from "./_check";
import { sleep, waitUntil } from "../src/lib/async";
import { PlayerService } from "../src/game/player";
import {
  createAutoStore,
  storageKeyFromSpecies,
  storageKeyFromToolId,
} from "../src/features/autoStore/autoStore";

/** Longer than the 800 ms debounce plus the flush, shorter than the 2000 ms removal window. */
const SETTLE_MS = 1300;

interface FakeAtom {
  label: string;
  get(): Promise<unknown>;
  onChange(cb: (next: unknown) => void): Promise<() => void>;
  emit(next: unknown[]): void;
  subscriberCount(): number;
}

const atomCache = new Map<string, { debugLabel: string }>();
(globalThis as any).jotaiAtomCache = { cache: atomCache };

function makeAtom(label: string, initial: unknown[]): FakeAtom {
  let value: unknown = initial;
  const subs = new Set<(next: unknown) => void>();
  atomCache.set(`fake/${label}`, { debugLabel: label });
  return {
    label,
    get: async () => value,
    onChange: async (cb) => {
      subs.add(cb);
      return () => { subs.delete(cb); };
    },
    emit(next) {
      value = next;
      for (const cb of Array.from(subs)) cb(next);
    },
    subscriberCount: () => subs.size,
  };
}

const stored: Array<{ itemId: string; storageId: string }> = [];
PlayerService.putItemInStorage = async (itemId: string, storageId: string) => {
  stored.push({ itemId, storageId });
};

let scenarioIndex = 0;

interface Scenario {
  storage: FakeAtom;
  inventory: FakeAtom;
  stop(): void;
}

/** A started auto-store over fresh fake atoms, with the record of sends cleared. */
async function startScenario(
  storageId: string,
  keyFromItem: (item: any) => string,
  storageItems: unknown[],
  inventoryItems: unknown[],
): Promise<Scenario> {
  const n = ++scenarioIndex;
  const storage = makeAtom(`fakeStorage${n}Atom`, storageItems);
  const inventory = makeAtom(`fakeInventory${n}Atom`, inventoryItems);
  const controller = createAutoStore({
    logName: `check${n}`,
    storagePath: `misc.checkAutoStorePartialWithdraw${n}`,
    storageId,
    storageAtom: storage,
    inventoryAtom: inventory,
    keyFromItem,
  });
  controller.setEnabled(true);
  const started = await waitUntil(
    () => storage.subscriberCount() > 0 && inventory.subscriberCount() > 0,
    { timeoutMs: 5000, intervalMs: 20 },
  );
  if (!started) throw new Error(`auto-store ${n} never subscribed to its atoms`);
  // Let anything queued at start (nothing here) go through before recording.
  await sleep(50);
  stored.length = 0;
  return { storage, inventory, stop: () => controller.setEnabled(false) };
}

const cleanser = (quantity: number) => ({ toolId: "CropCleanser", itemType: "Tool", quantity });
const carrot = (quantity: number) => ({ species: "Carrot", itemType: "Seed", quantity });

run(async () => {
  // Taking 2 of 5 Crop Cleansers out of the Tool Shack: the storage update
  // arrives first, then the inventory one.
  {
    const s = await startScenario("ToolShack", storageKeyFromToolId, [cleanser(5)], []);
    s.storage.emit([cleanser(3)]);
    s.inventory.emit([cleanser(2)]);
    await sleep(SETTLE_MS);
    checkEqual("taking part of a Tool Shack stack out does not send it back", stored.slice(), []);
    s.stop();
  }

  // The same withdrawal with the two updates in the other order.
  {
    const s = await startScenario("ToolShack", storageKeyFromToolId, [cleanser(5)], []);
    s.inventory.emit([cleanser(2)]);
    s.storage.emit([cleanser(3)]);
    await sleep(SETTLE_MS);
    checkEqual("a partial withdrawal is kept when the inventory updates first", stored.slice(), []);
    s.stop();
  }

  // The factory is shared: a partial withdrawal from the Seed Silo too.
  {
    const s = await startScenario("SeedSilo", storageKeyFromSpecies, [carrot(10)], []);
    s.storage.emit([carrot(6)]);
    s.inventory.emit([carrot(4)]);
    await sleep(SETTLE_MS);
    checkEqual("taking part of a Seed Silo stack out does not send it back", stored.slice(), []);
    s.stop();
  }

  // Control: emptying the whole stack was already respected.
  {
    const s = await startScenario("ToolShack", storageKeyFromToolId, [cleanser(5)], []);
    s.storage.emit([]);
    s.inventory.emit([cleanser(5)]);
    await sleep(SETTLE_MS);
    checkEqual("taking a whole Tool Shack stack out does not send it back", stored.slice(), []);
    s.stop();
  }

  // Control: a purchase grows the inventory while the storage stays put, and
  // that still goes to storage.
  {
    const s = await startScenario("ToolShack", storageKeyFromToolId, [cleanser(5)], []);
    s.inventory.emit([cleanser(1)]);
    await sleep(SETTLE_MS);
    checkEqual(
      "a bought Crop Cleanser still goes to the Tool Shack",
      stored.slice(),
      [{ itemId: "CropCleanser", storageId: "ToolShack" }],
    );
    s.stop();
  }
});
