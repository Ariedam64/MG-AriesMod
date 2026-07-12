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

export const ARIES_STORAGE_KEY = "aries_mod";
const ARIES_STORAGE_VERSION = 1;
const API_KEY_STORAGE_KEY = "aries_api_key";
const AUTH_DECLINED_STORAGE_KEY = "aries_auth_declined";
const SEEN_ROOM_PRIVACY_NOTICE_KEY = "aries_seen_room_privacy_notice";
const SEEN_AUTO_RECO_DISABLED_NOTICE_KEY = "aries_seen_autoreco_disabled_notice";
const SEEN_COMMUNITY_HUB_MOVED_NOTICE_KEY = "aries_seen_community_hub_moved_notice";

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
  };
  hud?: { pos?: unknown; collapsed?: unknown; hidden?: unknown; windows?: Record<string, unknown> };
  menu?: { activeTabs?: Record<string, string> };
  inventory?: { sortKey?: unknown; sortDirection?: unknown; showValues?: unknown };
  keybinds?: { bindings?: Record<string, string>; hold?: Record<string, boolean> };
  editor?: { savedGardens?: unknown; enabled?: unknown };
  activityLog?: { history?: unknown; filter?: unknown };
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

const LEGACY_STATIC_KEYS = [
  "aries_storage",
  "qws:stats:v1",
  "mg.customRooms",
  "qws:pets:overrides:v1",
  "qws:pets:ui:v1",
  "qws:pets:teams:v1",
  "qws:pets:teamSearch:v1",
  "qws:petAlerts:v1",
  "qws:pets:abilityLogs:v1",
  "qws:shop:notifs:v1",
  "qws:shop:notifs:rules.v1",
  "qws:weather:notifs:v1",
  "qws:notifier:loopDefaults.v1",
  "qws:player:ghostMode",
  "qws:ghost:delayMs",
  "qws:autoReco:onNewSession",
  "qws:autoReco:delayMs",
  "qws:locker:restrictions.v1",
  "garden.locker.state.v2",
  "qws:editor:saved-gardens",
  "qws:editor:enabled",
  "qws:activityLogs:history:v1",
  "qws:activityLog:filter",
  "qws:alerts:audio:settings:v1",
  "qws:alerts:audio:library:v1",
  "soundEffectsVolumeAtom",
  "qws:pos",
  "qws:collapsed",
  "qws:hidden",
];

const LEGACY_PREFIXES = [
  "qws:keybind:",
  "qws:keybind-hold:",
  "qws:hk:petteam:use:",
  "qws:win:",
  "menu:",
];

