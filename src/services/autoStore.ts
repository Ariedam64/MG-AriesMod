// src/services/autoStore.ts
//
// Auto-store : dès qu'une pile augmente dans l'inventaire ET qu'une pile de la
// même clé existe déjà dans le stockage, on la renvoie automatiquement dedans.
// La logique est strictement identique pour chaque stockage (Seed Silo, Decor
// Shed, Tool Shack) : seuls changent les atoms, la clé d'item et l'id de
// stockage. D'où la fabrique `createAutoStore`.

import { PlayerService } from "./player";
import { Store } from "../store/api";
import { readAriesPath, writeAriesPath } from "../utils/localStorage";

const LOG_PREFIX = "[Misc][AutoStore]";
const log = (...args: unknown[]) => {
  try { console.log(LOG_PREFIX, ...args); } catch {}
};

const DEBOUNCE_MS = 800;
const RECENT_REMOVE_MS = 2000;
const ATOM_POLL_MS = 400;
const ATOM_TIMEOUT_MS = 10 * 60_000;

/** Ce que la fabrique attend d'un atom (label + lecture + abonnement). */
export interface AutoStoreAtom {
  label: string;
  get(): Promise<unknown>;
  onChange(cb: (next: unknown) => void): Promise<() => void>;
}

export interface AutoStoreConfig {
  /** Mot utilisé dans les logs, ex. "seed". */
  logName: string;
  /** Chemin de persistance sous la racine `aries_mod`, ex. `misc.autoStoreSeedSiloEnabled`. */
  storagePath: string;
  /** `storageId` envoyé à `PutItemInStorage`, ex. "SeedSilo". */
  storageId: string;
  /** Atom listant le contenu du stockage. */
  storageAtom: AutoStoreAtom;
  /** Atom listant l'inventaire correspondant. */
  inventoryAtom: AutoStoreAtom;
  /** Extrait la clé d'identité d'un item (species / decorId / toolId). */
  keyFromItem: (item: any) => string;
}

export interface AutoStoreController {
  isEnabled: (def?: boolean) => boolean;
  setEnabled: (on: boolean) => void;
  /** Démarre la surveillance si la préférence persistée est active. */
  bootIfEnabled: () => void;
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

const buildKeySet = (raw: unknown, getKey: (item: any) => string): Set<string> => {
  const set = new Set<string>();
  const list = Array.isArray(raw) ? raw : [];
  for (const item of list) {
    const key = getKey(item);
    if (!key) continue;
    const qty = normalizeQty(item?.quantity);
    if (qty <= 0) continue;
    set.add(key);
  }
  return set;
};

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

const readEnabledFlag = (path: string, def: boolean): boolean => {
  try {
    const stored = readAriesPath<unknown>(path);
    if (typeof stored === "boolean") return stored;
    if (stored === "1" || stored === 1) return true;
    if (stored === "0" || stored === 0) return false;
    return !!stored;
  } catch {
    return def;
  }
};

/**
 * Attend que les atoms du jeu soient réellement disponibles.
 *
 * `Store.subscribe` sur un label introuvable renvoie un unsubscribe vide sans
 * jamais s'abonner : démarrer trop tôt (le module est importé au boot du
 * userscript, avant l'enregistrement des atoms du jeu) laisse la feature
 * définitivement muette. On attend donc que les deux atoms existent ET que
 * l'inventaire soit chargé (tableau) avant de poser quoi que ce soit.
 */
async function waitForAtoms(
  storage: AutoStoreAtom,
  inventory: AutoStoreAtom,
  keepGoing: () => boolean,
): Promise<boolean> {
  const startedAt = Date.now();
  while (keepGoing() && Date.now() - startedAt < ATOM_TIMEOUT_MS) {
    try {
      const ready = (await Store.hasAtom(storage.label)) && (await Store.hasAtom(inventory.label));
      if (ready && Array.isArray(await inventory.get())) return true;
    } catch {}
    await new Promise<void>((resolve) => setTimeout(resolve, ATOM_POLL_MS));
  }
  return false;
}

export function createAutoStore(config: AutoStoreConfig): AutoStoreController {
  const { logName, storagePath, storageId, storageAtom, inventoryAtom, keyFromItem } = config;

  let enabled = readEnabledFlag(storagePath, false);

  let storedKeys = new Set<string>();
  let inventoryQty = new Map<string, number>();
  let queue = new Set<string>();
  let busy = false;
  let inventoryUnsub: (() => void) | null = null;
  let storageUnsub: (() => void) | null = null;
  let pendingKeys = new Set<string>();
  let pendingTimer: number | null = null;
  let removedAtByKey = new Map<string, number>();
  let startGeneration = 0;

  function queueStore(keys: string[]) {
    for (const key of keys) if (key) queue.add(key);
    if (keys.length) {
      log(`${logName} queue add`, { keys, queueSize: queue.size });
    }
    void flushQueue();
  }

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

    const ready = await waitForAtoms(storageAtom, inventoryAtom, isCurrent);
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

    // Rattrape ce qui est déjà dans l'inventaire au moment du démarrage :
    // ces stacks n'augmenteront plus, donc l'abonnement ne les verra jamais.
    const initialKeys = Array.from(inventoryQty.keys()).filter((key) => storedKeys.has(key));
    if (initialKeys.length) {
      log(`${logName} auto-store initial queue`, { keys: initialKeys });
      queueStore(initialKeys);
    }
  }

  function stop() {
    startGeneration++; // annule un démarrage encore en attente des atoms
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
    isEnabled: (def = false) => readEnabledFlag(storagePath, def),
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
