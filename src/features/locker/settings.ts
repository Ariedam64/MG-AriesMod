// The Harvest Locker's saved settings: their shape, their defaults, and the
// sanitising every value goes through before the locker trusts it.

import { CROP_SIZE_MAX, CROP_SIZE_MIN } from "../../data/rules/cropSize";
import { clamp } from "../../lib/math";

export type VisualTag = "Gold" | "Rainbow";
export type WeatherMode = "ANY" | "ALL" | "RECIPES";
export type LockerScaleLockMode = "MINIMUM" | "MAXIMUM" | "RANGE" | "NONE";
export type LockerLockMode = "LOCK" | "ALLOW";

/** The tag a weather filter uses for "this crop has no weather mutation". */
export const NO_WEATHER_TAG = "NoWeatherEffect";

export type LockerSettingsPersisted = {
  minScalePct: number;
  maxScalePct: number;
  scaleLockMode: LockerScaleLockMode;
  lockMode: LockerLockMode;
  avoidNormal: boolean;
  visualMutations: VisualTag[];
  weatherMode: WeatherMode;
  weatherSelected: string[];
  weatherRecipes: string[][];
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

export function defaultSettings(): LockerSettingsPersisted {
  return {
    minScalePct: CROP_SIZE_MIN,
    maxScalePct: CROP_SIZE_MAX,
    // "None", not "Range". A 50-100 range is an active size criterion that
    // every crop matches, so in LOCK mode it locks the whole species while the
    // sliders sit at their extremes and look like no filter at all. Starting
    // with no size criterion means turning a species on locks nothing until the
    // player actually asks for something.
    scaleLockMode: "NONE",
    lockMode: "LOCK",
    avoidNormal: false,
    visualMutations: [],
    weatherMode: "ANY",
    weatherSelected: [],
    weatherRecipes: [],
  };
}

export function defaultState(): LockerStatePersisted {
  return { enabled: false, settings: defaultSettings(), overrides: {} };
}

const SCALE_MODES: readonly LockerScaleLockMode[] = ["MINIMUM", "MAXIMUM", "RANGE", "NONE"];

/** An unknown mode reads as RANGE, which is what settings saved before NONE existed meant. */
const toScaleMode = (raw: unknown): LockerScaleLockMode =>
  SCALE_MODES.includes(raw as LockerScaleLockMode) ? (raw as LockerScaleLockMode) : "RANGE";

const toCropSize = (raw: unknown, fallback: number): number => {
  const n = Number(raw);
  return Number.isFinite(n) ? clamp(Math.round(n), CROP_SIZE_MIN, CROP_SIZE_MAX) : fallback;
};

/**
 * Bounds of the size filter as whole Crop Sizes. A range always spans at least
 * one point: a range squeezed shut or inverted opens upwards from its minimum,
 * and one pinned at the top becomes 99..100.
 */
export function normalizeScaleRange(
  mode: LockerScaleLockMode,
  rawMin: unknown,
  rawMax: unknown,
): { min: number; max: number } {
  let min = toCropSize(rawMin, CROP_SIZE_MIN);
  let max = toCropSize(rawMax, CROP_SIZE_MAX);
  if (mode === "RANGE") {
    max = Math.max(CROP_SIZE_MIN + 1, max);
    if (max <= min) {
      if (min >= CROP_SIZE_MAX - 1) {
        min = CROP_SIZE_MAX - 1;
        max = CROP_SIZE_MAX;
      } else {
        max = min + 1;
      }
    }
  }
  return { min, max };
}

const uniqueStrings = (raw: unknown): string[] =>
  Array.isArray(raw) ? Array.from(new Set(raw.map((tag) => String(tag || "")).filter(Boolean))) : [];

export function sanitizeSettings(raw: any): LockerSettingsPersisted {
  const scaleLockMode = toScaleMode(raw?.scaleLockMode);
  const { min, max } = normalizeScaleRange(scaleLockMode, raw?.minScalePct, raw?.maxScalePct);
  const weatherMode = raw?.weatherMode;
  return {
    minScalePct: min,
    maxScalePct: max,
    scaleLockMode,
    lockMode: raw?.lockMode === "ALLOW" ? "ALLOW" : "LOCK",
    // Settings saved before `avoidNormal` existed said `includeNormal: false`.
    avoidNormal: typeof raw?.avoidNormal === "boolean" ? raw.avoidNormal : raw?.includeNormal === false,
    visualMutations: Array.isArray(raw?.visualMutations)
      ? Array.from(new Set<VisualTag>(raw.visualMutations.filter((m: unknown) => m === "Gold" || m === "Rainbow")))
      : [],
    weatherMode: weatherMode === "ALL" || weatherMode === "RECIPES" ? weatherMode : "ANY",
    weatherSelected: uniqueStrings(raw?.weatherSelected),
    weatherRecipes: Array.isArray(raw?.weatherRecipes)
      ? raw.weatherRecipes.map(uniqueStrings).filter((recipe: string[]) => recipe.length > 0)
      : [],
  };
}

export function sanitizeState(raw: any): LockerStatePersisted {
  const state = defaultState();
  if (!raw || typeof raw !== "object") return state;

  state.enabled = raw.enabled === true;
  state.settings = sanitizeSettings(raw.settings);
  if (raw.overrides && typeof raw.overrides === "object") {
    for (const [key, value] of Object.entries(raw.overrides as Record<string, any>)) {
      if (!key) continue;
      state.overrides[key] = { enabled: value?.enabled === true, settings: sanitizeSettings(value?.settings) };
    }
  }
  return state;
}

function cloneSettings(settings: LockerSettingsPersisted): LockerSettingsPersisted {
  return {
    ...settings,
    visualMutations: settings.visualMutations.slice(),
    weatherSelected: settings.weatherSelected.slice(),
    weatherRecipes: settings.weatherRecipes.map((recipe) => recipe.slice()),
  };
}

export function cloneState(state: LockerStatePersisted): LockerStatePersisted {
  const overrides: Record<string, LockerOverridePersisted> = {};
  for (const [key, value] of Object.entries(state.overrides)) {
    overrides[key] = { enabled: value.enabled, settings: cloneSettings(value.settings) };
  }
  return { enabled: state.enabled, settings: cloneSettings(state.settings), overrides };
}