const STATIC_LEGACY_KEYS: Array<{
  legacyKey: string;
  apply: (raw: string, result: AriesStorage) => void;
}> = [
  {
    legacyKey: "qws:stats:v1",
    apply: (raw, r) => {
      const flat = unwrapNestedSnapshot(parseSafe(raw));
      r.stats = flat;
    },
  },
  { legacyKey: "mg.customRooms", apply: (raw, r) => (r.room = mergeSection(r.room, { customRooms: parseSafe(raw) })) },
  { legacyKey: "qws:pets:overrides:v1", apply: (raw, r) => (r.pets = mergeSection(r.pets, { overrides: parseSafe(raw) })) },
  { legacyKey: "qws:pets:ui:v1", apply: (raw, r) => (r.pets = mergeSection(r.pets, { ui: parseSafe(raw) })) },
  { legacyKey: "qws:pets:teams:v1", apply: (raw, r) => (r.pets = mergeSection(r.pets, { teams: parseSafe(raw) })) },
  {
    legacyKey: "qws:pets:teamSearch:v1",
    apply: (raw, r) => (r.pets = mergeSection(r.pets, { teamSearch: parseSafe(raw) })),
  },
  { legacyKey: "qws:petAlerts:v1", apply: (raw, r) => (r.pets = mergeSection(r.pets, { alerts: parseSafe(raw) })) },
  {
    legacyKey: "qws:pets:abilityLogs:v1",
    apply: (raw, r) => (r.pets = mergeSection(r.pets, { abilityLogs: parseSafe(raw) })),
  },
  { legacyKey: "qws:shop:notifs:v1", apply: (raw, r) => (r.notifier = mergeSection(r.notifier, { prefs: parseSafe(raw) })) },
  {
    legacyKey: "qws:shop:notifs:rules.v1",
    apply: (raw, r) => (r.notifier = mergeSection(r.notifier, { rules: parseSafe(raw) })),
  },
  {
    legacyKey: "qws:weather:notifs:v1",
    apply: (raw, r) => (r.notifier = mergeSection(r.notifier, { weatherPrefs: parseSafe(raw) })),
  },
  {
    legacyKey: "qws:notifier:loopDefaults.v1",
    apply: (raw, r) => (r.notifier = mergeSection(r.notifier, { loopDefaults: parseSafe(raw) })),
  },
  { legacyKey: "qws:player:ghostMode", apply: (raw, r) => (r.misc = mergeSection(r.misc, { ghostMode: parseSafe(raw) })) },
  { legacyKey: "qws:ghost:delayMs", apply: (raw, r) => (r.misc = mergeSection(r.misc, { ghostDelayMs: parseSafe(raw) })) },
  {
    legacyKey: "qws:autoReco:onNewSession",
    apply: (raw, r) => (r.misc = mergeSection(r.misc, { autoRecoEnabled: parseSafe(raw) })),
  },
  {
    legacyKey: "qws:autoReco:delayMs",
    apply: (raw, r) => (r.misc = mergeSection(r.misc, { autoRecoDelayMs: parseSafe(raw) })),
  },
  {
    legacyKey: "qws:locker:restrictions.v1",
    apply: (raw, r) => (r.locker = mergeSection(r.locker, { restrictions: parseSafe(raw) })),
  },
  { legacyKey: "garden.locker.state.v2", apply: (raw, r) => (r.locker = mergeSection(r.locker, { state: parseSafe(raw) })) },
  {
    legacyKey: "qws:editor:saved-gardens",
    apply: (raw, r) => (r.editor = mergeSection(r.editor, { savedGardens: parseSafe(raw) })),
  },
  {
    legacyKey: "qws:editor:enabled",
    apply: (raw, r) => (r.editor = mergeSection(r.editor, { enabled: parseSafe(raw) })),
  },
  {
    legacyKey: "qws:activityLogs:history:v1",
    apply: (raw, r) => (r.activityLog = mergeSection(r.activityLog, { history: parseSafe(raw) })),
  },
  { legacyKey: "qws:activityLog:filter", apply: (raw, r) => (r.activityLog = mergeSection(r.activityLog, { filter: parseSafe(raw) })) },
  {
    legacyKey: "qws:alerts:audio:settings:v1",
    apply: (raw, r) => (r.audio = mergeSection(r.audio, { settings: parseSafe(raw) })),
  },
  {
    legacyKey: "qws:alerts:audio:library:v1",
    apply: (raw, r) => (r.audio = mergeSection(r.audio, { library: parseSafe(raw) })),
  },
  {
    legacyKey: "soundEffectsVolumeAtom",
    apply: (raw, r) => (r.audio = mergeSection(r.audio, { sfxVolumeAtom: parseSafe(raw) })),
  },
  { legacyKey: "qws:pos", apply: (raw, r) => (r.hud = mergeSection(r.hud, { pos: parseSafe(raw) })) },
  { legacyKey: "qws:collapsed", apply: (raw, r) => (r.hud = mergeSection(r.hud, { collapsed: parseSafe(raw) })) },
  { legacyKey: "qws:hidden", apply: (raw, r) => (r.hud = mergeSection(r.hud, { hidden: parseSafe(raw) })) },
];

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

function collectByPrefix(
  storage: Storage,
  prefix: string,
  transform?: (key: string, raw: string) => [string, unknown] | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    const raw = storage.getItem(key);
    if (raw == null) continue;
    if (transform) {
      const entry = transform(key, raw);
      if (entry) out[entry[0]] = entry[1];
    } else {
      out[key.slice(prefix.length)] = parseSafe(raw);
    }
  }
  return out;
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

function hasLegacyData(storage: Storage): boolean {
  for (const key of LEGACY_STATIC_KEYS) {
    if (storage.getItem(key) != null) return true;
  }
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i) || "";
    if (LEGACY_PREFIXES.some((p) => key.startsWith(p))) return true;
  }
  return false;
}

