// Centralises persisted data under a single localStorage entry with a unified prefix.
// Structure: aries_mod { pets { ... }, room { ... }, locker { ... }, ... }
// - Migrates all legacy keys (qws:..., mg-..., etc.) into nested sections.
// - Does not delete legacy keys to avoid data loss on downgrade.

import type { FriendSettings } from "./friendSettingsSchema";
import { DEFAULT_FRIEND_SETTINGS } from "./friendSettingsSchema";

declare const GM_getValue:
  | ((name: string, defaultValue?: string | null) => string | null | undefined)
  | undefined;
declare const GM_setValue: ((name: string, value: string) => void) | undefined;
declare const GM_deleteValue: ((name: string) => void) | undefined;

const ARIES_STORAGE_KEY = "aries_mod";
const ARIES_STORAGE_VERSION = 1;
const API_KEY_STORAGE_KEY = "aries_api_key";
const AUTH_DECLINED_STORAGE_KEY = "aries_auth_declined";
const SEEN_ROOM_PRIVACY_NOTICE_KEY = "aries_seen_room_privacy_notice_v2";
const SEEN_AUTO_RECO_DISABLED_NOTICE_KEY = "aries_seen_autoreco_disabled_notice";
const SEEN_CHANGELOG_VERSION_KEY = "aries_seen_changelog_version";

export type AriesStorage = {
  version: number;
  migratedAt?: number;
  stats?: unknown;
  pets?: {
    overrides?: unknown;
    ui?: unknown;
    teams?: unknown;
    teamSearch?: unknown;
    hotkeys?: Record<string, string>;
    alerts?: unknown;
    abilityLogs?: unknown;
    instantFeedWidget?: {
      enabled?: boolean;
      pos?: { left: number; top: number };
    };
  };
  room?: { customRooms?: unknown };
  locker?: { restrictions?: unknown; state?: unknown };
  notifier?: {
    prefs?: unknown;
    rules?: unknown;
    weatherPrefs?: unknown;
    loopDefaults?: unknown;
    floatingBell?: {
      enabled?: boolean;
      pos?: { left: number; top: number };
    };
  };
  misc?: {
    ghostMode?: unknown;
    ghostDelayMs?: unknown;
    autoRecoEnabled?: unknown;
    autoRecoDelayMs?: unknown;
    keepInventorySlotFree?: unknown;
    autoStoreSeedSiloEnabled?: unknown;
    autoStoreDecorShedEnabled?: unknown;
    autoStoreToolShackEnabled?: unknown;
    /** Section id -> collapsed, for the Misc menu. */
    collapsed?: Record<string, boolean>;
  };
  hud?: { pos?: unknown; collapsed?: unknown; hidden?: unknown; windows?: Record<string, unknown> };
  menu?: { activeTabs?: Record<string, string> };
  inventory?: { sortKey?: unknown; sortDirection?: unknown; showValues?: unknown };
  keybinds?: {
    bindings?: Record<string, string>;
    hold?: Record<string, boolean>;
    /** Section id -> collapsed, for the Keybinds menu. */
    collapsed?: Record<string, boolean>;
  };
  editor?: { savedGardens?: unknown; enabled?: unknown };
  // Only the on/off switch lives here — the skin images themselves are far
  // too large for this shared blob and go to IndexedDB (see src/skins/store.ts).
  skins?: { enabled?: boolean };
  activityLog?: { history?: unknown; filter?: unknown };
  /** Réglages du companion. Sa forme vit dans services/companion/settingsShape.ts. */
  companion?: Record<string, unknown>;
  /**
   * Session de jeu vue par le companion : début, dernier signe de vie, heures
   * déjà annoncées. À part des réglages, que `saveCompanionSettings` réécrit
   * en entier sous `companion` et qui l'effaceraient à chaque sauvegarde.
   */
  companionSession?: Record<string, unknown>;
  hatch?: {
    /** Seen pets, Bad Luck Protection counters and head starts. */
    tracker?: unknown;
    /** Egg id -> expanded, for the Hatch tab. Cards default to collapsed. */
    expanded?: Record<string, boolean>;
  };
  audio?: { settings?: unknown; library?: unknown; sfxVolumeAtom?: unknown };
  friends?: {
    settings?: FriendSettings;
  };
  notifications?: {
    soundEnabled?: boolean;
    mutedGroupIds?: number[];
  };
  eggAutomation?: {
    config?: unknown;
    enabled?: boolean;
    hatchPetTeamId?: unknown;
    sellPetTeamId?: unknown;
    idlePetTeamId?: unknown;
    autoFav?: unknown;
  };
  workflowStudio?: unknown;
  weatherTeams?: {
    enabled?: boolean;
    [weatherKey: string]: unknown;
  };
  workflow?: {
    enabled?: boolean;
    plants?: string[];
    stepOrder?: string[];
    stepsEnabled?: Record<string, boolean>;
    growthTeamId?: string;
    growthMaturity?: number;
    sizeTeamId?: string;
    colorTeamId?: string;
    harvestTeamId?: string;
    sellTeamId?: string;
    sellState?: {
      phase: string;
      originalRoomId: string;
      resumeAtStep?: string;
    };
    sellLog?: string[];
    weatherMutations?: Record<string, {
      enabled?: boolean;
      teamId?: string;
    }>;
  };
};

