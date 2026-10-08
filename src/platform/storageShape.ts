/**
 * The shape of the `aries_mod` blob, its defaults, and how a stored blob is
 * read back, including the flat keys left by builds that predate sections.
 */

export const ARIES_STORAGE_VERSION = 1;

type FriendSettings = {
  showOnlineFriendsOnly: boolean;
  hideRoomFromPublicList: boolean;
  messageSoundEnabled: boolean;
  friendRequestSoundEnabled: boolean;
  showGarden: boolean;
  showInventory: boolean;
  showCoins: boolean;
  showActivityLog: boolean;
  showJournal: boolean;
  showStats: boolean;
};

type ScreenPosition = { left: number; top: number };

export type AriesStorage = {
  version: number;
  migratedAt?: number;
  stats?: unknown;
  pets?: {
    overrides?: unknown;
    teams?: unknown;
    hotkeys?: Record<string, string>;
    alerts?: unknown;
    abilityLogs?: unknown;
    instantFeedWidget?: { enabled?: boolean; pos?: ScreenPosition };
  };
  room?: { customRooms?: unknown };
  locker?: { restrictions?: unknown; state?: unknown };
  notifier?: {
    prefs?: unknown;
    rules?: unknown;
    weatherPrefs?: unknown;
    loopDefaults?: unknown;
    floatingBell?: { enabled?: boolean; pos?: ScreenPosition };
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
    /** Section id to collapsed, for the Misc menu. */
    collapsed?: Record<string, boolean>;
  };
  hud?: { pos?: unknown; collapsed?: unknown; hidden?: unknown; windows?: Record<string, unknown> };
  menu?: { activeTabs?: Record<string, string> };
  inventory?: { sortKey?: unknown; sortDirection?: unknown; showValues?: unknown };
  keybinds?: {
    bindings?: Record<string, string>;
    hold?: Record<string, boolean>;
    /** Section id to collapsed, for the Keybinds menu. */
    collapsed?: Record<string, boolean>;
  };
  editor?: { savedGardens?: unknown; enabled?: unknown };
  /** Only the on/off switch: the skin images are far too large for this blob and live in IndexedDB. */
  skins?: { enabled?: boolean };
  activityLog?: { history?: unknown; filter?: unknown };
  /** Companion settings. Their shape lives with the companion feature. */
  companion?: Record<string, unknown>;
  /**
   * The play session as the companion sees it: start, last sign of life, hours
   * already announced. Kept apart from `companion`, which every settings save
   * rewrites whole.
   */
  companionSession?: Record<string, unknown>;
  hatch?: {
    /** Seen pets, Bad Luck Protection counters and head starts. */
    tracker?: unknown;
    /** Egg id to expanded, for the Hatch tab. Cards default to collapsed. */
    expanded?: Record<string, boolean>;
  };
  audio?: { settings?: unknown; library?: unknown; sfxVolumeAtom?: unknown };
  /**
   * Friend privacy settings from the Community Hub, which now ships as its own
   * script. Nothing in the mod reads them; the defaults stay so the stored blob
   * keeps the shape it has always had.
   */
  friends?: { settings?: FriendSettings };
  notifications?: { soundEnabled?: boolean; mutedGroupIds?: number[] };
  eggAutomation?: {
    config?: unknown;
    enabled?: boolean;
    hatchPetTeamId?: unknown;
    sellPetTeamId?: unknown;
    idlePetTeamId?: unknown;
    autoFav?: unknown;
  };
  workflowStudio?: unknown;
  weatherTeams?: { enabled?: boolean; [weatherKey: string]: unknown };
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
    sellState?: { phase: string; originalRoomId: string; resumeAtStep?: string };
    sellLog?: string[];
    weatherMutations?: Record<string, { enabled?: boolean; teamId?: string }>;
  };
};

/** A fresh default blob. Fresh every time, so a write never mutates a shared default. */
export function createDefaultAriesStorage(): AriesStorage {
  return {
    version: ARIES_STORAGE_VERSION,
    friends: {
      settings: {
        showOnlineFriendsOnly: false,
        hideRoomFromPublicList: false,
        messageSoundEnabled: true,
        friendRequestSoundEnabled: true,
        showGarden: true,
        showInventory: true,
        showCoins: true,
        showActivityLog: true,
        showJournal: true,
        showStats: true,
      },
    },
    notifications: { soundEnabled: true },
  };
}

/**
 * Flat root keys from builds before sections, and the section and field each
 * one moved to. `pets.ui` and `pets.teamSearch` are no longer read, but their
 * entries stay: listing a key here is also what keeps it from being carried
 * over as a stray root key of an old save.
 */
const LEGACY_ROOT_KEYS: Record<string, [section: string, field: string]> = {
  customRooms: ["room", "customRooms"],
  petsOverrides: ["pets", "overrides"],
  petsUI: ["pets", "ui"],
  petTeams: ["pets", "teams"],
  petTeamSearch: ["pets", "teamSearch"],
  petTeamHotkeys: ["pets", "hotkeys"],
  petAlerts: ["pets", "alerts"],
  notifierPrefs: ["notifier", "prefs"],
  notifierRules: ["notifier", "rules"],
  weatherNotifierPrefs: ["notifier", "weatherPrefs"],
  notifierLoopDefaults: ["notifier", "loopDefaults"],
  ghostMode: ["misc", "ghostMode"],
  ghostDelayMs: ["misc", "ghostDelayMs"],
  autoRecoEnabled: ["misc", "autoRecoEnabled"],
  autoRecoDelayMs: ["misc", "autoRecoDelayMs"],
  lockerRestrictions: ["locker", "restrictions"],
  lockerState: ["locker", "state"],
  editorSavedGardens: ["editor", "savedGardens"],
  activityLogHistory: ["activityLog", "history"],
  activityLogFilter: ["activityLog", "filter"],
  audioSettings: ["audio", "settings"],
  audioLibrary: ["audio", "library"],
  soundEffectsVolumeAtom: ["audio", "sfxVolumeAtom"],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Old stats saves wrapped the data in `{ snapshot: { snapshot: ... } }`. */
function unwrapNestedSnapshot(raw: unknown): unknown {
  let current = raw;
  for (let depth = 0; depth < 10 && isRecord(current) && isRecord(current.snapshot); depth++) {
    current = current.snapshot;
  }
  return current ?? raw;
}

/**
 * Turns a parsed blob into the current shape. Every section is kept as it is,
 * merged over its defaults: a section the mod does not know about here must
 * still survive a reload, or its settings vanish on the first refresh. Legacy
 * flat keys fill their section's field when the section does not have it yet,
 * and are then left out.
 */
export function normalizeAriesStorage(raw: unknown): AriesStorage {
  const out = createDefaultAriesStorage() as Record<string, unknown>;
  if (!isRecord(raw)) return out as AriesStorage;

  for (const [key, value] of Object.entries(raw)) {
    if (key in LEGACY_ROOT_KEYS) continue;
    if (key === "version" && typeof value !== "number") continue;
    if (key === "stats") {
      out.stats = unwrapNestedSnapshot(value);
      continue;
    }
    const defaults = out[key];
    out[key] = isRecord(defaults) && isRecord(value) ? { ...defaults, ...value } : value;
  }

  for (const [legacyKey, [section, field]] of Object.entries(LEGACY_ROOT_KEYS)) {
    if (!(legacyKey in raw)) continue;
    const target = isRecord(out[section]) ? (out[section] as Record<string, unknown>) : {};
    out[section] = target;
    if (target[field] === undefined) target[field] = raw[legacyKey];
  }

  return out as AriesStorage;
}
