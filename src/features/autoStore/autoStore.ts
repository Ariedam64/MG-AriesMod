// Auto-store: as soon as a stack grows in the inventory and a stack with the
// same key already sits in the matching storage, it is sent back there. The
// logic is the same for every storage (Seed Silo, Decor Shed, Tool Shack);
// only the atoms, the item key and the storage id change, hence the factory.

import { waitUntil } from "../../lib/async";
import { PlayerService } from "../../game/player";
import { waitForAtom } from "../../game/store/jotai";
import { writeAriesPath } from "../../platform/storage";
import { readStoredFlag } from "../misc/storedFlag";

const LOG_PREFIX = "[Misc][AutoStore]";
const log = (...args: unknown[]) => {
  try { console.log(LOG_PREFIX, ...args); } catch {}
};

const DEBOUNCE_MS = 800;
const RECENT_REMOVE_MS = 2000;
const INVENTORY_POLL_MS = 400;
const READY_TIMEOUT_MS = 10 * 60_000;

/** What the factory needs from an atom: its label, a read and a subscription. */
interface AutoStoreAtom {
  label: string;
  get(): Promise<unknown>;
  onChange(cb: (next: unknown) => void): Promise<() => void>;
}

export interface AutoStoreConfig {
  /** Word used in the logs, e.g. "seed". */
  logName: string;
  /** Setting path under `aries_mod`, e.g. `misc.autoStoreSeedSiloEnabled`. */
  storagePath: string;
  /** Destination (`to`) of the `MoveItem`, e.g. "SeedSilo". */
  storageId: string;
  /** Atom listing what the storage holds. */
  storageAtom: AutoStoreAtom;
  /** Atom listing the matching inventory. */
  inventoryAtom: AutoStoreAtom;
  /** The item's identity key (species, decorId or toolId). */
  keyFromItem: (item: any) => string;
}

export interface AutoStoreController {
  isEnabled(): boolean;
  setEnabled(on: boolean): void;
  /** Starts watching if the saved setting is on. */
  bootIfEnabled(): void;
}

const normalizeKey = (value: unknown): string =>
  (typeof value === "string" ? value.trim() : "");

const normalizeQty = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};

const buildQtyMap = (raw: unknown, getKey: (item: any) => string): Map<string, number> => {
  const map = new Map<string, number>();
  const list = Array.isArray(raw) ? raw : [];
  for (const item of list) {
    const key = getKey(item);
    if (!key) continue;
    const qty = normalizeQty(item?.quantity);
    if (qty <= 0) continue;
    map.set(key, (map.get(key) ?? 0) + qty);
  }
  return map;
};

const buildKeySet = (raw: unknown, getKey: (item: any) => string): Set<string> =>
  new Set(buildQtyMap(raw, getKey).keys());

const diffIncreases = (prev: Map<string, number>, next: Map<string, number>): string[] => {
  const out: string[] = [];
  for (const [key, qty] of next) {
    const before = prev.get(key) ?? 0;
    if (qty > before) out.push(key);
  }
  return out;
};

const diffSet = (prev: Set<string>, next: Set<string>) => {
  const added: string[] = [];
  const removed: string[] = [];
  for (const key of next) if (!prev.has(key)) added.push(key);
  for (const key of prev) if (!next.has(key)) removed.push(key);
  return { added, removed };
};

const pruneRecentMap = (map: Map<string, number>, now: number, maxAgeMs = RECENT_REMOVE_MS * 4) => {
  for (const [key, ts] of map) {
    if (now - ts > maxAgeMs) map.delete(key);
  }
};

const summarizeQtyDelta = (prev: Map<string, number>, next: Map<string, number>, keys: string[]) =>
  keys.map((key) => ({
    key,
    before: prev.get(key) ?? 0,
    after: next.get(key) ?? 0,
  }));

/**
 * Waits until both atoms exist and the inventory has loaded (is an array).
 *
 * Subscribing to a label the game has not registered yet does nothing at all,
 * so starting at boot, before the game's atoms are there, would leave the
 * feature silent for the whole session.
 */
async function waitUntilReady(
  storage: AutoStoreAtom,
  inventory: AutoStoreAtom,
  keepGoing: () => boolean,
): Promise<boolean> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  const remainingMs = () => Math.max(1, deadline - Date.now());

  for (const atom of [storage, inventory]) {
    if (!(await waitForAtom(atom.label, { timeoutMs: remainingMs(), keepGoing }))) return false;
  }
  const loaded = await waitUntil(
    async () => !keepGoing() || Array.isArray(await inventory.get()),
    { timeoutMs: remainingMs(), intervalMs: INVENTORY_POLL_MS },
  );
  return !!loaded && keepGoing();
}