const DEFAULT_ARIES_STORAGE: AriesStorage = {
  version: ARIES_STORAGE_VERSION,
  friends: {
    settings: DEFAULT_FRIEND_SETTINGS,
  },
  notifications: {
    soundEnabled: true,
  },
};




function getHostStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    if (typeof window.localStorage === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function parseSafe(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function mergeSection<T extends Record<string, unknown> | undefined>(
  existing: T | undefined,
  next: Partial<NonNullable<T>>,
): NonNullable<T> {
  const base = { ...(existing ?? {}) } as Record<string, unknown>;
  for (const [k, v] of Object.entries(next)) {
    if (base[k] === undefined) {
      base[k] = v;
    }
  }
  return base as NonNullable<T>;
}


function unwrapNestedSnapshot(raw: unknown): unknown {
  let cur: unknown = raw;
  let guard = 0;
  while (guard++ < 10 && cur && typeof cur === "object" && "snapshot" in (cur as any) && typeof (cur as any).snapshot === "object") {
    cur = (cur as any).snapshot;
  }
  return cur ?? raw;
}

function coerceLegacyAggregate(raw: unknown): AriesStorage {
  const out: AriesStorage = { ...DEFAULT_ARIES_STORAGE };
  if (!raw || typeof raw !== "object") return out;
  const data = raw as Record<string, unknown>;

  if (typeof data.version === "number") out.version = data.version;
  if (typeof data.migratedAt === "number") out.migratedAt = data.migratedAt;

  if ("stats" in data) out.stats = unwrapNestedSnapshot((data as any).stats);
  if ("customRooms" in data) out.room = mergeSection(out.room, { customRooms: (data as any).customRooms });

  if ("pets" in data && typeof (data as any).pets === "object") {
    out.pets = mergeSection(out.pets, data.pets as Record<string, unknown>);
  }
  if ("petsOverrides" in data) out.pets = mergeSection(out.pets, { overrides: (data as any).petsOverrides });
  if ("petsUI" in data) out.pets = mergeSection(out.pets, { ui: (data as any).petsUI });
  if ("petTeams" in data) out.pets = mergeSection(out.pets, { teams: (data as any).petTeams });
  if ("petTeamSearch" in data) out.pets = mergeSection(out.pets, { teamSearch: (data as any).petTeamSearch });
  if ("petTeamHotkeys" in data) out.pets = mergeSection(out.pets, { hotkeys: (data as any).petTeamHotkeys as any });
  if ("petAlerts" in data) out.pets = mergeSection(out.pets, { alerts: (data as any).petAlerts });

  if ("notifier" in data && typeof (data as any).notifier === "object") {
    out.notifier = mergeSection(out.notifier, data.notifier as Record<string, unknown>);
  }
  if ("notifierPrefs" in data) out.notifier = mergeSection(out.notifier, { prefs: (data as any).notifierPrefs });
  if ("notifierRules" in data) out.notifier = mergeSection(out.notifier, { rules: (data as any).notifierRules });
  if ("weatherNotifierPrefs" in data) out.notifier = mergeSection(out.notifier, { weatherPrefs: (data as any).weatherNotifierPrefs });
  if ("notifierLoopDefaults" in data) out.notifier = mergeSection(out.notifier, { loopDefaults: (data as any).notifierLoopDefaults });

  if ("misc" in data && typeof (data as any).misc === "object") {
    out.misc = mergeSection(out.misc, data.misc as Record<string, unknown>);
  }
  if ("ghostMode" in data) out.misc = mergeSection(out.misc, { ghostMode: (data as any).ghostMode });
  if ("ghostDelayMs" in data) out.misc = mergeSection(out.misc, { ghostDelayMs: (data as any).ghostDelayMs });
  if ("autoRecoEnabled" in data) out.misc = mergeSection(out.misc, { autoRecoEnabled: (data as any).autoRecoEnabled });
  if ("autoRecoDelayMs" in data) out.misc = mergeSection(out.misc, { autoRecoDelayMs: (data as any).autoRecoDelayMs });

  if ("locker" in data && typeof (data as any).locker === "object") {
    out.locker = mergeSection(out.locker, data.locker as Record<string, unknown>);
  }
  if ("lockerRestrictions" in data) out.locker = mergeSection(out.locker, { restrictions: (data as any).lockerRestrictions });
  if ("lockerState" in data) out.locker = mergeSection(out.locker, { state: (data as any).lockerState });

  if ("keybinds" in data && typeof (data as any).keybinds === "object") {
    out.keybinds = mergeSection(out.keybinds, data.keybinds as Record<string, unknown>);
  }

  if ("editorSavedGardens" in data) out.editor = mergeSection(out.editor, { savedGardens: (data as any).editorSavedGardens });
  if ("editor" in data && typeof (data as any).editor === "object") {
    out.editor = mergeSection(out.editor, data.editor as Record<string, unknown>);
  }

  if ("activityLog" in data && typeof (data as any).activityLog === "object") {
    out.activityLog = mergeSection(out.activityLog, data.activityLog as Record<string, unknown>);
  }

  // Cette fonction est une liste blanche : une section absente d'ici est écrite
  // sur le disque puis jetée en silence à la relecture. Les réglages tenaient
  // alors toute la session grâce au cache mémoire et disparaissaient au premier
  // rafraîchissement. Toute nouvelle section doit passer par ici.
  if ("companion" in data && typeof (data as any).companion === "object") {
    out.companion = mergeSection(out.companion, data.companion as Record<string, unknown>);
  }
  if ("companionSession" in data && typeof (data as any).companionSession === "object") {
    out.companionSession = mergeSection(out.companionSession, data.companionSession as Record<string, unknown>);
  }
  if ("activityLogHistory" in data) out.activityLog = mergeSection(out.activityLog, { history: (data as any).activityLogHistory });
  if ("activityLogFilter" in data) out.activityLog = mergeSection(out.activityLog, { filter: (data as any).activityLogFilter });

  if ("hud" in data && typeof (data as any).hud === "object") {
    out.hud = mergeSection(out.hud, data.hud as Record<string, unknown>);
  }
  if ("menu" in data && typeof (data as any).menu === "object") {
    out.menu = mergeSection(out.menu, data.menu as Record<string, unknown>);
  }
  if ("inventory" in data && typeof (data as any).inventory === "object") {
    out.inventory = mergeSection(out.inventory, data.inventory as Record<string, unknown>);
  }
  if ("audio" in data && typeof (data as any).audio === "object") {
    out.audio = mergeSection(out.audio, data.audio as Record<string, unknown>);
  }
  if ("audioSettings" in data) out.audio = mergeSection(out.audio, { settings: (data as any).audioSettings });
  if ("audioLibrary" in data) out.audio = mergeSection(out.audio, { library: (data as any).audioLibrary });
  if ("soundEffectsVolumeAtom" in data) out.audio = mergeSection(out.audio, { sfxVolumeAtom: (data as any).soundEffectsVolumeAtom });

  if ("friends" in data && typeof (data as any).friends === "object") {
    out.friends = {
      ...(out.friends ?? {}),
      ...(data.friends as Record<string, unknown>),
    };
  }

  if ("eggAutomation" in data && typeof (data as any).eggAutomation === "object") {
    out.eggAutomation = mergeSection(out.eggAutomation, data.eggAutomation as Record<string, unknown>);
  }

  if ("weatherTeams" in data && typeof (data as any).weatherTeams === "object") {
    out.weatherTeams = mergeSection(out.weatherTeams, data.weatherTeams as Record<string, unknown>);
  }

  if ("workflowStudio" in data) {
    out.workflowStudio = (data as any).workflowStudio;
  }

  if ("workflow" in data && typeof (data as any).workflow === "object") {
    out.workflow = mergeSection(out.workflow, data.workflow as Record<string, unknown>);
  }

  return out;
}

// ---------- In-memory cache + debounced flush ----------
// readAriesPath/writeAriesPath used to re-parse (and re-stringify) the entire
// aries_mod blob synchronously on every call. With a large blob (500-entry
// activity log history, stats, ...) that blocked the main thread on every
// stat increment or activity-log change — visible as in-game freezes while
// buying/harvesting. The parsed blob is cached here and disk writes are
// batched behind a short debounce.
const ARIES_FLUSH_DELAY_MS = 500;

let cachedAriesStorage: AriesStorage | null = null;
let ariesFlushTimer: number | null = null;
let ariesFlushPending = false;
let ariesLifecycleHooksInstalled = false;

function installAriesLifecycleHooksOnce(): void {
  if (ariesLifecycleHooksInstalled || typeof window === "undefined") return;
  ariesLifecycleHooksInstalled = true;
  const flush = () => flushAriesStorageNow();
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  // Another tab wrote the blob: drop the cache so the next read re-parses it.
  // (This tab's own writes don't fire `storage` here.)
  window.addEventListener("storage", (event) => {
    if (event.key !== ARIES_STORAGE_KEY) return;
    if (ariesFlushPending) return; // our pending write supersedes it
    cachedAriesStorage = null;
  });
}

function flushAriesStorageNow(): void {
  if (ariesFlushTimer !== null) {
    clearTimeout(ariesFlushTimer);
    ariesFlushTimer = null;
  }
  if (!ariesFlushPending || !cachedAriesStorage) return;
  ariesFlushPending = false;
  const storage = getHostStorage();
  if (!storage) return;
  try {
    storage.setItem(ARIES_STORAGE_KEY, JSON.stringify(cachedAriesStorage));
  } catch {
    /* ignore persistence errors */
  }
}

function scheduleAriesFlush(): void {
  installAriesLifecycleHooksOnce();
  ariesFlushPending = true;
  if (ariesFlushTimer !== null) return;
  ariesFlushTimer = window.setTimeout(() => {
    ariesFlushTimer = null;
    flushAriesStorageNow();
  }, ARIES_FLUSH_DELAY_MS);
}

function loadAriesStorage(): AriesStorage {
  if (cachedAriesStorage) return cachedAriesStorage;
  installAriesLifecycleHooksOnce();

  const storage = getHostStorage();
  const raw = storage?.getItem(ARIES_STORAGE_KEY);
  if (raw) {
    const parsed = parseSafe(raw);
    if (parsed && typeof parsed === "object") {
      cachedAriesStorage = coerceLegacyAggregate(parsed);
      return cachedAriesStorage;
    }
  }

  cachedAriesStorage = { ...DEFAULT_ARIES_STORAGE };
  return cachedAriesStorage;
}

function persistAriesStorage(data: AriesStorage): void {
  cachedAriesStorage = data;
  scheduleAriesFlush();
}

function getValueAtPath(obj: any, path: string[]): any {
  let cur = obj;
  for (const segment of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[segment];
  }
  return cur;
}

function setValueAtPath(obj: any, path: string[], value: unknown): void {
  if (!path.length) return;
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!cur[key] || typeof cur[key] !== "object") {
      cur[key] = {};
    }
    cur = cur[key];
  }
  const last = path[path.length - 1];
  if (value === undefined) {
    if (cur && typeof cur === "object") {
      delete cur[last];
    }
  } else {
    cur[last] = value;
  }
}




