import {
  ARIES_STORAGE_VERSION,
  createDefaultAriesStorage,
  normalizeAriesStorage,
  type AriesStorage,
} from "./storageShape";

export type { AriesStorage } from "./storageShape";

/**
 * The mod's settings live in one localStorage entry, `aries_mod`, organised in
 * sections (`pets`, `locker`, `misc`, ...) and addressed by dotted paths such
 * as `misc.ghostMode`. A few values (the API key, notices already seen) live
 * in GM storage instead, which the website and the Discord activity share.
 */

const ARIES_STORAGE_KEY = "aries_mod";
const API_KEY_STORAGE_KEY = "aries_api_key";
const SEEN_ROOM_PRIVACY_NOTICE_KEY = "aries_seen_room_privacy_notice_v2";
const SEEN_AUTO_RECO_DISABLED_NOTICE_KEY = "aries_seen_autoreco_disabled_notice";
const SEEN_CHANGELOG_VERSION_KEY = "aries_seen_changelog_version";

// Reading and writing used to parse and stringify the whole blob on every
// call. With a large blob (a 500-entry activity log, stats) that blocked the
// main thread on every stat increment, visible as freezes while buying or
// harvesting. The parsed blob is cached and disk writes are batched.
const FLUSH_DELAY_MS = 500;

let cached: AriesStorage | null = null;
let flushTimer: number | null = null;
let flushPending = false;
let lifecycleHooksInstalled = false;

function getHostStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function installLifecycleHooksOnce(): void {
  if (lifecycleHooksInstalled || typeof window === "undefined") return;
  lifecycleHooksInstalled = true;
  window.addEventListener("pagehide", flushNow);
  window.addEventListener("beforeunload", flushNow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushNow();
  });
  // Another tab wrote the blob: drop the cache so the next read parses it
  // again. This tab's own writes do not fire `storage` here.
  window.addEventListener("storage", (event) => {
    if (event.key !== ARIES_STORAGE_KEY) return;
    if (flushPending) return; // our pending write supersedes it
    cached = null;
  });
}

function flushNow(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!flushPending || !cached) return;
  flushPending = false;
  try {
    getHostStorage()?.setItem(ARIES_STORAGE_KEY, JSON.stringify(cached));
  } catch {
    // Quota or privacy mode: the session keeps its cached copy.
  }
}

function load(): AriesStorage {
  if (cached) return cached;
  installLifecycleHooksOnce();

  const raw = getHostStorage()?.getItem(ARIES_STORAGE_KEY);
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {}
  }
  cached = parsed && typeof parsed === "object" ? normalizeAriesStorage(parsed) : createDefaultAriesStorage();
  return cached;
}

function persist(data: AriesStorage): void {
  cached = data;
  installLifecycleHooksOnce();
  flushPending = true;
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    flushNow();
  }, FLUSH_DELAY_MS);
}

const splitPath = (path: string) => path.split(".").filter(Boolean);

function getValueAtPath(obj: any, path: string[]): any {
  let current = obj;
  for (const segment of path) {
    if (!current || typeof current !== "object") return undefined;
    current = current[segment];
  }
  return current;
}

/** Sets the value at `path`, creating the objects on the way. `undefined` deletes it. */
function setValueAtPath(obj: any, path: string[], value: unknown): void {
  if (!path.length) return;
  let current = obj;
  for (const key of path.slice(0, -1)) {
    if (!current[key] || typeof current[key] !== "object") current[key] = {};
    current = current[key];
  }
  const last = path[path.length - 1];
  if (value === undefined) delete current[last];
  else current[last] = value;
}

export function getAriesStorage(): AriesStorage {
  return load();
}

/** Replaces the whole blob, as restoring a backup does. */
export function saveAriesStorage(data: AriesStorage): void {
  persist(data);
}

export function updateAriesStorage(mutator: (current: AriesStorage) => void): AriesStorage {
  const current = load();
  mutator(current);
  current.version = ARIES_STORAGE_VERSION;
  persist(current);
  return current;
}

export function readAriesPath<T = unknown>(path: string, fallback?: T): T | undefined {
  const value = getValueAtPath(load(), splitPath(path));
  return value === undefined ? fallback : (value as T);
}

export function writeAriesPath<T = unknown>(path: string, value: T | undefined): AriesStorage {
  return updateAriesStorage((state) => setValueAtPath(state, splitPath(path), value));
}

export function updateAriesPath<T = unknown>(
  path: string,
  updater: (current: T | undefined) => T | undefined,
): AriesStorage {
  return updateAriesStorage((state) => {
    const parts = splitPath(path);
    setValueAtPath(state, parts, updater(getValueAtPath(state, parts) as T | undefined));
  });
}

// Values outside the blob: GM storage when the manager grants it, localStorage otherwise.

function readLocalValue(key: string): unknown {
  try {
    if (typeof GM_getValue === "function") return GM_getValue(key, null);
    return getHostStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeLocalValue(key: string, value: string): void {
  try {
    if (typeof GM_setValue === "function") GM_setValue(key, value);
    else getHostStorage()?.setItem(key, value);
  } catch {}
}

const readLocalString = (key: string): string | null => {
  const raw = readLocalValue(key);
  return typeof raw === "string" && raw ? raw : null;
};

const readLocalFlag = (key: string): boolean => {
  const raw = readLocalValue(key);
  return raw === true || String(raw ?? "").trim() === "1";
};

export function setApiKey(apiKey: string): void {
  writeLocalValue(API_KEY_STORAGE_KEY, apiKey);
}

export function getApiKey(): string | null {
  return readLocalString(API_KEY_STORAGE_KEY);
}

export function hasApiKey(): boolean {
  return getApiKey() !== null;
}

export function hasSeenRoomPrivacyNotice(): boolean {
  return readLocalFlag(SEEN_ROOM_PRIVACY_NOTICE_KEY);
}

export function markRoomPrivacyNoticeSeen(): void {
  writeLocalValue(SEEN_ROOM_PRIVACY_NOTICE_KEY, "1");
}

export function hasSeenAutoRecoDisabledNotice(): boolean {
  return readLocalFlag(SEEN_AUTO_RECO_DISABLED_NOTICE_KEY);
}

export function markAutoRecoDisabledNoticeSeen(): void {
  writeLocalValue(SEEN_AUTO_RECO_DISABLED_NOTICE_KEY, "1");
}

/** The last version whose release notes were shown. */
export function getSeenChangelogVersion(): string | null {
  return readLocalString(SEEN_CHANGELOG_VERSION_KEY);
}

export function markChangelogVersionSeen(version: string): void {
  writeLocalValue(SEEN_CHANGELOG_VERSION_KEY, version);
}
