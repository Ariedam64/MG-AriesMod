// src/services/misc.ts
import { PlayerService } from "./player";
import { decorCatalog, plantCatalog } from "../data";
import { Atoms, myDecorShedItems, mySeedSiloItems } from "../store/atoms";
import { fakeInventoryShow, isInventoryPanelOpen, waitInventoryPanelClosed, fakeInventoryHide } from "./fakeModal";
import { toastSimple } from "../ui/toast";
import { readAriesPath, writeAriesPath } from "../utils/localStorage";

/* ========================================================================== */
/*                               GHOST HELPERS                                */
/* ========================================================================== */

const PATH_GHOST_MODE = "misc.ghostMode";
const PATH_GHOST_DELAY = "misc.ghostDelayMs";
const DEFAULT_DELAY_MS = 50;
const PATH_AUTO_RECO_ENABLED = "misc.autoRecoEnabled";
const PATH_AUTO_RECO_DELAY = "misc.autoRecoDelayMs";
const AUTO_RECO_MIN_MS = 0;
const AUTO_RECO_MAX_MS = 5 * 60_000;
const AUTO_RECO_DEFAULT_MS = 60_000;

// Auto-reconnect temporarily disabled at the request of the game developers.
// Set back to false to restore the feature (UI toggle + reconnect behaviour).
export const AUTO_RECO_TEMPORARILY_DISABLED = true;
const PATH_KEEP_INVENTORY_SLOT_FREE = "misc.keepInventorySlotFree";
const PATH_AUTO_STORE_SEED_SILO_ENABLED = "misc.autoStoreSeedSiloEnabled";
const PATH_AUTO_STORE_DECOR_SHED_ENABLED = "misc.autoStoreDecorShedEnabled";

export const readGhostEnabled = (def = false): boolean => {
  try {
    const stored = readAriesPath<unknown>(PATH_GHOST_MODE);
    if (typeof stored === "boolean") return stored;
    if (stored === "1" || stored === 1) return true;
    if (stored === "0" || stored === 0) return false;
    return !!stored;
  } catch { return def; }
};
export const writeGhostEnabled = (v: boolean) => {
  try {
    writeAriesPath(PATH_GHOST_MODE, !!v);
  } catch (err) {
  }
};

export const getGhostDelayMs = (): number => {
  try {
    const stored = readAriesPath<unknown>(PATH_GHOST_DELAY);
    const n = Math.floor(Number(stored || DEFAULT_DELAY_MS));
    return Math.max(5, n);
  } catch { return DEFAULT_DELAY_MS; }
};
export const setGhostDelayMs = (n: number) => {
  const v = Math.max(5, Math.floor(n || DEFAULT_DELAY_MS));
  try {
    writeAriesPath(PATH_GHOST_DELAY, v);
  } catch (err) {
  }
};

const clampAutoRecoDelay = (ms: number) => {
  const safeMs = Number.isFinite(ms) ? Math.floor(ms) : AUTO_RECO_DEFAULT_MS;
  return Math.min(AUTO_RECO_MAX_MS, Math.max(AUTO_RECO_MIN_MS, safeMs));
};

export const readAutoRecoEnabled = (def = false): boolean => {
  try {
    const stored = readAriesPath<unknown>(PATH_AUTO_RECO_ENABLED);
    if (typeof stored === "boolean") return stored;
    if (stored === "1" || stored === 1) return true;
    if (stored === "0" || stored === 0) return false;
    return !!stored;
  } catch { return def; }
};
export const writeAutoRecoEnabled = (on: boolean) => {
  try { writeAriesPath(PATH_AUTO_RECO_ENABLED, !!on); } catch {}
};

export const getAutoRecoDelayMs = (): number => {
  try {
    const raw = Number(readAriesPath<unknown>(PATH_AUTO_RECO_DELAY));
    if (Number.isFinite(raw)) return clampAutoRecoDelay(raw);
  } catch {}
  return AUTO_RECO_DEFAULT_MS;
};
export const setAutoRecoDelayMs = (ms: number) => {
  const v = clampAutoRecoDelay(ms);
  try { writeAriesPath(PATH_AUTO_RECO_DELAY, v); } catch {}
};

export const readInventorySlotReserveEnabled = (def = false): boolean => {
  try {
    const stored = readAriesPath<unknown>(PATH_KEEP_INVENTORY_SLOT_FREE);
    if (typeof stored === "boolean") return stored;
    if (stored === "1" || stored === 1) return true;
    if (stored === "0" || stored === 0) return false;
    return !!stored;
  } catch {
    return def;
  }
};

export const writeInventorySlotReserveEnabled = (on: boolean) => {
  try { writeAriesPath(PATH_KEEP_INVENTORY_SLOT_FREE, !!on); } catch {}
};

export const readAutoStoreSeedSiloEnabled = (def = false): boolean => {
  try {
    const stored = readAriesPath<unknown>(PATH_AUTO_STORE_SEED_SILO_ENABLED);
    if (typeof stored === "boolean") return stored;
    if (stored === "1" || stored === 1) return true;
    if (stored === "0" || stored === 0) return false;
    return !!stored;
  } catch {
    return def;
  }
};

export const readAutoStoreDecorShedEnabled = (def = false): boolean => {
  try {
    const stored = readAriesPath<unknown>(PATH_AUTO_STORE_DECOR_SHED_ENABLED);
    if (typeof stored === "boolean") return stored;
    if (stored === "1" || stored === 1) return true;
    if (stored === "0" || stored === 0) return false;
    return !!stored;
  } catch {
    return def;
  }
};

/* ========================================================================== */
/*                               GHOST CONTROLLER                             */
/* ========================================================================== */

export type GhostController = {
  start(): void;
  stop(): void;
  setSpeed(n: number): void;
  getSpeed(): number;
};

export function createGhostController(): GhostController {
  let DELAY_MS = getGhostDelayMs();
  const KEYS = new Set<string>();

  const onKeyDownCapture = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    const isMove =
      k === "z" || k === "q" || k === "s" || k === "d" || k === "w" || k === "a" ||
      e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight";
    if (!isMove) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat) return;
    KEYS.add(k);
  };
  const onKeyUpCapture = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    const isMove =
      k === "z" || k === "q" || k === "s" || k === "d" || k === "w" || k === "a" ||
      e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight";
    if (!isMove) return;
    e.preventDefault(); e.stopImmediatePropagation();
    KEYS.delete(k);
  };
  const onBlur = () => { KEYS.clear(); };
  const onVisibility = () => { if (document.hidden) KEYS.clear(); };

  function getDir() {
    let dx = 0, dy = 0;
    if (KEYS.has("z") || KEYS.has("w") || KEYS.has("arrowup")) dy -= 1;
    if (KEYS.has("s") || KEYS.has("arrowdown")) dy += 1;
    if (KEYS.has("q") || KEYS.has("a") || KEYS.has("arrowleft")) dx -= 1;
    if (KEYS.has("d") || KEYS.has("arrowright")) dx += 1;
    if (dx) dx = dx > 0 ? 1 : -1;
    if (dy) dy = dy > 0 ? 1 : -1;
    return { dx, dy };
  }

  let rafId: number | null = null;
  let lastTs = 0, accMs = 0, inMove = false;

  async function step(dx: number, dy: number) {
    let cur;
    try {
      cur = await PlayerService.getPosition();
    } catch (err) {
    }
    const cx = Math.round(cur?.x ?? 0), cy = Math.round(cur?.y ?? 0);
    try {
      await PlayerService.move(cx + dx, cy + dy);
    } catch (err) {
    }
  }

  const CAPTURE: AddEventListenerOptions = { capture: true };

  function frame(ts: number) {
    if (!lastTs) lastTs = ts;
    const dt = ts - lastTs; lastTs = ts;
    const { dx, dy } = getDir();
    accMs += dt;

    if (dx === 0 && dy === 0) {
      accMs = Math.min(accMs, DELAY_MS * 4);
      rafId = requestAnimationFrame(frame);
      return;
    }
    if (accMs >= DELAY_MS && !inMove) {
      accMs -= DELAY_MS;
      inMove = true;
      (async () => { try { await step(dx, dy); } finally { inMove = false; } })();
    }
    accMs = Math.min(accMs, DELAY_MS * 4);
    rafId = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (rafId !== null) return;
      lastTs = 0; accMs = 0; inMove = false;
      window.addEventListener("keydown", onKeyDownCapture, CAPTURE);
      window.addEventListener("keyup", onKeyUpCapture, CAPTURE);
      window.addEventListener("blur", onBlur);
      document.addEventListener("visibilitychange", onVisibility);
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      KEYS.clear();
      window.removeEventListener("keydown", onKeyDownCapture, CAPTURE);
      window.removeEventListener("keyup", onKeyUpCapture, CAPTURE);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    },
    setSpeed(n: number) {
      const v = Math.max(5, Math.floor(n || DEFAULT_DELAY_MS));
      DELAY_MS = v;
      setGhostDelayMs(v);
    },
    getSpeed() { return DELAY_MS; },
  };
}