export function getAriesStorage(): AriesStorage {
  return loadAriesStorage();
}

export function saveAriesStorage(data: AriesStorage): void {
  persistAriesStorage(data);
}

export function updateAriesStorage(mutator: (current: AriesStorage) => void): AriesStorage {
  const current = loadAriesStorage();
  mutator(current);
  current.version = ARIES_STORAGE_VERSION;
  persistAriesStorage(current);
  return current;
}

export function readAriesPath<T = unknown>(path: string, fallback?: T): T | undefined {
  const parts = path.split(".").filter(Boolean);
  const value = getValueAtPath(loadAriesStorage(), parts);
  if (value === undefined) return fallback;
  return value as T;
}

export function writeAriesPath<T = unknown>(path: string, value: T | undefined): AriesStorage {
  return updateAriesStorage((state) => {
    setValueAtPath(state, path.split(".").filter(Boolean), value);
  });
}

export function updateAriesPath<T = unknown>(
  path: string,
  updater: (current: T | undefined) => T | undefined,
): AriesStorage {
  return updateAriesStorage((state) => {
    const parts = path.split(".").filter(Boolean);
    const currentValue = getValueAtPath(state, parts) as T | undefined;
    const next = updater(currentValue);
    setValueAtPath(state, parts, next);
  });
}


