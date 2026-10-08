// Whether the Harvest Locker lets a crop be harvested, from its size and
// mutations and the settings that apply to it. Pure: no state, no game access.

import { NO_WEATHER_TAG, normalizeScaleRange, type LockerSettingsPersisted } from "./settings";

/** Every spelling the game and older saves have used, mapped to the locker's own. */
const MUTATION_ALIASES: Record<string, string> = {
  gold: "Gold",
  rainbow: "Rainbow",
  wet: "Wet",
  chilled: "Chilled",
  frozen: "Frozen",
  dawn: "Dawnlit",
  dawnlit: "Dawnlit",
  dawnlight: "Dawnlit",
  dawnbound: "Dawnbound",
  dawncharged: "Dawnbound",
  dawnradiant: "Dawnbound",
  amberlit: "Amberlit",
  amberlight: "Amberlit",
  amberglow: "Amberlit",
  ambershine: "Amberlit",
  amberbound: "Amberbound",
  ambercharged: "Amberbound",
  amberradiant: "Amberbound",
};

function normalizeMutationTag(value: unknown): string {
  const trimmed = (typeof value === "string" ? value : value == null ? "" : String(value)).trim();
  if (!trimmed) return "";
  return MUTATION_ALIASES[trimmed.toLowerCase().replace(/[\s_-]+/g, "")] ?? trimmed;
}

/** Mutation tags in the locker's canonical spelling, empty ones dropped. */
export function normalizeMutationsList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeMutationTag).filter(Boolean);
}

export type HarvestCandidate = {
  sizePercent: number;
  mutations: readonly string[] | null | undefined;
};

/** One filter category: whether the settings ask anything of it, and whether the crop matches. */
type FilterResult = { hasCriteria: boolean; matched: boolean };

const SIZE_EPSILON = 0.0001;

function sizeFilter(settings: LockerSettingsPersisted, size: number): FilterResult {
  const mode = settings.scaleLockMode;
  if (mode === "NONE") return { hasCriteria: false, matched: false };
  const { min, max } = normalizeScaleRange(mode, settings.minScalePct, settings.maxScalePct);
  const aboveMin = size + SIZE_EPSILON >= min;
  const belowMax = size - SIZE_EPSILON <= max;
  const matched = mode === "MINIMUM" ? aboveMin : mode === "MAXIMUM" ? belowMax : aboveMin && belowMax;
  return { hasCriteria: true, matched };
}

function colorFilter(settings: LockerSettingsPersisted, mutations: readonly string[]): FilterResult {
  const hasGold = mutations.includes("Gold");
  const hasRainbow = mutations.includes("Rainbow");
  const gold = settings.visualMutations.includes("Gold");
  const rainbow = settings.visualMutations.includes("Rainbow");
  return {
    hasCriteria: settings.avoidNormal || gold || rainbow,
    matched:
      (settings.avoidNormal && !hasGold && !hasRainbow) || (gold && hasGold) || (rainbow && hasRainbow),
  };
}

/**
 * Whether the crop carries a required weather tag: true or false, or null for
 * a tag that names nothing. "No weather" is carried by a crop without any.
 */
function carriesTag(required: unknown, weather: readonly string[]): boolean | null {
  const tag = normalizeMutationTag(required);
  if (!tag) return null;
  if (tag === NO_WEATHER_TAG) return weather.length === 0;
  return weather.includes(tag);
}

/** Every tag carried; a tag naming nothing fails the whole list. */
const carriesAll = (tags: readonly unknown[], weather: readonly string[]) =>
  tags.every((tag) => carriesTag(tag, weather) === true);

function weatherFilter(settings: LockerSettingsPersisted, mutations: readonly string[]): FilterResult {
  const weather = mutations.filter((tag) => tag !== "Gold" && tag !== "Rainbow");

  if (settings.weatherMode === "RECIPES") {
    const recipes = settings.weatherRecipes.filter((recipe) => Array.isArray(recipe) && recipe.length > 0);
    return {
      hasCriteria: settings.weatherRecipes.length > 0,
      matched: recipes.some((recipe) => carriesAll(recipe, weather)),
    };
  }

  const selected = settings.weatherSelected;
  if (!selected.length) return { hasCriteria: false, matched: false };
  const matched =
    settings.weatherMode === "ALL"
      ? carriesAll(selected, weather)
      : selected.some((tag) => carriesTag(tag, weather) === true);
  return { hasCriteria: true, matched };
}

/**
 * LOCK mode blocks a crop that matches any filter that is set. ALLOW mode
 * blocks a crop that misses any filter that is set, so only crops matching
 * every one get through.
 */
export function harvestAllowedBy(settings: LockerSettingsPersisted, crop: HarvestCandidate): boolean {
  const mutations = normalizeMutationsList(crop.mutations);
  const filters = [sizeFilter(settings, crop.sizePercent), colorFilter(settings, mutations), weatherFilter(settings, mutations)];
  const blocked =
    settings.lockMode === "ALLOW"
      ? filters.some((f) => f.hasCriteria && !f.matched)
      : filters.some((f) => f.matched);
  return !blocked;
}
