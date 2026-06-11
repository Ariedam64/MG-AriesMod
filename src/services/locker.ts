
// src/services/locker.ts
// Détection du slot sélectionné dans le garden pour le menu Locker.
// On réutilise la même logique que cropPrice.ts pour déterminer la plante courante
// et la position sélectionnée parmi les slots éventuels.

import {
  myCurrentGardenObject,
  myCurrentSortedGrowSlotIndices,
  myCurrentGrowSlotIndex,
  type CurrentGardenObject,
  type PlantSlotTiming,
} from "../store/atoms";
import { plantCatalog } from "../data";
import { readAriesPath, writeAriesPath } from "../utils/localStorage";

/** Référence des mutations visuelles reconnues par le locker. */
const VISUAL_MUTATIONS = new Set(["Gold", "Rainbow"] as const);
const LOCKER_NO_WEATHER_TAG = "NoWeatherEffect" as const;

const normalizeMutationTag = (value: unknown): string => {
  const raw = typeof value === "string" ? value : value == null ? "" : String(value);
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const collapsed = trimmed.toLowerCase().replace(/[\s_-]+/g, "");
  switch (collapsed) {
    case "gold": return "Gold";
    case "rainbow": return "Rainbow";
    case "wet": return "Wet";
    case "chilled": return "Chilled";
    case "frozen": return "Frozen";
    case "dawn":
    case "dawnlit":
    case "dawnlight": return "Dawnlit";
    case "dawnbound":
    case "dawncharged":
    case "dawnradiant": return "Dawnbound";
    case "amberlit":
    case "amberlight":
    case "amberglow":
    case "ambershine": return "Amberlit";
    case "amberbound":
    case "ambercharged":
    case "amberradiant": return "Amberbound";
    default: return trimmed;
  }
};

const canonicalizeWeatherTag = (value: unknown): string | null => {
  if (value === LOCKER_NO_WEATHER_TAG) return LOCKER_NO_WEATHER_TAG;
  const normalized = normalizeMutationTag(value);
  return normalized || null;
};

const normalizeMutationsList = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const normalized = normalizeMutationTag(raw[i]);
    if (normalized) out.push(normalized);
  }
  return out;
};

const normalizeSpeciesKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .replace(/(seed|plant|baby|fruit|crop)$/i, "");

const MAX_SCALE_BY_SPECIES = (() => {
  const map = new Map<string, number>();
  const register = (key: unknown, value: number) => {
    if (typeof key !== "string") return;
    const normalized = normalizeSpeciesKey(key.trim());
    if (!normalized || map.has(normalized)) return;
    map.set(normalized, value);
  };

  for (const [species, entry] of Object.entries(plantCatalog as Record<string, any>)) {
    const maxScale = Number(entry?.crop?.maxScale);
    if (!Number.isFinite(maxScale) || maxScale <= 0) continue;
    register(species, maxScale);
    register(entry?.seed?.name, maxScale);
    register(entry?.plant?.name, maxScale);
    register(entry?.crop?.name, maxScale);
  }

  return map;
})();

type VisualTag = "Gold" | "Rainbow";
type WeatherTag = string;
export type WeatherMode = "ANY" | "ALL" | "RECIPES";
export type LockerScaleLockMode = "MINIMUM" | "MAXIMUM" | "RANGE" | "NONE";
export type LockerLockMode = "LOCK" | "ALLOW";

export type LockerSettingsPersisted = {
  minScalePct: number;
  maxScalePct: number;
  scaleLockMode: LockerScaleLockMode;
  lockMode?: LockerLockMode;
  minInventory: number;
  avoidNormal: boolean;
  includeNormal?: boolean;
  highlightEnabled?: boolean;
  visualMutations: VisualTag[];
  weatherMode: WeatherMode;
  weatherSelected: WeatherTag[];
  weatherRecipes: WeatherTag[][];
};

export type LockerOverridePersisted = {
  enabled: boolean;
  settings: LockerSettingsPersisted;
};

export type LockerStatePersisted = {
  enabled: boolean;
  settings: LockerSettingsPersisted;
  overrides: Record<string, LockerOverridePersisted>;
};

export type LockerStateEvent = {
  type: "locker-state-changed";
  state: LockerStatePersisted;
};

export type LockerSlotChangeEvent = {
  type: "locker-slot-info-changed";
  info: LockerSlotInfo;
  harvestAllowed: boolean | null;
  detectedAt: number | null;
};

export type LockerSlotSnapshot = {
  info: LockerSlotInfo;
  harvestAllowed: boolean | null;
  detectedAt: number | null;
};

type LockerEffectiveSettings = {
  enabled: boolean;
  settings: LockerSettingsPersisted;
};

type HarvestCheckArgs = {
  seedKey: string | null;
  sizePercent: number;
  mutations: readonly string[] | null | undefined;
};

/** Structure retournée par le watcher Locker. */
export type LockerSlotInfo = {
  /** true lorsque l'objet courant est une plante */
  isPlant: boolean;
  /** Index réel du slot dans le tableau de slots de la plante (null si indisponible) */
  originalIndex: number | null;
  /** Position dans l'ordre visuel (null si aucun slot disponible) */
  orderedIndex: number | null;
  /** Nombre total de slots exposés par la plante (y compris vides) */
  totalSlots: number;
  /** Nombre de slots réellement présents (non null) */
  availableSlotCount: number;
  /** Référence brute du slot courant (null si aucun slot valide) */
  slot: any | null;
  /** Clef de graine déduite de l'objet courant (null si indisponible) */
  seedKey: string | null;
  /** Taille actuelle du crop en pourcentage (null si inconnue) */
  sizePercent: number | null;
  /** Mutations associées au slot courant */
  mutations: string[];
};