// ---------- API Key Storage ----------

/**
 * Stocke l'API key localement (utilise GM_setValue si disponible, sinon localStorage)
 */
export function setApiKey(apiKey: string): void {
  try {
    if (typeof GM_setValue === "function") {
      GM_setValue(API_KEY_STORAGE_KEY, apiKey);
      return;
    }
    getHostStorage()?.setItem(API_KEY_STORAGE_KEY, apiKey);
  } catch (e) {
    console.error("Failed to store API key:", e);
  }
}

/**
 * Récupère l'API key stockée localement
 */
export function getApiKey(): string | null {
  try {
    if (typeof GM_getValue === "function") {
      return GM_getValue(API_KEY_STORAGE_KEY, null) ?? null;
    }
    return getHostStorage()?.getItem(API_KEY_STORAGE_KEY) ?? null;
  } catch (e) {
    console.error("Failed to retrieve API key:", e);
    return null;
  }
}


/**
 * Vérifie si l'utilisateur a une API key
 */
export function hasApiKey(): boolean {
  const key = getApiKey();
  return key !== null && key.length > 0;
}

// ---------- Auth declined flag ----------



// ---------- Room privacy notice seen flag ----------

export function hasSeenRoomPrivacyNotice(): boolean {
  try {
    if (typeof GM_getValue === "function") {
      const raw = GM_getValue(SEEN_ROOM_PRIVACY_NOTICE_KEY, null);
      if (raw == null) return false;
      if (typeof raw === "boolean") return raw;
      return String(raw).trim() === "1";
    }
    return getHostStorage()?.getItem(SEEN_ROOM_PRIVACY_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markRoomPrivacyNoticeSeen(): void {
  try {
    if (typeof GM_setValue === "function") {
      GM_setValue(SEEN_ROOM_PRIVACY_NOTICE_KEY, "1");
      return;
    }
    getHostStorage()?.setItem(SEEN_ROOM_PRIVACY_NOTICE_KEY, "1");
  } catch {
    /* ignore */
  }
}

// ---------- Auto-reconnect disabled notice seen flag ----------

export function hasSeenAutoRecoDisabledNotice(): boolean {
  try {
    if (typeof GM_getValue === "function") {
      const raw = GM_getValue(SEEN_AUTO_RECO_DISABLED_NOTICE_KEY, null);
      if (raw == null) return false;
      if (typeof raw === "boolean") return raw;
      return String(raw).trim() === "1";
    }
    return getHostStorage()?.getItem(SEEN_AUTO_RECO_DISABLED_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markAutoRecoDisabledNoticeSeen(): void {
  try {
    if (typeof GM_setValue === "function") {
      GM_setValue(SEEN_AUTO_RECO_DISABLED_NOTICE_KEY, "1");
      return;
    }
    getHostStorage()?.setItem(SEEN_AUTO_RECO_DISABLED_NOTICE_KEY, "1");
  } catch {
    /* ignore */
  }
}

// ---------- Changelog: last version whose notes were shown ----------

export function getSeenChangelogVersion(): string | null {
  try {
    if (typeof GM_getValue === "function") {
      const raw = GM_getValue(SEEN_CHANGELOG_VERSION_KEY, null);
      return typeof raw === "string" && raw ? raw : null;
    }
    return getHostStorage()?.getItem(SEEN_CHANGELOG_VERSION_KEY) ?? null;
  } catch {
    return null;
  }
}

export function markChangelogVersionSeen(version: string): void {
  try {
    if (typeof GM_setValue === "function") {
      GM_setValue(SEEN_CHANGELOG_VERSION_KEY, version);
      return;
    }
    getHostStorage()?.setItem(SEEN_CHANGELOG_VERSION_KEY, version);
  } catch {
    /* ignore */
  }
}

export function setDeclinedApiAuth(declined: boolean): void {
  try {
    if (declined) {
      if (typeof GM_setValue === "function") {
        GM_setValue(AUTH_DECLINED_STORAGE_KEY, "1");
        return;
      }
      getHostStorage()?.setItem(AUTH_DECLINED_STORAGE_KEY, "1");
      return;
    }

    if (typeof GM_deleteValue === "function") {
      GM_deleteValue(AUTH_DECLINED_STORAGE_KEY);
      return;
    }
    getHostStorage()?.removeItem(AUTH_DECLINED_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