export function createAutoStore(config: AutoStoreConfig): AutoStoreController {
  const { logName, storagePath, storageId, storageAtom, inventoryAtom, keyFromItem } = config;

  let enabled = readStoredFlag(storagePath);

  let storedKeys = new Set<string>();
  let inventoryQty = new Map<string, number>();
  const queue = new Set<string>();
  let busy = false;
  let inventoryUnsub: (() => void) | null = null;
  let storageUnsub: (() => void) | null = null;
  const pendingKeys = new Set<string>();
  let pendingTimer: number | null = null;
  const removedAtByKey = new Map<string, number>();
  let startGeneration = 0;

  function queueStore(keys: string[]) {
    for (const key of keys) if (key) queue.add(key);
    if (keys.length) {
      log(`${logName} queue add`, { keys, queueSize: queue.size });
    }
    void flushQueue();
  }

  /**
   * Waits for the inventory to settle, then queues what grew. A key whose
   * storage stack has just been emptied is skipped: the player is most likely
   * taking that item out on purpose.
   */
  function queueStoreDebounced(keys: string[]) {
    for (const key of keys) if (key) pendingKeys.add(key);
    if (!pendingKeys.size) return;
    if (pendingTimer != null) return;
    pendingTimer = window.setTimeout(() => {
      pendingTimer = null;
      const now = Date.now();
      const pending = Array.from(pendingKeys);
      pendingKeys.clear();
      pruneRecentMap(removedAtByKey, now);
      const filtered: string[] = [];
      const skipped: string[] = [];
      for (const key of pending) {
        const removedAt = removedAtByKey.get(key) ?? 0;
        if (removedAt && (now - removedAt) <= RECENT_REMOVE_MS) {
          skipped.push(key);
        } else {
          filtered.push(key);
        }
      }
      log(`${logName} pending flush`, { pending, filtered, skipped });
      if (filtered.length) queueStore(filtered);
    }, DEBOUNCE_MS);
  }

  async function flushQueue() {
    if (busy || !enabled) return;
    busy = true;
    try {
      while (queue.size && enabled) {
        const batch = Array.from(queue);
        queue.clear();
        log(`${logName} flush start`, { batchSize: batch.length, batch });
        for (const key of batch) {
          if (!enabled) return;
          if (!storedKeys.has(key)) {
            log(`${logName} skip (not in storage)`, { key, storageSize: storedKeys.size });
            continue;
          }
          try {
            await PlayerService.putItemInStorage(key, storageId);
            log(`${logName} stored`, { key });
          } catch (err) {
            log(`${logName} store failed`, { key, err });
          }
        }
      }
    } finally {
      busy = false;
    }
  }

  async function start() {
    if (inventoryUnsub || storageUnsub) return;
    if (typeof window === "undefined") return;

    const generation = ++startGeneration;
    const isCurrent = () => enabled && startGeneration === generation;

    const ready = await waitUntilReady(storageAtom, inventoryAtom, isCurrent);
    if (!ready || !isCurrent()) {
      log(`${logName} auto-store aborted`, { ready, enabled });
      return;
    }
    if (inventoryUnsub || storageUnsub) return;

    try { storedKeys = buildKeySet(await storageAtom.get(), keyFromItem); } catch {}
    try { inventoryQty = buildQtyMap(await inventoryAtom.get(), keyFromItem); } catch {}
    log(`${logName} auto-store start`, { storageSize: storedKeys.size, inventoryKeys: inventoryQty.size });

    try {
      storageUnsub = await storageAtom.onChange((next) => {
        const prev = storedKeys;
        const nextSet = buildKeySet(next, keyFromItem);
        storedKeys = nextSet;
        const diff = diffSet(prev, nextSet);
        if (diff.added.length || diff.removed.length) {
          if (diff.removed.length) {
            const now = Date.now();
            for (const key of diff.removed) removedAtByKey.set(key, now);
          }
          log(`${logName} storage items updated`, { size: nextSet.size, added: diff.added, removed: diff.removed });
        }
      });
    } catch {
      storageUnsub = null;
    }

    try {
      inventoryUnsub = await inventoryAtom.onChange((next) => {
        if (!enabled) return;
        const prevMap = inventoryQty;
        const nextMap = buildQtyMap(next, keyFromItem);
        const increased = diffIncreases(prevMap, nextMap);
        inventoryQty = nextMap;
        if (increased.length) {
          log(`${logName} inventory increased`, {
            changes: summarizeQtyDelta(prevMap, nextMap, increased),
            storageSize: storedKeys.size,
          });
          queueStoreDebounced(increased);
        }
      });
    } catch {
      inventoryUnsub = null;
    }

    // What is already in the inventory at start will not grow again, so the
    // subscription would never see it: queue it now.
    const initialKeys = Array.from(inventoryQty.keys()).filter((key) => storedKeys.has(key));
    if (initialKeys.length) {
      log(`${logName} auto-store initial queue`, { keys: initialKeys });
      queueStore(initialKeys);
    }
  }

  function stop() {
    startGeneration++; // cancels a start still waiting for the atoms
    try { inventoryUnsub?.(); } catch {}
    try { storageUnsub?.(); } catch {}
    inventoryUnsub = null;
    storageUnsub = null;
    queue.clear();
    busy = false;
    storedKeys.clear();
    inventoryQty.clear();
    pendingKeys.clear();
    if (pendingTimer != null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    removedAtByKey.clear();
    log(`${logName} auto-store stopped`);
  }

  return {
    isEnabled: () => readStoredFlag(storagePath),
    setEnabled(on: boolean) {
      const next = !!on;
      enabled = next;
      try { writeAriesPath(storagePath, next); } catch {}
      log(`${logName} auto-store toggle`, { enabled: next });
      if (next) {
        void start();
      } else {
        stop();
      }
    },
    bootIfEnabled() {
      if (enabled) void start();
    },
  };
}

export const storageKeyFromSpecies = (item: any) => normalizeKey(item?.species);
export const storageKeyFromDecorId = (item: any) => normalizeKey(item?.decorId);
export const storageKeyFromToolId = (item: any) => normalizeKey(item?.toolId);