const emptySlotInfo = (): LockerSlotInfo => ({
  isPlant: false,
  originalIndex: null,
  orderedIndex: null,
  totalSlots: 0,
  availableSlotCount: 0,
  slot: null,
  seedKey: null,
  sizePercent: null,
  mutations: [],
});

const now = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

const shallowEqualStrings = (a: readonly string[] | null | undefined, b: readonly string[] | null | undefined): boolean => {
  if (a === b) return true;
  if (!a || !b) return (a?.length ?? 0) === (b?.length ?? 0);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const slotInfosEqual = (a: LockerSlotInfo, b: LockerSlotInfo): boolean =>
  a.isPlant === b.isPlant &&
  a.originalIndex === b.originalIndex &&
  a.orderedIndex === b.orderedIndex &&
  a.totalSlots === b.totalSlots &&
  a.availableSlotCount === b.availableSlotCount &&
  a.slot === b.slot &&
  a.seedKey === b.seedKey &&
  a.sizePercent === b.sizePercent &&
  shallowEqualStrings(a.mutations, b.mutations);

type CGO = CurrentGardenObject & { objectType?: string; slots?: any[] };
const isPlantObject = (o: CGO | null | undefined): o is CGO & { objectType: "plant" } =>
  !!o && o.objectType === "plant";

const slotSignature = (slot: PlantSlotTiming | null | undefined): string => {
  if (!slot) return "∅";
  const species = slot.species ?? "";
  const start = Number.isFinite(slot.startTime as number) ? (slot.startTime as number) : 0;
  const end = Number.isFinite(slot.endTime as number) ? (slot.endTime as number) : 0;
  const target = Number.isFinite(slot.targetScale as number) ? (slot.targetScale as number) : 0;
  const muts = Array.isArray(slot.mutations) ? slot.mutations.join(",") : "";
  return `${species}|${start}|${end}|${target}|${muts}`;
};

const gardenObjectSignature = (obj: CurrentGardenObject): string => {
  if (!obj) return "∅";
  if (!isPlantObject(obj)) {
    if (!obj || typeof obj !== "object") return String(obj);
    const entries = Object.keys(obj as Record<string, unknown>)
      .sort()
      .map((key) => `${key}:${JSON.stringify((obj as Record<string, unknown>)[key])}`);
    return `other|${entries.join(";")}`;
  }
  const base = `${obj.objectType}|${obj.species ?? ""}|${obj.plantedAt ?? 0}|${obj.maturedAt ?? 0}`;
  const slots = Array.isArray(obj.slots)
    ? obj.slots.map((slot) => slotSignature(slot as PlantSlotTiming)).join("||")
    : "";
  return `${base}|slots:${slots}`;
};

const arraySignature = (arr: number[] | null): string =>
  Array.isArray(arr) ? arr.join(",") : "∅";

const defaultOrder = (n: number) => Array.from({ length: n }, (_, i) => i);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const extractSeedKey = (obj: CGO | null | undefined): string | null => {
  if (!obj || typeof obj !== "object") return null;
  if (typeof (obj as Record<string, unknown>).seedKey === "string") {
    return (obj as Record<string, unknown>).seedKey as string;
  }
  if (typeof obj.species === "string" && obj.species) {
    return obj.species;
  }
  const asAny = obj as Record<string, unknown>;
  const fallbacks = ["seedSpecies", "plantSpecies", "cropSpecies", "speciesId"];
  for (const key of fallbacks) {
    const value = asAny[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
};

const clampPercent = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const lookupMaxScale = (species: unknown): number | null => {
  if (typeof species !== "string") return null;
  const normalized = normalizeSpeciesKey(species.trim());
  if (!normalized) return null;
  const found = MAX_SCALE_BY_SPECIES.get(normalized);
  if (typeof found === "number" && Number.isFinite(found) && found > 0) {
    return found;
  }
  return null;
};

const getMaxScaleForSlot = (slot: any): number | null => {
  if (!slot || typeof slot !== "object") return null;
  const candidates = new Set<string>();
  const fromSeedKey = extractSeedKey(slot as any);
  if (fromSeedKey) candidates.add(fromSeedKey);
  const fields = [
    "species",
    "seedSpecies",
    "plantSpecies",
    "cropSpecies",
    "baseSpecies",
    "seedKey",
  ];
  for (const field of fields) {
    const value = (slot as Record<string, unknown>)[field];
    if (typeof value === "string" && value) {
      candidates.add(value);
    }
  }
  for (const cand of candidates) {
    const max = lookupMaxScale(cand);
    if (typeof max === "number" && Number.isFinite(max) && max > 0) {
      return max;
    }
  }
  return null;
};

const extractSizePercent = (slot: any): number => {
  if (!slot || typeof slot !== "object") return 100;
  const direct = Number(slot.sizePercent ?? slot.sizePct ?? slot.size ?? slot.percent ?? slot.progressPercent);
  if (Number.isFinite(direct)) {
    return clampPercent(Math.round(direct), 0, 100);
  }
  const scale = Number(slot.targetScale ?? slot.scale);
  if (Number.isFinite(scale)) {
    const maxScale = getMaxScaleForSlot(slot);
    if (typeof maxScale === "number" && Number.isFinite(maxScale) && maxScale > 1) {
      const clamped = Math.max(1, Math.min(maxScale, scale));
      const pct = 50 + ((clamped - 1) / (maxScale - 1)) * 50;
      return clampPercent(Math.round(pct), 50, 100);
    }
    if (scale > 1 && scale <= 2) {
      const pct = 50 + ((scale - 1) / 1) * 50;
      return clampPercent(Math.round(pct), 50, 100);
    }
    const pct = Math.round(scale * 100);
    return clampPercent(pct, 0, 100);
  }
  return 100;
};

export interface LockerSlotWatcher {
  /** Retourne la dernière information connue. */
  get(): LockerSlotInfo;
  /** Ajoute un listener appelé à chaque changement. */
  onChange(cb: (info: LockerSlotInfo) => void): () => void;
  /** Stoppe la surveillance. */
  stop(): void;
  /** Force un recalcul immédiat de l'état courant. */
  recompute(): void;
}

export function startLockerSlotWatcherViaGardenObject(): LockerSlotWatcher {
  if (typeof window === "undefined") {
    return {
      get: () => emptySlotInfo(),
      onChange: () => () => {},
      stop() {},
      recompute() {},
    };
  }

  let cur: CurrentGardenObject = null;
  let sortedIdx: number[] | null = null;
  let sortedIdxSig = arraySignature(sortedIdx);
  let selectedIdx: number | null = null;
  let lastInfo: LockerSlotInfo = emptySlotInfo();
  let curSig = gardenObjectSignature(cur);

  const listeners = new Set<(info: LockerSlotInfo) => void>();
  const notify = () => {
    for (const fn of listeners) {
      try {
        fn(lastInfo);
      } catch {}
    }
  };

  let scheduled = false;
  const scheduleRecomputeAndNotify = () => {
    // Applique immédiatement l'état pour éviter toute fenêtre pendant laquelle
    // l'ancien slot resterait actif (ex: désactivation tardive du bouton harvest).
    // Les notifications différées restent utiles pour consolider les changements
    // provenant d'autres observables modifiés dans le même tick.
    recomputeAndNotify();
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      recomputeAndNotify();
    };
    if (typeof globalThis !== "undefined" && typeof globalThis.queueMicrotask === "function") {
      globalThis.queueMicrotask(run);
    } else if (typeof Promise !== "undefined") {
      Promise.resolve().then(run);
    } else if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
      window.setTimeout(run, 0);
    } else {
      run();
    }
  };

  function getOrder(slotCount: number): number[] {
    if (!slotCount) return [];
    if (Array.isArray(sortedIdx) && sortedIdx.length === slotCount) {
      return sortedIdx.slice();
    }
    return defaultOrder(slotCount);
  }

  function selectedOrderedPosition(order: number[], slotCount: number): number {
    if (!slotCount || !order.length) return 0;
    const raw = Number.isFinite(selectedIdx as number) ? (selectedIdx as number) : 0;
    const clampedRaw = clamp(raw, 0, slotCount - 1);
    const pos = order.indexOf(clampedRaw);
    return pos >= 0 ? pos : 0;
  }

  function sanitizeMutations(raw: unknown): string[] {
    return normalizeMutationsList(raw);
  }

  function computeSlotInfo(): LockerSlotInfo {
    const seedKey = extractSeedKey(cur);
    if (!isPlantObject(cur)) {
      return {
        isPlant: false,
        originalIndex: null,
        orderedIndex: null,
        totalSlots: 0,
        availableSlotCount: 0,
        slot: null,
        seedKey,
        sizePercent: null,
        mutations: [],
      };
    }
    const slots = Array.isArray((cur as CGO).slots) ? (cur as CGO).slots! : [];
    const slotCount = slots.length;
    if (!slotCount) {
      return {
        isPlant: true,
        originalIndex: null,
        orderedIndex: null,
        totalSlots: 0,
        availableSlotCount: 0,
        slot: null,
        seedKey,
        sizePercent: null,
        mutations: [],
      };
    }

    const order = getOrder(slotCount);
    const availableIndices: number[] = [];
    for (const idx of order) {
      if (Number.isInteger(idx) && idx >= 0 && idx < slotCount) {
        if (slots[idx] != null) availableIndices.push(idx);
      }
    }

    const availableCount = availableIndices.length;
    if (!availableCount) {
      return {
        isPlant: true,
        originalIndex: null,
        orderedIndex: null,
        totalSlots: slotCount,
        availableSlotCount: 0,
        slot: null,
        seedKey,
        sizePercent: null,
        mutations: [],
      };
    }

    // mySelectedSlotIdAtom holds the sub-slot's slotId, NOT its position in
    // the slots[] array (sparse plants have non-contiguous slotIds — same fix
    // as the HarvestCrop interceptor in ws-hook). Resolve by slotId first and
    // only fall back to the legacy position-based logic when no slot carries
    // a matching slotId.
    let originalIndex: number | null = null;
    let clampedPos: number;
    const bySlotId = Number.isFinite(selectedIdx as number)
      ? slots.findIndex(
          (s) => s && typeof s === "object" && (s as any).slotId === selectedIdx,
        )
      : -1;
    if (bySlotId >= 0) {
      originalIndex = bySlotId;
      const posInOrder = availableIndices.indexOf(bySlotId);
      clampedPos = posInOrder >= 0 ? posInOrder : 0;
    } else {
      const pos = selectedOrderedPosition(order, slotCount);
      clampedPos = clamp(pos, 0, availableCount - 1);
      originalIndex = availableIndices[clampedPos] ?? null;
    }
    const slot = typeof originalIndex === "number" ? slots[originalIndex] ?? null : null;
    const sizePercent = slot ? extractSizePercent(slot) : null;
    const mutations = slot ? sanitizeMutations(slot.mutations) : [];

    // If the slot has its own species (e.g. "FourLeafClover" from a Clover plant),
    // prefer it as the seedKey so per-crop overrides resolve correctly.
    const slotSpecies = slot ? extractSeedKey(slot as any) : null;
    const effectiveSeedKey = slotSpecies ?? seedKey;

    return {
      isPlant: true,
      originalIndex: typeof originalIndex === "number" ? originalIndex : null,
      orderedIndex: clampedPos,
      totalSlots: slotCount,
      availableSlotCount: availableCount,
      slot: slot ?? null,
      seedKey: effectiveSeedKey,
      sizePercent,
      mutations,
    };
  }

  function mutationsEqual(a: readonly string[], b: readonly string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function infosEqual(a: LockerSlotInfo, b: LockerSlotInfo): boolean {
    return (
      a.isPlant === b.isPlant &&
      a.originalIndex === b.originalIndex &&
      a.orderedIndex === b.orderedIndex &&
      a.totalSlots === b.totalSlots &&
      a.availableSlotCount === b.availableSlotCount &&
      a.slot === b.slot &&
      a.seedKey === b.seedKey &&
      a.sizePercent === b.sizePercent &&
      mutationsEqual(a.mutations, b.mutations)
    );
  }

  function recomputeAndNotify() {
    const next = computeSlotInfo();
    if (!infosEqual(next, lastInfo)) {
      lastInfo = next;
      notify();
    }
  }

  (async () => {
    try { selectedIdx = await myCurrentGrowSlotIndex.get(); } catch {}
    try {
      const v = await myCurrentSortedGrowSlotIndices.get();
      sortedIdx = Array.isArray(v) ? v.slice() : null;
      sortedIdxSig = arraySignature(sortedIdx);
    } catch {}
    try {
      cur = await myCurrentGardenObject.get();
      curSig = gardenObjectSignature(cur);
    } catch {}

    const refreshSorted = (v: number[] | null | undefined) => {
      const next = Array.isArray(v) ? v.slice() : null;
      const sig = arraySignature(next);
      if (sig === sortedIdxSig) return false;
      sortedIdx = next;
      sortedIdxSig = sig;
      return true;
    };

    const refreshGarden = (v: CurrentGardenObject) => {
      const sig = gardenObjectSignature(v ?? null);
      if (sig === curSig) return false;
      cur = v;
      curSig = sig;
      return true;
    };

    let awaitIndexBeforeRecompute = false;
    let awaitIndexTimer: any = null;
    const clearAwaitIndexTimer = () => {
      if (awaitIndexTimer == null) return;
      if (typeof globalThis !== "undefined") {
        const clearer = (globalThis as any).clearTimeout;
        if (typeof clearer === "function") {
          clearer.call(globalThis, awaitIndexTimer);
        }
      }
      awaitIndexTimer = null;
    };
    const deferUntilIndexChanges = () => {
      awaitIndexBeforeRecompute = true;
      if (awaitIndexTimer != null) return;
      const run = () => {
        awaitIndexTimer = null;
        if (!awaitIndexBeforeRecompute) return;
        awaitIndexBeforeRecompute = false;
        scheduleRecomputeAndNotify();
      };
      if (typeof globalThis !== "undefined") {
        const setter = (globalThis as any).setTimeout;
        if (typeof setter === "function") {
          awaitIndexTimer = setter.call(globalThis, run, 0);
          return;
        }
      }
      run();
    };

    myCurrentSortedGrowSlotIndices.onChange((v) => {
      const changed = refreshSorted(v);
      if (!changed) return;
      deferUntilIndexChanges();
    });

    myCurrentGardenObject.onChange((v) => {
      const changed = refreshGarden(v);
      if (!changed) return;
      deferUntilIndexChanges();
    });
    myCurrentGrowSlotIndex.onChange((idx) => {
      selectedIdx = Number.isFinite(idx as number) ? (idx as number) : 0;
      void (async () => {
        try {
          refreshSorted(await myCurrentSortedGrowSlotIndices.get());
        } catch {}
        try {
          refreshGarden(await myCurrentGardenObject.get());
        } catch {}
        if (awaitIndexBeforeRecompute) {
          awaitIndexBeforeRecompute = false;
          clearAwaitIndexTimer();
        }
        scheduleRecomputeAndNotify();
      })();
    });

    recomputeAndNotify();
  })();

  return {
    get() {
      return lastInfo;
    },
    onChange(cb: (info: LockerSlotInfo) => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    stop() {
      listeners.clear();
    },
    recompute() {
      recomputeAndNotify();
    },
  };
}

function defaultSettings(): LockerSettingsPersisted {
  return {
    minScalePct: 50,
    maxScalePct: 100,
    scaleLockMode: "RANGE",
    lockMode: "LOCK",
    minInventory: 91,
    avoidNormal: false,
    includeNormal: true,
    highlightEnabled: false,
    visualMutations: [],
    weatherMode: "ANY",
    weatherSelected: [],
    weatherRecipes: [],
  };
}

function defaultState(): LockerStatePersisted {
  return {
    enabled: false,
    settings: defaultSettings(),
    overrides: {},
  };
}

const ARIES_LOCKER_STATE_PATH = "locker.state";

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function sanitizeSettings(raw: any): LockerSettingsPersisted {
  const base = defaultSettings();
  base.lockMode = raw?.lockMode === "ALLOW" ? "ALLOW" : "LOCK";
  const rawMode = raw?.scaleLockMode;
  const scaleMode: LockerScaleLockMode =
    rawMode === "MINIMUM" ? "MINIMUM"
    : rawMode === "MAXIMUM" ? "MAXIMUM"
    : rawMode === "NONE" ? "NONE"
    : "RANGE";
  base.scaleLockMode = scaleMode;

  const minScaleRaw = Number(raw?.minScalePct);
  let minScale = Number.isFinite(minScaleRaw)
    ? clampNumber(Math.round(minScaleRaw), 50, 100)
    : 50;

  const maxScaleRaw = Number(raw?.maxScalePct);
  let maxScale = Number.isFinite(maxScaleRaw)
    ? clampNumber(Math.round(maxScaleRaw), 50, 100)
    : 100;

  if (scaleMode === "RANGE") {
    maxScale = clampNumber(maxScale, 51, 100);
    if (maxScale <= minScale) {
      if (minScale >= 99) {
        minScale = 99;
        maxScale = 100;
      } else {
        maxScale = clampNumber(minScale + 1, 51, 100);
      }
    }
  } else if (scaleMode === "MAXIMUM") {
    maxScale = clampNumber(maxScale, 50, 100);
  } else if (scaleMode === "MINIMUM") {
    minScale = clampNumber(minScale, 50, 100);
  }

  base.minScalePct = minScale;
  base.maxScalePct = maxScale;

  const minInv = Number(raw?.minInventory);
  base.minInventory = Number.isFinite(minInv) ? clampNumber(Math.round(minInv), 0, 999) : 91;

  if (typeof raw?.avoidNormal === "boolean") {
    base.avoidNormal = raw.avoidNormal;
  } else {
    base.avoidNormal = raw?.includeNormal === false;
  }
  base.includeNormal = !base.avoidNormal;
  base.highlightEnabled = raw?.highlightEnabled === true;

  base.visualMutations = Array.isArray(raw?.visualMutations)
    ? Array.from(new Set(raw.visualMutations.filter((m: any) => VISUAL_MUTATIONS.has(m)))) as VisualTag[]
    : [];

  const mode = raw?.weatherMode;
  base.weatherMode = mode === "ALL" || mode === "RECIPES" ? mode : "ANY";

  base.weatherSelected = Array.isArray(raw?.weatherSelected)
    ? Array.from(new Set(raw.weatherSelected.map((m: any) => String(m || "")).filter(Boolean)))
    : [];

  base.weatherRecipes = Array.isArray(raw?.weatherRecipes)
    ? raw.weatherRecipes
        .map((recipe: any) =>
          Array.isArray(recipe)
            ? Array.from(new Set(recipe.map((m: any) => String(m || "")).filter(Boolean)))
            : [],
        )
        .filter((arr: string[]) => arr.length > 0)
    : [];

  return base;
}

function sanitizeState(raw: any): LockerStatePersisted {
  const state = defaultState();
  if (!raw || typeof raw !== "object") return state;

  state.enabled = raw.enabled === true;
  state.settings = sanitizeSettings(raw.settings);

  state.overrides = {};
  if (raw.overrides && typeof raw.overrides === "object") {
    for (const [key, value] of Object.entries(raw.overrides as Record<string, any>)) {
      if (!key) continue;
      state.overrides[key] = {
        enabled: value?.enabled === true,
        settings: sanitizeSettings(value?.settings),
      };
    }
  }

  return state;
}

function cloneSettings(settings: LockerSettingsPersisted): LockerSettingsPersisted {
  return {
    minScalePct: settings.minScalePct,
    maxScalePct: settings.maxScalePct,
    scaleLockMode: settings.scaleLockMode,
    lockMode: settings.lockMode === "ALLOW" ? "ALLOW" : "LOCK",
    minInventory: settings.minInventory,
    avoidNormal: settings.avoidNormal,
    includeNormal: settings.includeNormal,
    highlightEnabled: settings.highlightEnabled === true,
    visualMutations: settings.visualMutations.slice(),
    weatherMode: settings.weatherMode,
    weatherSelected: settings.weatherSelected.slice(),
    weatherRecipes: settings.weatherRecipes.map(recipe => recipe.slice()),
  };
}

function cloneState(state: LockerStatePersisted): LockerStatePersisted {
  const overrides: Record<string, LockerOverridePersisted> = {};
  for (const [key, value] of Object.entries(state.overrides)) {
    overrides[key] = { enabled: value.enabled, settings: cloneSettings(value.settings) };
  }
  return {
    enabled: state.enabled,
    settings: cloneSettings(state.settings),
    overrides,
  };
}

function cloneSlotInfo(info: LockerSlotInfo): LockerSlotInfo {
  return {
    isPlant: info.isPlant,
    originalIndex: info.originalIndex,
    orderedIndex: info.orderedIndex,
    totalSlots: info.totalSlots,
    availableSlotCount: info.availableSlotCount,
    slot: info.slot,
    seedKey: info.seedKey,
    sizePercent: info.sizePercent,
    mutations: info.mutations.slice(),
  };
}

function mutationsToArrays(raw: readonly string[] | null | undefined) {
  const normalized = normalizeMutationsList(raw);
  let hasGold = false;
  let hasRainbow = false;
  const weather: string[] = [];

  for (let i = 0; i < normalized.length; i++) {
    const tag = String(normalized[i] || "");
    if (!tag) continue;
    if (tag === "Gold") {
      hasGold = true;
    } else if (tag === "Rainbow") {
      hasRainbow = true;
    } else {
      weather.push(tag);
    }
  }

  return { hasGold, hasRainbow, weather };
}

export class LockerService {
  private state: LockerStatePersisted = defaultState();
  private listeners = new Set<(event: LockerStateEvent) => void>();
  private slotInfoListeners = new Set<(event: LockerSlotChangeEvent) => void>();
  private slotWatcher: LockerSlotWatcher | null = null;
  private slotWatcherUnsub: (() => void) | null = null;
  private currentSlotInfo: LockerSlotInfo = emptySlotInfo();
  private currentSlotHarvestAllowed: boolean | null = null;
  private lastSlotChangeDetectedAt: number | null = null;

  constructor() {
    this.load();
    this.updateSlotWatcher();
  }

  private load(): void {
    if (typeof window === "undefined") {
      this.state = defaultState();
      return;
    }

    try {
      const parsed = readAriesPath<unknown>(ARIES_LOCKER_STATE_PATH);
      this.state = sanitizeState(parsed);
    } catch {
      this.state = defaultState();
    }
  }

  private save(): void {
    if (typeof window === "undefined") return;
    try {
      writeAriesPath(ARIES_LOCKER_STATE_PATH, this.state);
    } catch {
      /* ignore */
    }
  }

  private emit(): void {
    if (!this.listeners.size) return;
    const snapshot = this.getState();
    const event: LockerStateEvent = { type: "locker-state-changed", state: snapshot };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* ignore */
      }
    }
  }

  private setState(next: LockerStatePersisted): void {
    this.state = next;
    this.updateSlotWatcher();
    this.save();
    this.emit();
    this.requestSlotWatcherRecompute();
    this.reapplyCurrentSlotInfo();
  }

  private updateSlotWatcher(): void {
    const shouldWatch = this.state.enabled;

    if (shouldWatch) {
      if (!this.slotWatcher) {
        this.slotWatcher = startLockerSlotWatcherViaGardenObject();
      }
      if (this.slotWatcher && !this.slotWatcherUnsub) {
        try {
          this.slotWatcherUnsub = this.slotWatcher.onChange((info) => this.handleSlotInfo(info));
        } catch {
          this.slotWatcherUnsub = null;
        }
      }
      try {
        const info = this.slotWatcher ? this.slotWatcher.get() : emptySlotInfo();
        this.handleSlotInfo(info, { silent: true });
      } catch {
        this.handleSlotInfo(emptySlotInfo(), { silent: true });
      }
      return;
    }

    this.detachSlotWatcher();
  }

  getState(): LockerStatePersisted {
    return cloneState(this.state);
  }

  setGlobalState(next: { enabled: boolean; settings: LockerSettingsPersisted }): void {
    const current = this.state;
    const sanitized = sanitizeSettings(next.settings);
    const updated: LockerStatePersisted = {
      enabled: !!next.enabled,
      settings: sanitized,
      overrides: { ...current.overrides },
    };
    this.setState(updated);
  }

  setOverride(seedKey: string, override: LockerOverridePersisted): void {
    if (!seedKey) return;
    const sanitized: LockerOverridePersisted = {
      enabled: !!override?.enabled,
      settings: sanitizeSettings(override?.settings),
    };
    const overrides = { ...this.state.overrides, [seedKey]: sanitized };
    this.setState({ ...this.state, overrides });
  }

  removeOverride(seedKey: string): void {
    if (!seedKey) return;
    if (!(seedKey in this.state.overrides)) return;
    const overrides = { ...this.state.overrides };
    delete overrides[seedKey];
    this.setState({ ...this.state, overrides });
  }

  subscribe(listener: (event: LockerStateEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onSlotInfoChange(listener: (event: LockerSlotChangeEvent) => void): () => void {
    this.slotInfoListeners.add(listener);
    return () => this.slotInfoListeners.delete(listener);
  }

  getCurrentSlotSnapshot(): LockerSlotSnapshot {
    return {
      info: cloneSlotInfo(this.currentSlotInfo),
      harvestAllowed: this.currentSlotHarvestAllowed,
      detectedAt: this.lastSlotChangeDetectedAt,
    };
  }

  private requestSlotWatcherRecompute(): void {
    if (!this.slotWatcher) return;
    try {
      this.slotWatcher.recompute();
    } catch {
      /* ignore */
    }
  }

  private detachSlotWatcher(): void {
    if (this.slotWatcherUnsub) {
      try {
        this.slotWatcherUnsub();
      } catch {
        /* ignore */
      }
      this.slotWatcherUnsub = null;
    }
    if (this.slotWatcher) {
      try {
        this.slotWatcher.stop();
      } catch {
        /* ignore */
      }
      this.slotWatcher = null;
    }
    this.handleSlotInfo(emptySlotInfo(), { silent: true });
  }

  private handleSlotInfo(info: LockerSlotInfo, opts: { silent?: boolean } = {}): void {
    const { silent = false } = opts;
    const prevInfo = this.currentSlotInfo;
    const prevHarvestAllowed = this.currentSlotHarvestAllowed;
    const normalizedMutations = normalizeMutationsList(info.mutations);
    const nextInfo = { ...info, mutations: normalizedMutations };

    let computedSizePercent: number | null = null;
    let harvestAllowed: boolean | null = null;
    let displaySizePercent: number | null = null;

    if (nextInfo.isPlant && nextInfo.slot) {
      if (typeof nextInfo.sizePercent === "number" && Number.isFinite(nextInfo.sizePercent)) {
        computedSizePercent = nextInfo.sizePercent;
      } else {
        computedSizePercent = extractSizePercent(nextInfo.slot);
      }
      try {
        const assessment = this.assessHarvest({
          seedKey: nextInfo.seedKey ?? null,
          sizePercent: computedSizePercent ?? 0,
          mutations: normalizedMutations,
        });
        harvestAllowed = assessment.allowed;
      } catch {
        harvestAllowed = null;
      }
    } else {
      computedSizePercent = typeof nextInfo.sizePercent === "number" && Number.isFinite(nextInfo.sizePercent)
        ? nextInfo.sizePercent
        : null;
      harvestAllowed = null;
    }

    if (typeof computedSizePercent === "number") {
      displaySizePercent = Math.max(50, Math.min(100, computedSizePercent));
    }

    this.currentSlotInfo = nextInfo;
    this.currentSlotHarvestAllowed = harvestAllowed;

    if (!silent) {
      if (nextInfo.isPlant) {
        if (nextInfo.slot) {
          console.log("[Locker] Slot selection", {
            seedKey: nextInfo.seedKey ?? null,
            slotIndex: nextInfo.originalIndex,
            orderedIndex: nextInfo.orderedIndex,
            sizePercent: computedSizePercent,
            displaySizePercent,
            harvestAllowed,
            mutations: normalizedMutations,
            slot: nextInfo.slot,
          });
        } else {
          console.log("[Locker] Slot selection", {
            isPlant: true,
            slotIndex: nextInfo.originalIndex,
            orderedIndex: nextInfo.orderedIndex,
            totalSlots: nextInfo.totalSlots,
            availableSlotCount: nextInfo.availableSlotCount,
            seedKey: nextInfo.seedKey ?? null,
            displaySizePercent,
            slot: nextInfo.slot,
          });
        }
      } else {
        console.log("[Locker] Slot selection", { isPlant: false, slot: nextInfo.slot });
      }

      const infoChanged =
        !slotInfosEqual(prevInfo, nextInfo) ||
        (prevHarvestAllowed ?? null) !== (harvestAllowed ?? null);
      if (infoChanged) {
        this.lastSlotChangeDetectedAt = now();
      }
    }

    this.emitSlotInfoChange();
  }

  private reapplyCurrentSlotInfo(): void {
    try {
      const info = this.slotWatcher ? this.slotWatcher.get() : emptySlotInfo();
      this.handleSlotInfo(info, { silent: true });
    } catch {
      this.handleSlotInfo(emptySlotInfo(), { silent: true });
    }
  }

  recomputeCurrentSlot(): void {
    this.requestSlotWatcherRecompute();
    this.reapplyCurrentSlotInfo();
  }

  private effectiveSettings(seedKey: string | null): LockerEffectiveSettings {
    if (!this.state.enabled) {
      return { enabled: false, settings: this.state.settings };
    }

    if (seedKey) {
      const override = this.state.overrides[seedKey];
      if (override?.enabled) {
        return { enabled: true, settings: override.settings };
      }
    }

    return { enabled: true, settings: this.state.settings };
  }

  private assessHarvest(args: HarvestCheckArgs): {
    effective: LockerEffectiveSettings;
    filters: ReturnType<LockerService["evaluateLockFilters"]>;
    lockMode: LockerLockMode;
    allowed: boolean;
  } {
    const effective = this.effectiveSettings(args.seedKey);
    const filters = this.evaluateLockFilters(effective.settings, args);
    const lockMode = effective.settings.lockMode === "ALLOW" ? "ALLOW" : "LOCK";
    if (!effective.enabled) {
      return { effective, filters, lockMode, allowed: true };
    }
    const blocked = lockMode === "ALLOW"
      ? ((filters.size.hasCriteria && !filters.size.matched) ||
        (filters.color.hasCriteria && !filters.color.matched) ||
        (filters.weather.hasCriteria && !filters.weather.matched))
      : filters.matchAny;
    return { effective, filters, lockMode, allowed: !blocked };
  }

  private evaluateLockFilters(
    settings: LockerSettingsPersisted,
    args: HarvestCheckArgs,
  ): {
    size: { hasCriteria: boolean; matched: boolean };
    color: { hasCriteria: boolean; matched: boolean };
    weather: { hasCriteria: boolean; matched: boolean };
    matchAny: boolean;
    sizeMin: number | null;
    sizeMax: number | null;
    scaleMode: LockerScaleLockMode;
  } {
    const size = { hasCriteria: false, matched: false };
    const color = { hasCriteria: false, matched: false };
    const weatherInfo = { hasCriteria: false, matched: false };

    const scaleMode: LockerScaleLockMode = settings.scaleLockMode === "MAXIMUM"
      ? "MAXIMUM"
      : settings.scaleLockMode === "MINIMUM"
        ? "MINIMUM"
        : settings.scaleLockMode === "NONE"
          ? "NONE"
          : "RANGE";
    const minScale = clampNumber(Math.round(settings.minScalePct ?? 50), 50, 100);
    const maxScaleBase = clampNumber(Math.round(settings.maxScalePct ?? 100), 50, 100);
    const epsilon = 0.0001;

    let sizeMin: number | null = null;
    let sizeMax: number | null = null;

    if (scaleMode === "RANGE") {
      size.hasCriteria = true;
      const maxScaleRaw = clampNumber(maxScaleBase, 51, 100);
      const maxScale = maxScaleRaw <= minScale ? Math.min(100, Math.max(51, minScale + 1)) : maxScaleRaw;
      sizeMin = minScale;
      sizeMax = maxScale;
      const inRange =
        args.sizePercent + epsilon >= minScale &&
        args.sizePercent - epsilon <= maxScale;
      size.matched = inRange;
    } else if (scaleMode === "MINIMUM") {
      size.hasCriteria = true;
      sizeMin = minScale;
      size.matched = args.sizePercent + epsilon >= minScale;
    } else if (scaleMode === "MAXIMUM") {
      size.hasCriteria = true;
      const maxScale = clampNumber(maxScaleBase, 50, 100);
      sizeMax = maxScale;
      size.matched = args.sizePercent - epsilon <= maxScale;
    }

    const { hasGold, hasRainbow, weather } = mutationsToArrays(args.mutations);
    const isNormal = !hasGold && !hasRainbow;
    const avoidGold = settings.visualMutations.includes("Gold");
    const avoidRainbow = settings.visualMutations.includes("Rainbow");

    const colorFilters = [
      settings.avoidNormal ? "normal" : null,
      avoidGold ? "gold" : null,
      avoidRainbow ? "rainbow" : null,
    ].filter(Boolean);

    if (colorFilters.length) {
      color.hasCriteria = true;
      const matches =
        (settings.avoidNormal && isNormal) ||
        (avoidGold && hasGold) ||
        (avoidRainbow && hasRainbow);
      color.matched = matches;
    }

    const selected = settings.weatherSelected ?? [];
    const mode = settings.weatherMode ?? "ANY";

    if (mode === "RECIPES") {
      const recipes = settings.weatherRecipes ?? [];
      if (recipes.length) {
        weatherInfo.hasCriteria = true;
        let recipeMatch = false;
        for (const recipe of recipes) {
          if (!Array.isArray(recipe) || recipe.length === 0) continue;
          let matches = true;
          for (let j = 0; j < recipe.length; j++) {
            const rawTag = recipe[j];
            const normalizedRequired = canonicalizeWeatherTag(rawTag);
            if (!normalizedRequired) {
              matches = false;
              break;
            }
            if (normalizedRequired === LOCKER_NO_WEATHER_TAG) {
              if (weather.length !== 0) {
                matches = false;
                break;
              }
              continue;
            }
            if (!weather.includes(normalizedRequired)) {
              matches = false;
              break;
            }
          }
          if (matches) {
            recipeMatch = true;
            break;
          }
        }
        weatherInfo.matched = recipeMatch;
      }
      const matchAny = size.matched || color.matched || weatherInfo.matched;
      return { size, color, weather: weatherInfo, matchAny, sizeMin, sizeMax, scaleMode };
    }

    if (selected.length) {
      weatherInfo.hasCriteria = true;
      if (mode === "ALL") {
        let allMatch = true;
        for (let i = 0; i < selected.length; i++) {
          const requiredRaw = selected[i]!;
          const normalizedRequired = canonicalizeWeatherTag(requiredRaw);
          if (!normalizedRequired) {
            allMatch = false;
            break;
          }
          if (normalizedRequired === LOCKER_NO_WEATHER_TAG) {
            if (weather.length !== 0) {
              allMatch = false;
              break;
            }
            continue;
          }
          if (!weather.includes(normalizedRequired)) {
            allMatch = false;
            break;
          }
        }
        weatherInfo.matched = allMatch;
      } else {
        // ANY
        let anyMatch = false;
        for (let i = 0; i < selected.length; i++) {
          const requiredRaw = selected[i]!;
          const normalizedRequired = canonicalizeWeatherTag(requiredRaw);
          if (!normalizedRequired) {
            continue;
          }
          if (normalizedRequired === LOCKER_NO_WEATHER_TAG) {
            if (weather.length === 0) {
              anyMatch = true;
              break;
            }
            continue;
          }
          if (weather.includes(normalizedRequired)) {
            anyMatch = true;
            break;
          }
        }
        weatherInfo.matched = anyMatch;
      }
    }

    const matchAny = size.matched || color.matched || weatherInfo.matched;
    return { size, color, weather: weatherInfo, matchAny, sizeMin, sizeMax, scaleMode };
  }

  private emitSlotInfoChange(): void {
    if (!this.slotInfoListeners.size) {
      return;
    }
    const snapshot: LockerSlotChangeEvent = {
      type: "locker-slot-info-changed",
      info: cloneSlotInfo(this.currentSlotInfo),
      harvestAllowed: this.currentSlotHarvestAllowed,
      detectedAt: this.lastSlotChangeDetectedAt,
    };
    for (const listener of this.slotInfoListeners) {
      try {
        listener(snapshot);
      } catch {
        /* ignore */
      }
    }
  }

  allowsHarvest(args: HarvestCheckArgs): boolean {
    return this.assessHarvest(args).allowed;
  }
}

export const lockerService = new LockerService();