function cleanupLegacyData(storage: Storage): void {
  for (const key of LEGACY_STATIC_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (!key) continue;
    if (LEGACY_PREFIXES.some((p) => key.startsWith(p))) {
      try {
        storage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
  }
}

export function migrateLocalStorageToAries(): AriesStorage {
  const storage = getHostStorage();
  if (!storage) return loadAriesStorage();

  const current = loadAriesStorage();
  const shouldMigrate = hasLegacyData(storage);
  const result: AriesStorage = { ...DEFAULT_ARIES_STORAGE, ...current };

  if (!shouldMigrate) {
    return result;
  }

  for (const entry of STATIC_LEGACY_KEYS) {
    const { legacyKey, apply } = entry;
    const raw = storage.getItem(legacyKey);
    if (raw == null) continue;
    apply(raw, result);
  }

  // Keybinds
  const bindings = collectByPrefix(storage, "qws:keybind:", (key, raw) => [
    key.replace("qws:keybind:", ""),
    raw,
  ]);
  const holds = collectByPrefix(storage, "qws:keybind-hold:", (key, raw) => [
    key.replace("qws:keybind-hold:", ""),
    raw === "1" || raw === "true",
  ]);
  if ((Object.keys(bindings).length || Object.keys(holds).length) && !result.keybinds) {
    result.keybinds = {};
  }
  if (Object.keys(bindings).length) {
    result.keybinds = {
      ...(result.keybinds ?? {}),
      bindings: { ...(result.keybinds?.bindings ?? {}), ...(bindings as Record<string, string>) },
    };
  }
  if (Object.keys(holds).length) {
    result.keybinds = {
      ...(result.keybinds ?? {}),
      hold: { ...(result.keybinds?.hold ?? {}), ...(holds as Record<string, boolean>) },
    };
  }

  // Legacy pet team hotkeys
  const teamHotkeys = collectByPrefix(storage, "qws:hk:petteam:use:", (key, raw) => [
    key.replace("qws:hk:petteam:use:", ""),
    raw,
  ]);
  if (Object.keys(teamHotkeys).length) {
    result.pets = {
      ...(result.pets ?? {}),
      hotkeys: { ...(result.pets?.hotkeys ?? {}), ...(teamHotkeys as Record<string, string>) },
    };
  }

  // HUD window positions
  const hudWindows = collectByPrefix(storage, "qws:win:", (key, raw) => {
    const match = key.match(/^qws:win:(.+):pos$/);
    if (!match || !match[1]) return null;
    return [match[1], parseSafe(raw)];
  });
  if (Object.keys(hudWindows).length) {
    result.hud = {
      ...(result.hud ?? {}),
      windows: { ...(result.hud?.windows ?? {}), ...hudWindows },
    };
  }

  // Menu active tabs
  const menuTabs = collectByPrefix(storage, "menu:", (key, raw) => {
    const match = key.match(/^menu:(.+):activeTab$/);
    if (!match || !match[1]) return null;
    return [match[1], parseSafe(raw) as string];
  });
  if (Object.keys(menuTabs).length) {
    const activeTabs: Record<string, string> = {};
    for (const [k, v] of Object.entries(menuTabs)) {
      if (typeof v === "string") activeTabs[k] = v;
    }
    if (Object.keys(activeTabs).length) {
      result.menu = {
        ...(result.menu ?? {}),
        activeTabs: { ...(result.menu?.activeTabs ?? {}), ...activeTabs },
      };
    }
  }

  // Flatten any nested stats snapshot that might have been persisted as { snapshot: { ... } }
  if (result.stats && typeof result.stats === "object") {
    const flat = unwrapNestedSnapshot(result.stats);
    result.stats = flat;
  }

  result.version = ARIES_STORAGE_VERSION;
  if (!result.migratedAt) result.migratedAt = Date.now();

  persistAriesStorage(result);
  // Flush before deleting legacy keys: with the debounced write, a crash in
  // the next few hundred ms would otherwise lose the migrated data for good.
  flushAriesStorageNow();
  cleanupLegacyData(storage);
  return result;
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

export function removeLegacyStorageKeys(): void {
  const storage = getHostStorage();
  if (!storage) return;
  cleanupLegacyData(storage);
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
 * Supprime l'API key stockée
 */
export function clearApiKey(): void {
  try {
    if (typeof GM_deleteValue === "function") {
      GM_deleteValue(API_KEY_STORAGE_KEY);
      return;
    }
    getHostStorage()?.removeItem(API_KEY_STORAGE_KEY);
  } catch (e) {
    console.error("Failed to clear API key:", e);
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

function readAuthDeclinedRaw(): string | null {
  try {
    if (typeof GM_getValue === "function") {
      const raw = GM_getValue(AUTH_DECLINED_STORAGE_KEY, null);
      if (raw == null) return null;
      if (typeof raw === "string") return raw;
      if (typeof raw === "boolean") return raw ? "1" : null;
      return String(raw);
    }
    return getHostStorage()?.getItem(AUTH_DECLINED_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function hasDeclinedApiAuth(): boolean {
  const raw = readAuthDeclinedRaw();
  if (!raw) return false;
  const val = String(raw).trim().toLowerCase();
  return val === "1" || val === "true" || val === "yes";
}

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

// ---------- Community Hub moved notice seen flag ----------

export function hasSeenCommunityHubMovedNotice(): boolean {
  try {
    if (typeof GM_getValue === "function") {
      const raw = GM_getValue(SEEN_COMMUNITY_HUB_MOVED_NOTICE_KEY, null);
      if (raw == null) return false;
      if (typeof raw === "boolean") return raw;
      return String(raw).trim() === "1";
    }
    return getHostStorage()?.getItem(SEEN_COMMUNITY_HUB_MOVED_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markCommunityHubMovedNoticeSeen(): void {
  try {
    if (typeof GM_setValue === "function") {
      GM_setValue(SEEN_COMMUNITY_HUB_MOVED_NOTICE_KEY, "1");
      return;
    }
    getHostStorage()?.setItem(SEEN_COMMUNITY_HUB_MOVED_NOTICE_KEY, "1");
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