/* ========================================================================== */
/*                              SEED DELETER LOGIC                            */
/* ========================================================================== */

export type SeedItem = {
  species: string;
  itemType: "Seed";
  quantity: number;
  id?: string;
};
export type DecorItem = {
  decorId: string;
  itemType: "Decor";
  quantity: number;
  id?: string;
};
export type InventoryShape = { items: any[]; favoritedItemIds?: string[] };

/* ========================================================================== */
/*                             AUTO STORAGE LOGIC                             */
/* ========================================================================== */

const normalizeStorageKey = (value: unknown): string =>
  (typeof value === "string" ? value.trim() : "");

const normalizeStorageQty = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};

const buildQtyMap = (raw: unknown, getKey: (item: any) => string): Map<string, number> => {
  const map = new Map<string, number>();
  const list = Array.isArray(raw) ? raw : [];
  for (const item of list) {
    const key = getKey(item);
    if (!key) continue;
    const qty = normalizeStorageQty(item?.quantity);
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
    const qty = normalizeStorageQty(item?.quantity);
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

const seedKeyFromItem = (item: any) => normalizeStorageKey(item?.species);
const decorKeyFromItem = (item: any) => normalizeStorageKey(item?.decorId);
const AUTO_STORE_LOG_PREFIX = "[Misc][AutoStore]";
const logAutoStore = (...args: any[]) => {
  try { console.log(AUTO_STORE_LOG_PREFIX, ...args); } catch {}
};
const AUTO_STORE_DEBOUNCE_MS = 800;
const AUTO_STORE_RECENT_REMOVE_MS = 2000;
const diffSet = (prev: Set<string>, next: Set<string>) => {
  const added: string[] = [];
  const removed: string[] = [];
  for (const key of next) if (!prev.has(key)) added.push(key);
  for (const key of prev) if (!next.has(key)) removed.push(key);
  return { added, removed };
};
const pruneRecentMap = (map: Map<string, number>, now: number, maxAgeMs = AUTO_STORE_RECENT_REMOVE_MS * 4) => {
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

let autoSeedSiloEnabled = readAutoStoreSeedSiloEnabled(false);
let autoDecorShedEnabled = readAutoStoreDecorShedEnabled(false);

let seedSiloItems = new Set<string>();
let seedInventoryQty = new Map<string, number>();
let seedSiloQueue = new Set<string>();
let seedSiloBusy = false;
let seedInvUnsub: (() => void) | null = null;
let seedSiloUnsub: (() => void) | null = null;
let seedPendingKeys = new Set<string>();
let seedPendingTimer: number | null = null;
let seedSiloRemovedAt = new Map<string, number>();

let decorShedItems = new Set<string>();
let decorInventoryQty = new Map<string, number>();
let decorShedQueue = new Set<string>();
let decorShedBusy = false;
let decorInvUnsub: (() => void) | null = null;
let decorShedUnsub: (() => void) | null = null;
let decorPendingKeys = new Set<string>();
let decorPendingTimer: number | null = null;
let decorShedRemovedAt = new Map<string, number>();

function queueSeedSiloStore(keys: string[]) {
  for (const key of keys) if (key) seedSiloQueue.add(key);
  if (keys.length) {
    logAutoStore("seed queue add", { keys, queueSize: seedSiloQueue.size });
  }
  void flushSeedSiloQueue();
}

function queueSeedSiloStoreDebounced(keys: string[]) {
  for (const key of keys) if (key) seedPendingKeys.add(key);
  if (!seedPendingKeys.size) return;
  if (seedPendingTimer != null) return;
  seedPendingTimer = window.setTimeout(() => {
    seedPendingTimer = null;
    const now = Date.now();
    const pending = Array.from(seedPendingKeys);
    seedPendingKeys.clear();
    pruneRecentMap(seedSiloRemovedAt, now);
    const filtered: string[] = [];
    const skipped: string[] = [];
    for (const key of pending) {
      const removedAt = seedSiloRemovedAt.get(key) ?? 0;
      if (removedAt && (now - removedAt) <= AUTO_STORE_RECENT_REMOVE_MS) {
        skipped.push(key);
      } else {
        filtered.push(key);
      }
    }
    logAutoStore("seed pending flush", { pending, filtered, skipped });
    if (filtered.length) queueSeedSiloStore(filtered);
  }, AUTO_STORE_DEBOUNCE_MS);
}

async function flushSeedSiloQueue() {
  if (seedSiloBusy || !autoSeedSiloEnabled) return;
  seedSiloBusy = true;
  try {
    while (seedSiloQueue.size && autoSeedSiloEnabled) {
      const batch = Array.from(seedSiloQueue);
      seedSiloQueue.clear();
      logAutoStore("seed flush start", { batchSize: batch.length, batch });
      for (const species of batch) {
        if (!autoSeedSiloEnabled) return;
        if (!seedSiloItems.has(species)) {
          logAutoStore("seed skip (not in silo)", { species, siloSize: seedSiloItems.size });
          continue;
        }
        try {
          await PlayerService.putItemInStorage(species, "SeedSilo");
          logAutoStore("seed stored", { species });
        } catch (err) {
          logAutoStore("seed store failed", { species, err });
        }
      }
    }
  } finally {
    seedSiloBusy = false;
  }
}

async function startSeedSiloAutoStore() {
  if (seedInvUnsub || seedSiloUnsub) return;
  if (typeof window === "undefined") return;

  try { seedSiloItems = buildKeySet(await mySeedSiloItems.get(), seedKeyFromItem); } catch {}
  try { seedInventoryQty = buildQtyMap(await Atoms.inventory.mySeedInventory.get(), seedKeyFromItem); } catch {}
  logAutoStore("seed auto-store start", { siloSize: seedSiloItems.size, inventoryKeys: seedInventoryQty.size });

  try {
    seedSiloUnsub = await mySeedSiloItems.onChange((next) => {
      const prev = seedSiloItems;
      const nextSet = buildKeySet(next, seedKeyFromItem);
      seedSiloItems = nextSet;
      const diff = diffSet(prev, nextSet);
      if (diff.added.length || diff.removed.length) {
        if (diff.removed.length) {
          const now = Date.now();
          for (const key of diff.removed) seedSiloRemovedAt.set(key, now);
        }
        logAutoStore("seed silo items updated", { size: nextSet.size, added: diff.added, removed: diff.removed });
      }
    });
  } catch {
    seedSiloUnsub = null;
  }

  try {
    seedInvUnsub = await Atoms.inventory.mySeedInventory.onChange((next) => {
      if (!autoSeedSiloEnabled) return;
      const prevMap = seedInventoryQty;
      const nextMap = buildQtyMap(next, seedKeyFromItem);
      const increased = diffIncreases(prevMap, nextMap);
      seedInventoryQty = nextMap;
      if (increased.length) {
        logAutoStore("seed inventory increased", {
          changes: summarizeQtyDelta(prevMap, nextMap, increased),
          siloSize: seedSiloItems.size,
        });
        queueSeedSiloStoreDebounced(increased);
      }
    });
  } catch {
    seedInvUnsub = null;
  }
}

function stopSeedSiloAutoStore() {
  try { seedInvUnsub?.(); } catch {}
  try { seedSiloUnsub?.(); } catch {}
  seedInvUnsub = null;
  seedSiloUnsub = null;
  seedSiloQueue.clear();
  seedSiloBusy = false;
  seedSiloItems.clear();
  seedInventoryQty.clear();
  seedPendingKeys.clear();
  if (seedPendingTimer != null) {
    clearTimeout(seedPendingTimer);
    seedPendingTimer = null;
  }
  seedSiloRemovedAt.clear();
  logAutoStore("seed auto-store stopped");
}

function queueDecorShedStore(keys: string[]) {
  for (const key of keys) if (key) decorShedQueue.add(key);
  if (keys.length) {
    logAutoStore("decor queue add", { keys, queueSize: decorShedQueue.size });
  }
  void flushDecorShedQueue();
}

function queueDecorShedStoreDebounced(keys: string[]) {
  for (const key of keys) if (key) decorPendingKeys.add(key);
  if (!decorPendingKeys.size) return;
  if (decorPendingTimer != null) return;
  decorPendingTimer = window.setTimeout(() => {
    decorPendingTimer = null;
    const now = Date.now();
    const pending = Array.from(decorPendingKeys);
    decorPendingKeys.clear();
    pruneRecentMap(decorShedRemovedAt, now);
    const filtered: string[] = [];
    const skipped: string[] = [];
    for (const key of pending) {
      const removedAt = decorShedRemovedAt.get(key) ?? 0;
      if (removedAt && (now - removedAt) <= AUTO_STORE_RECENT_REMOVE_MS) {
        skipped.push(key);
      } else {
        filtered.push(key);
      }
    }
    logAutoStore("decor pending flush", { pending, filtered, skipped });
    if (filtered.length) queueDecorShedStore(filtered);
  }, AUTO_STORE_DEBOUNCE_MS);
}

async function flushDecorShedQueue() {
  if (decorShedBusy || !autoDecorShedEnabled) return;
  decorShedBusy = true;
  try {
    while (decorShedQueue.size && autoDecorShedEnabled) {
      const batch = Array.from(decorShedQueue);
      decorShedQueue.clear();
      logAutoStore("decor flush start", { batchSize: batch.length, batch });
      for (const decorId of batch) {
        if (!autoDecorShedEnabled) return;
        if (!decorShedItems.has(decorId)) {
          logAutoStore("decor skip (not in shed)", { decorId, shedSize: decorShedItems.size });
          continue;
        }
        try {
          await PlayerService.putItemInStorage(decorId, "DecorShed");
          logAutoStore("decor stored", { decorId });
        } catch (err) {
          logAutoStore("decor store failed", { decorId, err });
        }
      }
    }
  } finally {
    decorShedBusy = false;
  }
}

async function startDecorShedAutoStore() {
  if (decorInvUnsub || decorShedUnsub) return;
  if (typeof window === "undefined") return;

  try { decorShedItems = buildKeySet(await myDecorShedItems.get(), decorKeyFromItem); } catch {}
  try { decorInventoryQty = buildQtyMap(await Atoms.inventory.myDecorInventory.get(), decorKeyFromItem); } catch {}
  logAutoStore("decor auto-store start", { shedSize: decorShedItems.size, inventoryKeys: decorInventoryQty.size });

  try {
    decorShedUnsub = await myDecorShedItems.onChange((next) => {
      const prev = decorShedItems;
      const nextSet = buildKeySet(next, decorKeyFromItem);
      decorShedItems = nextSet;
      const diff = diffSet(prev, nextSet);
      if (diff.added.length || diff.removed.length) {
        if (diff.removed.length) {
          const now = Date.now();
          for (const key of diff.removed) decorShedRemovedAt.set(key, now);
        }
        logAutoStore("decor shed items updated", { size: nextSet.size, added: diff.added, removed: diff.removed });
      }
    });
  } catch {
    decorShedUnsub = null;
  }

  try {
    decorInvUnsub = await Atoms.inventory.myDecorInventory.onChange((next) => {
      if (!autoDecorShedEnabled) return;
      const prevMap = decorInventoryQty;
      const nextMap = buildQtyMap(next, decorKeyFromItem);
      const increased = diffIncreases(prevMap, nextMap);
      decorInventoryQty = nextMap;
      if (increased.length) {
        logAutoStore("decor inventory increased", {
          changes: summarizeQtyDelta(prevMap, nextMap, increased),
          shedSize: decorShedItems.size,
        });
        queueDecorShedStoreDebounced(increased);
      }
    });
  } catch {
    decorInvUnsub = null;
  }
}

function stopDecorShedAutoStore() {
  try { decorInvUnsub?.(); } catch {}
  try { decorShedUnsub?.(); } catch {}
  decorInvUnsub = null;
  decorShedUnsub = null;
  decorShedQueue.clear();
  decorShedBusy = false;
  decorShedItems.clear();
  decorInventoryQty.clear();
  decorPendingKeys.clear();
  if (decorPendingTimer != null) {
    clearTimeout(decorPendingTimer);
    decorPendingTimer = null;
  }
  decorShedRemovedAt.clear();
  logAutoStore("decor auto-store stopped");
}

export function setAutoStoreSeedSiloEnabled(on: boolean) {
  const next = !!on;
  autoSeedSiloEnabled = next;
  try { writeAriesPath(PATH_AUTO_STORE_SEED_SILO_ENABLED, next); } catch {}
  logAutoStore("seed auto-store toggle", { enabled: next });
  if (next) {
    void (async () => {
      await startSeedSiloAutoStore();
      const keys = Array.from(seedInventoryQty.keys()).filter((k) => seedSiloItems.has(k));
      if (keys.length) {
        logAutoStore("seed auto-store initial queue", { keys });
        queueSeedSiloStore(keys);
      }
    })();
  } else {
    stopSeedSiloAutoStore();
  }
}

export function setAutoStoreDecorShedEnabled(on: boolean) {
  const next = !!on;
  autoDecorShedEnabled = next;
  try { writeAriesPath(PATH_AUTO_STORE_DECOR_SHED_ENABLED, next); } catch {}
  logAutoStore("decor auto-store toggle", { enabled: next });
  if (next) {
    void (async () => {
      await startDecorShedAutoStore();
      const keys = Array.from(decorInventoryQty.keys()).filter((k) => decorShedItems.has(k));
      if (keys.length) {
        logAutoStore("decor auto-store initial queue", { keys });
        queueDecorShedStore(keys);
      }
    })();
  } else {
    stopDecorShedAutoStore();
  }
}

if (autoSeedSiloEnabled) {
  void startSeedSiloAutoStore();
}
if (autoDecorShedEnabled) {
  void startDecorShedAutoStore();
}

// Ce que l’utilisateur sélectionne dans l’overlay
type SeedSelection = { name: string; qty: number; maxQty: number };
type DecorSelection = { name: string; qty: number; maxQty: number; decorId: string };

// État interne du flow de sélection
const selectedMap = new Map<string, SeedSelection>();      // key = display name (ex: "Tulip Seed")
let seedStockByName = new Map<string, number>();           // "Tulip Seed" -> quantité dispo
let seedSourceCache: SeedItem[] = [];                      // snapshot des seeds au lancement
const selectedDecorMap = new Map<string, DecorSelection>(); // key = display name
let decorStockByName = new Map<string, number>();           // display name -> quantité dispo
let decorSourceCache: DecorItem[] = [];                     // snapshot des decors au lancement
let _decorDeleteAbort: AbortController | null = null;
let _decorDeleteBusy = false;
let _decorDeletePaused = false;
let _decorDeletePauseResolver: (() => void) | null = null;

// ------ US number formatting ------
const NF_US = new Intl.NumberFormat("en-US");
const formatNum = (n: number) => NF_US.format(Math.max(0, Math.floor(n || 0)));

  async function clearUiSelectionAtoms() {
    try { await Atoms.inventory.mySelectedItemName.set(null); } catch {}
    try { await Atoms.inventory.mySelectedItemId.set(null); } catch {}
    try { await Atoms.inventory.myValidatedSelectedItemIndex.set(null); } catch {}
    try { await Atoms.inventory.myPossiblyNoLongerValidSelectedItemIndex.set(null); } catch {}
  }

// IDs/refs overlay
const OVERLAY_ID = "qws-seeddeleter-overlay";
const LIST_ID = "qws-seeddeleter-list";
const SUMMARY_ID = "qws-seeddeleter-summary";

const OVERLAY_DECOR_ID = "qws-decordeleter-overlay";
const LIST_DECOR_ID = "qws-decordeleter-list";
const SUMMARY_DECOR_ID = "qws-decordeleter-summary";

/* ------------------------------ helpers data ------------------------------ */

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/** Mappe les noms d’affichage (seed.name) vers la/les species depuis le plantCatalog. */
function buildDisplayNameToSpeciesFromCatalog(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  try {
    const cat = plantCatalog as any;
    for (const species of Object.keys(cat || {})) {
      const seedName: string =
        (cat?.[species]?.seed?.name && String(cat?.[species]?.seed?.name)) || `${species} Seed`;
      const arr = map.get(seedName) ?? [];
      arr.push(species);
      map.set(seedName, arr);
    }
  } catch {}
  return map;
}

/** Stock courant par species (depuis l’inventaire réel). */
async function buildSpeciesStockFromInventory(): Promise<Map<string, number>> {
  const inv = await getMySeedInventory();
  const stock = new Map<string, number>();
  for (const it of inv) {
    const q = Math.max(0, Math.floor(it.quantity || 0));
    if (q > 0) stock.set(it.species, (stock.get(it.species) ?? 0) + q);
  }
  return stock;
}

/** Répartit une demande “name/qty” sur les species candidates, en respectant le stock dispo. */
function allocateForRequestedName(
  requested: { name: string; qty: number },
  nameToSpecies: Map<string, string[]>,
  speciesStock: Map<string, number>
): { species: string; qty: number }[] {
  let remaining = Math.max(0, Math.floor(requested.qty || 0));
  // 1) species candidates via catalog
  let candidates = nameToSpecies.get(requested.name) ?? [];

  // 2) fallback best-effort: “Xxx Seed” -> “Xxx” si présent dans le catalog
  if (!candidates.length && / seed$/i.test(requested.name)) {
    const fallbackSpecies = requested.name.replace(/\s+seed$/i, "");
    if ((plantCatalog as any)?.[fallbackSpecies]) candidates = [fallbackSpecies];
  }

  if (!candidates.length || remaining <= 0) return [];

  // 3) tri par stock dispo (desc) pour consommer là où il y en a
  const ranked = candidates
    .map(sp => ({ sp, available: speciesStock.get(sp) ?? 0 }))
    .filter(x => x.available > 0)
    .sort((a, b) => b.available - a.available);

  const out: { species: string; qty: number }[] = [];
  for (const { sp, available } of ranked) {
    if (remaining <= 0) break;
    const take = Math.min(available, remaining);
    if (take > 0) {
      out.push({ species: sp, qty: take });
      remaining -= take;
    }
  }
  return out;
}

let _seedDeleteAbort: AbortController | null = null;
let _seedDeleteBusy = false;
let _seedDeletePaused = false;
let _seedDeletePauseResolver: (() => void) | null = null;

export const DEFAULT_SEED_DELETE_DELAY_MS = 35;

type DeleteOpts = {
  selection?: { name: string; qty: number }[]; // sinon on lit selectedMap
  delayMs?: number;                             // par défaut 35ms
  keepSelection?: boolean;                      // false => on clear à la fin
  onProgress?: (info: { done: number; total: number; species: string; remainingForSpecies: number }) => void;
};

async function waitSeedPause() {
  while (_seedDeletePaused) {
    await new Promise<void>((resolve) => {
      _seedDeletePauseResolver = resolve;
    });
    _seedDeletePauseResolver = null;
  }
}

/** Supprime les graines sélectionnées en appelant PlayerService.wish(species) autant de fois que qty. */
export async function deleteSelectedSeeds(opts: DeleteOpts = {}) {
  if (_seedDeleteBusy) {
    await toastSimple("Seed deleter", "Deletion already in progress.", "info");
    return;
  }

  const delayMs   = Math.max(0, Math.floor(opts.delayMs ?? DEFAULT_SEED_DELETE_DELAY_MS));

  // 1) Lire la sélection (ou utiliser celle passée en param)
  const selection = (opts.selection && Array.isArray(opts.selection) ? opts.selection : Array.from(selectedMap.values()))
    .map(s => ({ name: s.name, qty: Math.max(0, Math.floor(s.qty || 0)) }))
    .filter(s => s.qty > 0);

  if (selection.length === 0) {
    await toastSimple("Seed deleter", "No seeds selected.", "info");
    return;
  }

  // 2) Index catalog: displayName -> species[], et stock réel par species
  const nameToSpecies = buildDisplayNameToSpeciesFromCatalog();
  const speciesStock  = await buildSpeciesStockFromInventory();

  // 3) Allocation des quantités sur species selon stock
  const allocatedBySpecies = new Map<string, number>();
  let requestedTotal = 0, cappedTotal = 0;
  for (const req of selection) {
    requestedTotal += req.qty;
    const chunks = allocateForRequestedName(req, nameToSpecies, speciesStock);
    const okForThis = chunks.reduce((a, c) => a + c.qty, 0);
    cappedTotal += okForThis;
    for (const c of chunks) {
      allocatedBySpecies.set(c.species, (allocatedBySpecies.get(c.species) ?? 0) + c.qty);
    }
  }

  if (cappedTotal <= 0) {
    await toastSimple("Seed deleter", "Nothing to delete (not in inventory).", "info");
    return;
  }
  if (cappedTotal < requestedTotal) {
    await toastSimple(
      "Seed deleter",
      `Requested ${formatNum(requestedTotal)} but only ${formatNum(cappedTotal)} available. Proceeding.`,
      "info"
    );
  }

  // 4) Tâches par species
  const tasks = Array.from(allocatedBySpecies.entries())
    .map(([species, qty]) => ({ species, qty: Math.max(0, Math.floor(qty || 0)) }))
    .filter(t => t.qty > 0);

  const total = tasks.reduce((acc, t) => acc + t.qty, 0);
  if (total <= 0) {
    await toastSimple("Seed deleter", "Nothing to delete.", "info");
    return;
  }

  _seedDeleteBusy = true;
  const abort = new AbortController();
  _seedDeleteAbort = abort;

  try {
    await toastSimple("Seed deleter", `Deleting ${formatNum(total)} seeds across ${tasks.length} species...`, "info");

    let done = 0;
    let successfulDeletes = 0;
    for (const t of tasks) {
      let remaining = t.qty;
      while (remaining > 0) {
        if (abort.signal.aborted) throw new Error("Deletion cancelled.");
        await waitDecorPause();
        await waitSeedPause();

        let attemptSucceeded = false;
        try {
          await PlayerService.wish(t.species);
          attemptSucceeded = true;
        } catch (err) {
        }

        if (attemptSucceeded) successfulDeletes += 1;
        done += 1;
        remaining -= 1;

        try {
          opts.onProgress?.({ done, total, species: t.species, remainingForSpecies: remaining });
          window.dispatchEvent(new CustomEvent("qws:seeddeleter:progress", {
            detail: { done, total, species: t.species, remainingForSpecies: remaining }
          }));
        } catch {}

        if (delayMs > 0 && remaining > 0) await sleep(delayMs);

      }
    }

    if (!opts.keepSelection) selectedMap.clear();

    try {
      window.dispatchEvent(new CustomEvent("qws:seeddeleter:done", { detail: { total, speciesCount: tasks.length } }));
    } catch {}

    if (successfulDeletes > 0) {
      await toastSimple("Seed deleter", `Deleted ${formatNum(successfulDeletes)} seeds (${tasks.length} species).`, "success");
    } else {
      await toastSimple("Seed deleter", "No seeds were deleted (requests failed).", "info");
    }
  } catch (e: any) {
    const msg = e?.message || "Deletion failed.";
    try { window.dispatchEvent(new CustomEvent("qws:seeddeleter:error", { detail: { message: msg } })); } catch {}
    await toastSimple("Seed deleter", msg, "error");
  } finally {
    _seedDeleteBusy = false;
    _seedDeletePaused = false;
    _seedDeleteAbort = null;
    _seedDeletePauseResolver?.();
    _seedDeletePauseResolver = null;
  }
}

export function cancelSeedDeletion() {
  try {
    _seedDeletePaused = false;
    _seedDeletePauseResolver?.();
    _seedDeletePauseResolver = null;
    _seedDeleteAbort?.abort();
  } catch (err) {
  }
}
export function isSeedDeletionRunning() {
  return _seedDeleteBusy;
}
export function pauseSeedDeletion() {
  if (!_seedDeleteBusy || _seedDeletePaused) return;
  _seedDeletePaused = true;
  try {
    window.dispatchEvent(new CustomEvent("qws:seeddeleter:paused"));
  } catch {}
}
export function resumeSeedDeletion() {
  if (!_seedDeletePaused) return;
  _seedDeletePaused = false;
  _seedDeletePauseResolver?.();
  _seedDeletePauseResolver = null;
  try {
    window.dispatchEvent(new CustomEvent("qws:seeddeleter:resumed"));
  } catch {}
}
export function isSeedDeletionPaused() {
  return _seedDeletePaused;
}

/* Bridge : si ton UI envoie déjà `qws:seeddeleter:apply`, on déclenche la suppression. */
try {
  window.addEventListener("qws:seeddeleter:apply", async (e: any) => {
    try {
      const selection = Array.isArray(e?.detail?.selection) ? e.detail.selection : undefined;
      await deleteSelectedSeeds({ selection, delayMs: 35, keepSelection: false });
    } catch {}
  });
} catch {}

function seedDisplayNameFromSpecies(species: string): string {
  try {
    const node = (plantCatalog as any)?.[species];
    const n = node?.seed?.name;
    if (typeof n === "string" && n) return n;
  } catch {}
  return `${species} Seed`;
}

function normalizeSeedItem(x: any, _idx: number): SeedItem | null {
  if (!x || typeof x !== "object") return null;
  const species = typeof x.species === "string" ? x.species.trim() : "";
  const itemType = x.itemType === "Seed" ? "Seed" : null;
  const quantity = Number.isFinite(x.quantity) ? Math.max(0, Math.floor(x.quantity)) : 0;
  if (!species || itemType !== "Seed" || quantity <= 0) return null;
  return { species, itemType: "Seed", quantity, id: `seed:${species}` };
}

export async function getMySeedInventory(): Promise<SeedItem[]> {
  try {
    const raw = await Atoms.inventory.mySeedInventory.get();
    if (!Array.isArray(raw)) return [];
    const out: SeedItem[] = [];
    raw.forEach((x, i) => { const s = normalizeSeedItem(x, i); if (s) out.push(s); });
    return out;
  } catch { return []; }
}

function buildInventoryShapeFrom(items: SeedItem[]): InventoryShape {
  return { items, favoritedItemIds: [] };
}

function decorDisplayNameFromId(decorId: string): string {
  try {
    const node = (decorCatalog as any)?.[decorId];
    const n = node?.name;
    if (typeof n === "string" && n) return n;
  } catch {}
  return decorId || "Decor";
}

function normalizeDecorItem(x: any): DecorItem | null {
  if (!x || typeof x !== "object") return null;
  const decorId = typeof x.decorId === "string" ? x.decorId.trim() : "";
  const itemType = x.itemType === "Decor" ? "Decor" : null;
  const quantity = Number.isFinite(x.quantity) ? Math.max(0, Math.floor(x.quantity)) : 0;
  if (!decorId || itemType !== "Decor" || quantity <= 0) return null;
  return { decorId, itemType: "Decor", quantity, id: `decor:${decorId}` };
}

export async function getMyDecorInventory(): Promise<DecorItem[]> {
  try {
    const raw = await Atoms.inventory.myDecorInventory.get();
    if (!Array.isArray(raw)) return [];
    const out: DecorItem[] = [];
    raw.forEach((x) => { const s = normalizeDecorItem(x); if (s) out.push(s); });
    return out;
  } catch { return []; }
}

function buildDecorInventoryShapeFrom(items: DecorItem[]): InventoryShape {
  return { items, favoritedItemIds: [] };
}

// Remplit le cache des quantités par nom d’affichage
export async function buildSeedInventoryShape(): Promise<InventoryShape | null> {
  const seeds = await getMySeedInventory();
  seedStockByName.clear();
  for (const s of seeds) {
    const disp = seedDisplayNameFromSpecies(s.species);
    seedStockByName.set(disp, (seedStockByName.get(disp) ?? 0) + (s.quantity ?? 0));
  }
  if (!seeds.length) return null;
  return { items: seeds, favoritedItemIds: [] };
}

/* ------------------------------ overlay (UI) ------------------------------ */

function setStyles(el: HTMLElement, styles: Partial<CSSStyleDeclaration>) {
  Object.assign(el.style, styles);
}

function styleOverlayBox(div: HTMLDivElement, id: string) {
  div.id = id;
  setStyles(div, {
    position: "fixed",
    left: "12px",
    top: "12px",
    zIndex: "999999",
    display: "grid",
    gridTemplateRows: "auto auto 1px 1fr auto",
    gap: "6px",
    minWidth: "320px",
    maxWidth: "420px",
    maxHeight: "52vh",
    padding: "8px",
    border: "1px solid #39424c",
    borderRadius: "10px",
    background: "rgba(22,27,34,0.92)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    backdropFilter: "blur(2px)",
    userSelect: "none",
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
    fontSize: "12px",
    lineHeight: "1.25",
  } as any);
  (div as any).dataset["qwsSeedDeleter"] = "1";
}

function makeDraggable(root: HTMLDivElement, handle: HTMLElement) {
  let dragging = false;
  let ox = 0, oy = 0;

  const onDown = (e: MouseEvent) => {
    dragging = true;
    const r = root.getBoundingClientRect();
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp, { once: true });
  };
  const onMove = (e: MouseEvent) => {
    if (!dragging) return;
    const nx = Math.max(4, e.clientX - ox);
    const ny = Math.max(4, e.clientY - oy);
    root.style.left = `${nx}px`;
    root.style.top = `${ny}px`;
  };
  const onUp = () => {
    dragging = false;
    document.removeEventListener("mousemove", onMove);
  };

  handle.addEventListener("mousedown", onDown);
}

function createButton(label: string, styleOverride?: Partial<CSSStyleDeclaration>) {
  const b = document.createElement("button");
  b.textContent = label;
  setStyles(b, {
    padding: "4px 8px",
    borderRadius: "8px",
    border: "1px solid #4446",
    background: "#161b22",
    color: "#E7EEF7",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "12px",
    ...styleOverride,
  });
  b.onmouseenter = () => (b.style.borderColor = "#6aa1");
  b.onmouseleave = () => (b.style.borderColor = "#4446");
  return b;
}

// ------------ BLOCK GAME KEYS WHEN TYPING IN OVERLAY INPUTS ----------------
let overlayKeyGuardsOn = false;
function isInsideOverlay(el: Element | null) {
  return !!(el &&
    ((el as HTMLElement).closest?.(`#${OVERLAY_ID}`) ||
     (el as HTMLElement).closest?.(`#${OVERLAY_DECOR_ID}`)));
}
function keyGuardCapture(e: KeyboardEvent) {
  // Only when typing inside overlay inputs/textareas/contenteditable
  const ae = document.activeElement as HTMLElement | null;
  if (!isInsideOverlay(ae)) return;
  const tag = (ae?.tagName || "").toLowerCase();
  const isEditable = tag === "input" || tag === "textarea" || (ae && (ae as any).isContentEditable);
  if (!isEditable) return;
  // Block digits 0-9 (top row & numpad: e.key is still "0"-"9")
  if (/^[0-9]$/.test(e.key)) {
    // Let the input receive the key, but stop it from reaching the game
    e.stopImmediatePropagation();
  }
}
function installOverlayKeyGuards() {
  if (overlayKeyGuardsOn) return;
  window.addEventListener("keydown", keyGuardCapture, { capture: true });
  overlayKeyGuardsOn = true;
}
function removeOverlayKeyGuards() {
  if (!overlayKeyGuardsOn) return;
  window.removeEventListener("keydown", keyGuardCapture, { capture: true } as any);
  overlayKeyGuardsOn = false;
}
// ---------------------------------------------------------------------------

// Ferme proprement le faux inventaire (désactive les fakes + ferme la modale).
// Fallback: synthétise ESC si jamais ça jette.
async function closeSeedInventoryPanel() {
  try {
    await fakeInventoryHide();
  } catch {
    try {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    } catch {}
  }
}

function createSeedOverlay(): HTMLDivElement {
  const box = document.createElement("div");
  styleOverlayBox(box, OVERLAY_ID);

  const header = document.createElement("div");
  setStyles(header, { display: "flex", alignItems: "center", gap: "4px", cursor: "move" });

  const title = document.createElement("div");
  title.textContent = "🎯 Selection mode";
  setStyles(title, { fontWeight: "700", fontSize: "13px" });

  const hint = document.createElement("div");
  hint.textContent = "Click seeds in inventory to toggle selection.";
  setStyles(hint, { opacity: "0.8", fontSize: "11px" });

  const hr = document.createElement("div");
  setStyles(hr, { height: "1px", background: "#2d333b" });

  const list = document.createElement("div");
  list.id = LIST_ID;
  setStyles(list, {
    minHeight: "44px",
    maxHeight: "26vh",
    overflow: "auto",
    padding: "4px",
    border: "1px dashed #39424c",
    borderRadius: "8px",
    background: "rgba(15,19,24,0.84)",
    userSelect: "text",
  });

  const actions = document.createElement("div");
  setStyles(actions, { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" });

  const summary = document.createElement("div");
  summary.id = SUMMARY_ID;
  setStyles(summary, { fontWeight: "600" });
  summary.textContent = "Selected: 0 species · 0 seeds";

  const btnClear = createButton("Clear");
  btnClear.title = "Clear selection";
  btnClear.onclick = async () => {
    selectedMap.clear();
    refreshList();
    updateSummary();
    await clearUiSelectionAtoms();
    await repatchFakeSeedInventoryWithSelection();
  };

  _btnConfirm = createButton("Confirm", { background: "#1F2328CC" });
  _btnConfirm.disabled = true;
  _btnConfirm.onclick = async () => {
    await closeSeedInventoryPanel();
  };

  header.append(title);
  actions.append(summary, btnClear, _btnConfirm);
  box.append(header, hint, hr, list, actions);

  makeDraggable(box, header);
  return box;
}

function showSeedOverlay() {
  if (document.getElementById(OVERLAY_ID)) return;
  const el = createSeedOverlay();
  document.body.appendChild(el);
  installOverlayKeyGuards(); // <-- active key guard
  refreshList();
  updateSummary();
}
function hideSeedOverlay() {
  const el = document.getElementById(OVERLAY_ID);
  if (el) el.remove();
  if (!document.getElementById(OVERLAY_DECOR_ID)) removeOverlayKeyGuards();
}

/* --------------------------- sélection (atom) --------------------------- */

let _btnConfirm: HTMLButtonElement | null = null;
let unsubSelectedName: null | (() => void | Promise<void>) = null;
let unsubDecorSelectedName: null | (() => void | Promise<void>) = null;

function renderListRow(item: SeedSelection): HTMLElement {
  const row = document.createElement("div");
  setStyles(row, {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    alignItems: "center",
    gap: "6px",
    padding: "4px 6px",
    borderBottom: "1px dashed #2d333b",
  });

  const name = document.createElement("div");
  name.textContent = item.name;
  setStyles(name, {
    fontSize: "12px",
    fontWeight: "600",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });

  const controls = document.createElement("div");
  setStyles(controls, { display: "flex", alignItems: "center", gap: "6px" });

  const qty = document.createElement("input");
  qty.type = "number";
  qty.min = "1";
  qty.max = String(Math.max(1, item.maxQty));
  qty.step = "1";
  qty.value = String(item.qty);
  qty.className = "qmm-input";
  setStyles(qty, {
    width: "68px",
    height: "28px",
    border: "1px solid #4446",
    borderRadius: "8px",
    background: "rgba(15,19,24,0.90)",
    padding: "0 8px",
    fontSize: "12px",
  } as any);

  // Extra safety: stop bubbling digits from input itself (in case some listener is attached late)
  const swallowDigits = (e: KeyboardEvent) => {
    if (/^[0-9]$/.test(e.key)) {
      e.stopPropagation();
      e.stopImmediatePropagation();
      // not preventing default → the input still receives the digit
    }
  };
  qty.addEventListener("keydown", swallowDigits);


  const updateQty = async () => {
    const v = Math.min(item.maxQty, Math.max(1, Math.floor(Number(qty.value) || 1)));
    qty.value = String(v);
    const cur = selectedMap.get(item.name);
    if (!cur) return;
    cur.qty = v;
    selectedMap.set(item.name, cur);
    updateSummary();
    await repatchFakeSeedInventoryWithSelection();
  };
  qty.onchange = () => { void updateQty(); };
  qty.oninput = () => { void updateQty(); };

  const remove = createButton("Remove", { background: "transparent" });
  remove.onclick = async () => {
    selectedMap.delete(item.name);
    refreshList();
    updateSummary();
    await repatchFakeSeedInventoryWithSelection();
  };

  controls.append(qty, remove);
  row.append(name, controls);
  return row;
}

function refreshList() {
  const list = document.getElementById(LIST_ID) as HTMLDivElement | null;
  if (!list) return;
  list.innerHTML = "";
  const entries = Array.from(selectedMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = "No seeds selected.";
    empty.style.opacity = "0.8";
    list.appendChild(empty);
    return;
  }
  for (const it of entries) list.appendChild(renderListRow(it));
}

function totalSelected() {
  let species = 0, qty = 0;
  for (const it of selectedMap.values()) { species += 1; qty += it.qty; }
  return { species, qty };
}

function updateSummary() {
  const { species, qty } = totalSelected();
  const el = document.getElementById(SUMMARY_ID);
  if (el) el.textContent = `Selected: ${species} species · ${formatNum(qty)} seeds`;
  if (_btnConfirm) {
    _btnConfirm.textContent = "Confirm";
    _btnConfirm.disabled = qty <= 0;
    _btnConfirm.style.opacity = qty <= 0 ? "0.6" : "1";
    _btnConfirm.style.cursor = qty <= 0 ? "not-allowed" : "pointer";
  }
}

async function repatchFakeSeedInventoryWithSelection() {
  const src = Array.isArray(seedSourceCache) ? seedSourceCache : [];

  // Reste par nom d'affichage = stock initial - quantités sélectionnées
  const remainingByName = new Map<string, number>();
  for (const s of src) {
    const disp = seedDisplayNameFromSpecies(s.species);
    const qty = Math.max(0, Math.floor(s.quantity || 0));
    remainingByName.set(disp, (remainingByName.get(disp) ?? 0) + qty);
  }
  for (const sel of selectedMap.values()) {
    const cur = remainingByName.get(sel.name) ?? 0;
    const picked = Math.max(0, Math.floor(sel.qty || 0));
    remainingByName.set(sel.name, Math.max(0, cur - picked));
  }

  // Reconstruit la liste en tronquant chaque entrée avec ce qu'il reste
  const patched: SeedItem[] = [];
  for (const s of src) {
    const disp = seedDisplayNameFromSpecies(s.species);
    const remaining = remainingByName.get(disp) ?? 0;
    if (remaining <= 0) continue;
    const take = Math.min(remaining, Math.max(0, Math.floor(s.quantity || 0)));
    if (take <= 0) continue;
    patched.push({ ...s, quantity: take });
    remainingByName.set(disp, remaining - take);
  }

  try {
    await fakeInventoryShow({ items: patched, favoritedItemIds: [] }, { open: false });
  } catch {
    // panel fermé entre-temps → on ignore
  }
}

// Écoute la sélection côté UI inventaire
async function beginSelectedNameListener() {
  if (unsubSelectedName) return;

  const unsub = await Atoms.inventory.mySelectedItemName.onChange(async (name: string | null) => {
    const n = (name || "").trim();
    if (!n) return;

    const max = Math.max(1, seedStockByName.get(n) ?? 1);
    const existing = selectedMap.get(n);
    if (existing) {
      // Re-clicking a selected item bumps it back to the full remaining stock
      existing.qty = max;
      existing.maxQty = max;
      selectedMap.set(n, existing);
    } else {
      selectedMap.set(n, { name: n, qty: max, maxQty: max });
    }

    refreshList();
    updateSummary();

    await clearUiSelectionAtoms();
    await repatchFakeSeedInventoryWithSelection();
  });

  unsubSelectedName = typeof unsub === "function" ? unsub : null;
}

async function endSelectedNameListener() {
  const fn = unsubSelectedName;
  unsubSelectedName = null;
  try { await fn?.(); } catch {}
}

/* ------------------------- Ouverture simple (preview) ------------------------- */

export async function openSeedInventoryPreview() {
  try {
    const src = await getMySeedInventory();
    if (!src.length) {
      await toastSimple("Seed inventory", "No seeds to display.", "info");
      return;
    }
    await fakeInventoryShow(buildInventoryShapeFrom(src), { open: true });
  } catch (e: any) {
    await toastSimple("Seed inventory", e?.message || "Failed to open seed inventory.", "error");
  }
}

/* ---------------------------- Flow complet (selector) ---------------------------- */
/**
 * Cache le menu appelant via setWindowVisible(false),
 * ouvre l’inventaire des graines (seulement) + overlay discret déplaçable,
 * écoute les sélections, puis restaure l’UI à la fermeture.
 */
export async function openSeedSelectorFlow(setWindowVisible?: (v: boolean) => void) {
  try {
    setWindowVisible?.(false);

    seedSourceCache = await getMySeedInventory();
    seedStockByName = new Map<string, number>();
    for (const s of seedSourceCache) {
      const display = seedDisplayNameFromSpecies(s.species);
      seedStockByName.set(display, Math.max(1, Math.floor(s.quantity || 0)));
    }

    selectedMap.clear();
    showSeedOverlay();
    await beginSelectedNameListener();

    await fakeInventoryShow(buildInventoryShapeFrom(seedSourceCache), { open: true });

    if (await isInventoryPanelOpen()) {
      await waitInventoryPanelClosed();
    }
  } catch (e: any) {
    await toastSimple("Seed inventory", e?.message || "Failed to open seed selector.", "error");
  } finally {
    await endSelectedNameListener();
    hideSeedOverlay();
    seedSourceCache = [];
    seedStockByName.clear();
    setWindowVisible?.(true);
  }
}

/* ========================================================================== */
/*                          DECOR SELECTOR (overlay)                          */
/* ========================================================================== */

function createDecorOverlay(): HTMLDivElement {
  const box = document.createElement("div");
  styleOverlayBox(box, OVERLAY_DECOR_ID);

  const header = document.createElement("div");
  setStyles(header, { display: "flex", alignItems: "center", gap: "4px", cursor: "move" });

  const title = document.createElement("div");
  title.textContent = "Decor selection";
  setStyles(title, { fontWeight: "700", fontSize: "13px" });

  const hint = document.createElement("div");
  hint.textContent = "Click decor in inventory to toggle selection.";
  setStyles(hint, { opacity: "0.8", fontSize: "11px" });

  const hr = document.createElement("div");
  setStyles(hr, { height: "1px", background: "#2d333b" });

  const list = document.createElement("div");
  list.id = LIST_DECOR_ID;
  setStyles(list, {
    minHeight: "44px",
    maxHeight: "26vh",
    overflow: "auto",
    padding: "4px",
    border: "1px dashed #39424c",
    borderRadius: "8px",
    background: "rgba(15,19,24,0.84)",
    userSelect: "text",
  });

  const actions = document.createElement("div");
  setStyles(actions, { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" });

  const summary = document.createElement("div");
  summary.id = SUMMARY_DECOR_ID;
  setStyles(summary, { fontWeight: "600" });
  summary.textContent = "Selected: 0 decor · 0 items";

  const btnClear = createButton("Clear");
  btnClear.title = "Clear selection";
  btnClear.onclick = async () => {
    selectedDecorMap.clear();
    refreshDecorList();
    updateDecorSummary();
    await clearUiSelectionAtoms();
    await repatchFakeDecorInventoryWithSelection();
  };

  const btnConfirm = createButton("Confirm", { background: "#1F2328CC" });
  btnConfirm.disabled = true;
  btnConfirm.onclick = async () => {
    await closeSeedInventoryPanel();
  };

  header.append(title);
  actions.append(summary, btnClear, btnConfirm);
  box.append(header, hint, hr, list, actions);

  makeDraggable(box, header);

  (box as any).__btnConfirm = btnConfirm;
  return box;
}

function showDecorOverlay() {
  if (document.getElementById(OVERLAY_DECOR_ID)) return;
  const el = createDecorOverlay();
  document.body.appendChild(el);
  installOverlayKeyGuards();
  refreshDecorList();
  updateDecorSummary();
}
function hideDecorOverlay() {
  const el = document.getElementById(OVERLAY_DECOR_ID);
  if (el) el.remove();
  if (!document.getElementById(OVERLAY_ID)) removeOverlayKeyGuards();
}

function renderDecorListRow(item: DecorSelection): HTMLElement {
  const row = document.createElement("div");
  setStyles(row, {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    alignItems: "center",
    gap: "6px",
    padding: "4px 6px",
    borderBottom: "1px dashed #2d333b",
  });

  const name = document.createElement("div");
  name.textContent = item.name;
  setStyles(name, {
    fontSize: "12px",
    fontWeight: "600",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });

  const controls = document.createElement("div");
  setStyles(controls, { display: "flex", alignItems: "center", gap: "6px" });

  const qty = document.createElement("input");
  qty.type = "number";
  qty.min = "1";
  qty.max = String(Math.max(1, item.maxQty));
  qty.step = "1";
  qty.value = String(item.qty);
  qty.className = "qmm-input";
  setStyles(qty, {
    width: "68px",
    height: "28px",
    border: "1px solid #4446",
    borderRadius: "8px",
    background: "rgba(15,19,24,0.90)",
    padding: "0 8px",
    fontSize: "12px",
  } as any);

  const swallowDigits = (e: KeyboardEvent) => {
    if (/^[0-9]$/.test(e.key)) {
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  };
  qty.addEventListener("keydown", swallowDigits);

  const updateQty = async () => {
    const v = Math.min(item.maxQty, Math.max(1, Math.floor(Number(qty.value) || 1)));
    qty.value = String(v);
    const cur = selectedDecorMap.get(item.name);
    if (!cur) return;
    cur.qty = v;
    cur.maxQty = Math.max(cur.maxQty, v);
    selectedDecorMap.set(item.name, cur);
    updateDecorSummary();
    await repatchFakeDecorInventoryWithSelection();
  };
  qty.onchange = () => { void updateQty(); };
  qty.oninput = () => { void updateQty(); };

  const remove = createButton("Remove", { background: "transparent" });
  remove.onclick = async () => {
    selectedDecorMap.delete(item.name);
    refreshDecorList();
    updateDecorSummary();
    await repatchFakeDecorInventoryWithSelection();
  };

  controls.append(qty, remove);
  row.append(name, controls);
  return row;
}

function refreshDecorList() {
  const list = document.getElementById(LIST_DECOR_ID) as HTMLDivElement | null;
  if (!list) return;
  list.innerHTML = "";
  const entries = Array.from(selectedDecorMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = "No decor selected.";
    empty.style.opacity = "0.8";
    list.appendChild(empty);
    return;
  }
  for (const it of entries) list.appendChild(renderDecorListRow(it));
}

function totalDecorSelected() {
  let kinds = 0, qty = 0;
  for (const it of selectedDecorMap.values()) { kinds += 1; qty += it.qty; }
  return { kinds, qty };
}

function updateDecorSummary() {
  const { kinds, qty } = totalDecorSelected();
  const el = document.getElementById(SUMMARY_DECOR_ID);
  if (el) el.textContent = `Selected: ${kinds} decor · ${formatNum(qty)} items`;
  const overlay = document.getElementById(OVERLAY_DECOR_ID) as any;
  const btn = overlay?.__btnConfirm as HTMLButtonElement | undefined;
  if (btn) {
    btn.textContent = "Confirm";
    btn.disabled = qty <= 0;
    btn.style.opacity = qty <= 0 ? "0.6" : "1";
    btn.style.cursor = qty <= 0 ? "not-allowed" : "pointer";
  }
}

async function repatchFakeDecorInventoryWithSelection() {
  const src = Array.isArray(decorSourceCache) ? decorSourceCache : [];
  const remainingByName = new Map<string, number>();
  for (const s of src) {
    const disp = decorDisplayNameFromId(s.decorId);
    const qty = Math.max(0, Math.floor(s.quantity || 0));
    remainingByName.set(disp, (remainingByName.get(disp) ?? 0) + qty);
  }
  for (const sel of selectedDecorMap.values()) {
    const cur = remainingByName.get(sel.name) ?? 0;
    const picked = Math.max(0, Math.floor(sel.qty || 0));
    remainingByName.set(sel.name, Math.max(0, cur - picked));
  }

  const patched: DecorItem[] = [];
  for (const s of src) {
    const disp = decorDisplayNameFromId(s.decorId);
    const remaining = remainingByName.get(disp) ?? 0;
    if (remaining <= 0) continue;
    const take = Math.min(remaining, Math.max(0, Math.floor(s.quantity || 0)));
    if (take <= 0) continue;
    patched.push({ ...s, quantity: take });
    remainingByName.set(disp, remaining - take);
  }

  try {
    await fakeInventoryShow({ items: patched, favoritedItemIds: [] }, { open: false });
  } catch {}
}

async function beginSelectedDecorNameListener() {
  if (unsubDecorSelectedName) return;

  const unsub = await Atoms.inventory.mySelectedItemName.onChange(async (name: string | null) => {
    const n = (name || "").trim();
    if (!n) return;

    const max = Math.max(1, decorStockByName.get(n) ?? 1);
    const decorId = Array.from(decorSourceCache || []).find((d) => decorDisplayNameFromId(d.decorId) === n)?.decorId || n;
    const existing = selectedDecorMap.get(n);
    if (existing) {
      existing.qty = max;
      existing.maxQty = max;
      selectedDecorMap.set(n, existing);
    } else {
      selectedDecorMap.set(n, { name: n, qty: max, maxQty: max, decorId });
    }

    refreshDecorList();
    updateDecorSummary();

    await clearUiSelectionAtoms();
    await repatchFakeDecorInventoryWithSelection();
  });

  unsubDecorSelectedName = typeof unsub === "function" ? unsub : null;
}

async function endSelectedDecorNameListener() {
  const fn = unsubDecorSelectedName;
  unsubDecorSelectedName = null;
  try { await fn?.(); } catch {}
}

async function findFirstEmptySlot(): Promise<{ tileType: "Dirt" | "Boardwalk"; index: number } | null> {
  const state = await PlayerService.getGardenState();
  const dirt = state?.tileObjects || {};
  const boardwalk = state?.boardwalkTileObjects || {};

  for (let i = 0; i < 200; i++) {
    const key = String(i);
    const has = Object.prototype.hasOwnProperty.call(dirt, key) && dirt[key] != null;
    if (!has) return { tileType: "Dirt", index: i };
  }
  for (let i = 0; i < 76; i++) {
    const key = String(i);
    const has = Object.prototype.hasOwnProperty.call(boardwalk, key) && boardwalk[key] != null;
    if (!has) return { tileType: "Boardwalk", index: i };
  }
  return null;
}

export const DEFAULT_DECOR_DELETE_DELAY_MS = 35;

type DecorDeleteOpts = {
  selection?: DecorSelection[];
  delayMs?: number; // par défaut 35ms
  keepSelection?: boolean;
  onProgress?: (info: { done: number; total: number; decorId: string; remainingForDecor: number }) => void;
};

async function waitDecorPause() {
  while (_decorDeletePaused) {
    await new Promise<void>((resolve) => {
      _decorDeletePauseResolver = resolve;
    });
    _decorDeletePauseResolver = null;
  }
}

export async function deleteSelectedDecor(opts: DecorDeleteOpts = {}) {
  if (_decorDeleteBusy) {
    await toastSimple("Decor deleter", "Deletion already in progress.", "info");
    return;
  }

  const delayMs = Math.max(0, Math.floor(opts.delayMs ?? DEFAULT_DECOR_DELETE_DELAY_MS));

  const selection = (opts.selection && Array.isArray(opts.selection) ? opts.selection : Array.from(selectedDecorMap.values()))
    .map(s => ({ name: s.name, decorId: s.decorId, qty: Math.max(0, Math.floor(s.qty || 0)) }))
    .filter(s => s.qty > 0);

  if (!selection.length) {
    await toastSimple("Decor deleter", "No decor selected.", "info");
    return;
  }

  const stock = new Map<string, number>();
  (await getMyDecorInventory()).forEach((d) => {
    stock.set(d.decorId, (stock.get(d.decorId) ?? 0) + Math.max(0, Math.floor(d.quantity || 0)));
  });

  const tasks = selection
    .map(s => {
      const available = stock.get(s.decorId) ?? 0;
      const qty = Math.min(s.qty, available);
      return { decorId: s.decorId, qty, name: s.name };
    })
    .filter(t => t.qty > 0);

  const total = tasks.reduce((acc, t) => acc + t.qty, 0);
  if (total <= 0) {
    await toastSimple("Decor deleter", "Nothing to delete (not in inventory).", "info");
    return;
  }

  const emptySlot = await findFirstEmptySlot();
  if (!emptySlot) {
    await toastSimple("Decor deleter", "No empty slot available to delete decor (dirt 0-199, boardwalk 0-75).", "error");
    return;
  }

  _decorDeleteBusy = true;
  const abort = new AbortController();
  _decorDeleteAbort = abort;

  try {
    await toastSimple("Decor deleter", `Deleting ${formatNum(total)} decor items across ${tasks.length} types...`, "info");
    let done = 0;

    for (const t of tasks) {
      let remaining = t.qty;
      while (remaining > 0) {
        if (abort.signal.aborted) throw new Error("Deletion cancelled.");

        try { await PlayerService.placeDecor(emptySlot.tileType, emptySlot.index, t.decorId, 0); } catch {}
        if (delayMs > 0) await sleep(delayMs);
        try { await PlayerService.removeGardenObject(emptySlot.index, emptySlot.tileType); } catch {}
        if (delayMs > 0) await sleep(delayMs);

        done += 1;
        remaining -= 1;

        try {
          opts.onProgress?.({ done, total, decorId: t.decorId, remainingForDecor: remaining });
          window.dispatchEvent(new CustomEvent("qws:decordeleter:progress", {
            detail: { done, total, decorId: t.decorId, remainingForDecor: remaining }
          }));
        } catch {}

      }
    }

    if (!opts.keepSelection) selectedDecorMap.clear();

    try {
      window.dispatchEvent(new CustomEvent("qws:decordeleter:done", { detail: { total, decorCount: tasks.length } }));
    } catch {}

    await toastSimple("Decor deleter", `Deleted ${formatNum(total)} decor items (${tasks.length} types).`, "success");
  } catch (e: any) {
    const msg = e?.message || "Deletion failed.";
    try { window.dispatchEvent(new CustomEvent("qws:decordeleter:error", { detail: { message: msg } })); } catch {}
    await toastSimple("Decor deleter", msg, "error");
  } finally {
    _decorDeleteBusy = false;
    _decorDeletePaused = false;
    _decorDeleteAbort = null;
    _decorDeletePauseResolver?.();
    _decorDeletePauseResolver = null;
  }
}

export function cancelDecorDeletion() {
  try {
    _decorDeletePaused = false;
    _decorDeletePauseResolver?.();
    _decorDeletePauseResolver = null;
    _decorDeleteAbort?.abort();
  } catch {}
}
export function isDecorDeletionRunning() {
  return _decorDeleteBusy;
}
export function pauseDecorDeletion() {
  if (!_decorDeleteBusy || _decorDeletePaused) return;
  _decorDeletePaused = true;
  try {
    window.dispatchEvent(new CustomEvent("qws:decordeleter:paused"));
  } catch {}
}
export function resumeDecorDeletion() {
  if (!_decorDeletePaused) return;
  _decorDeletePaused = false;
  _decorDeletePauseResolver?.();
  _decorDeletePauseResolver = null;
  try {
    window.dispatchEvent(new CustomEvent("qws:decordeleter:resumed"));
  } catch {}
}
export function isDecorDeletionPaused() {
  return _decorDeletePaused;
}

export async function openDecorSelectorFlow(setWindowVisible?: (v: boolean) => void) {
  try {
    setWindowVisible?.(false);

    decorSourceCache = await getMyDecorInventory();
    decorStockByName = new Map<string, number>();
    for (const d of decorSourceCache) {
      const display = decorDisplayNameFromId(d.decorId);
      decorStockByName.set(display, Math.max(1, Math.floor(d.quantity || 0)));
    }

    selectedDecorMap.clear();
    showDecorOverlay();
    await beginSelectedDecorNameListener();

    await fakeInventoryShow(buildDecorInventoryShapeFrom(decorSourceCache), { open: true });

    if (await isInventoryPanelOpen()) {
      await waitInventoryPanelClosed();
    }
  } catch (e: any) {
    await toastSimple("Decor inventory", e?.message || "Failed to open decor selector.", "error");
  } finally {
    await endSelectedDecorNameListener();
    hideDecorOverlay();
    decorSourceCache = [];
    decorStockByName.clear();
    setWindowVisible?.(true);
  }
}

/* ========================================================================== */
/*                             SERVICE UNIQUE (facile)                        */
/* ========================================================================== */

export const MiscService = {
  // ghost
  readGhostEnabled,
  writeGhostEnabled,
  getGhostDelayMs,
  setGhostDelayMs,
  createGhostController,
  AUTO_RECO_TEMPORARILY_DISABLED,
  readAutoRecoEnabled,
  writeAutoRecoEnabled,
  getAutoRecoDelayMs,
  setAutoRecoDelayMs,
  readInventorySlotReserveEnabled,
  writeInventorySlotReserveEnabled,
  readAutoStoreSeedSiloEnabled,
  setAutoStoreSeedSiloEnabled,
  readAutoStoreDecorShedEnabled,
  setAutoStoreDecorShedEnabled,
  // seeds
  getMySeedInventory,
  openSeedInventoryPreview,
  openSeedSelectorFlow,

  //delete
  deleteSelectedSeeds,
  cancelSeedDeletion,
  isSeedDeletionRunning,
  pauseSeedDeletion,
  resumeSeedDeletion,
  isSeedDeletionPaused,

  getCurrentSeedSelection(): SeedSelection[] {
    return Array.from(selectedMap.values());
  },
  clearSeedSelection() {
    selectedMap.clear();
  },

  // decor
  getMyDecorInventory,
  openDecorSelectorFlow,
  deleteSelectedDecor,
  cancelDecorDeletion,
  isDecorDeletionRunning,
  pauseDecorDeletion,
  resumeDecorDeletion,
  isDecorDeletionPaused,

  getCurrentDecorSelection(): DecorSelection[] {
    return Array.from(selectedDecorMap.values());
  },
  clearDecorSelection() {
    selectedDecorMap.clear();
  },
};
